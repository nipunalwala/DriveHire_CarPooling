import { useEffect, useState, type FormEvent } from 'react';
import {
  DriverInputSchema,
  DriverPrivateSchema,
  type DriverPrivateDto,
} from '@drivehire/contracts';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { CitySelect, messageOf, ProviderLayout } from './ProviderLayout.js';
import { EvidencePanel } from './EvidencePanel.js';

export function DriverQualificationPage() {
  const { user } = useAuth();
  const [driver, setDriver] = useState<DriverPrivateDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const allowed = user?.roles.includes('DRIVER') ?? false;
  async function reload() {
    setDriver(DriverPrivateSchema.parse(await api.request('/drivers/me')));
  }
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void api
      .request('/drivers/me')
      .then((value) => {
        const parsed = DriverPrivateSchema.parse(value);
        if (active) setDriver(parsed);
      })
      .catch((cause: unknown) => {
        if (active && !(cause instanceof ApiError && cause.status === 404))
          setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [allowed]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const rateText = String(values.hourlyRate);
    const [whole = '0', fraction = ''] = rateText.split('.');
    const hourlyRateMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    const rest = { ...values };
    delete rest.hourlyRate;
    const draft: Record<string, unknown> = {
      ...rest,
      hourlyRateMinor,
      ...(driver ? { version: driver.version } : {}),
    };
    if (!draft.bio) delete draft.bio;
    const parsed = DriverInputSchema.safeParse(draft);
    if (!/^\d+(\.\d{1,2})?$/.test(rateText) || !parsed.success) {
      setError(
        'Check your license details, service city and rate. Use up to two decimal places for the hourly rate. Your draft has been kept.',
      );
      return;
    }
    setBusy(true);
    try {
      setDriver(
        DriverPrivateSchema.parse(
          await api.request('/drivers/me', { method: 'PUT', body: JSON.stringify(parsed.data) }),
        ),
      );
      setNotice('Driver details saved. Upload your license and submit for review.');
    } catch (cause) {
      setError(
        `${messageOf(cause)} Your draft has been kept. Reload status before retrying a conflict.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function listing() {
    if (!driver) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setDriver(
        DriverPrivateSchema.parse(
          await api.request('/drivers/me/listing', {
            method: 'PATCH',
            body: JSON.stringify({ enabled: !driver.acceptingBookings, version: driver.version }),
          }),
        ),
      );
      setNotice(
        driver.acceptingBookings
          ? 'Your public listing is paused.'
          : 'Your public listing is accepting bookings.',
      );
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <ProviderLayout
        title="Driver access required"
        introduction="Enable driver capability in your profile before completing qualification."
      >
        <Link to="/profile">Go to your profile</Link>
      </ProviderLayout>
    );
  return (
    <ProviderLayout
      title="Your driver qualification"
      introduction="Driver capability gives you access to these tools. Qualification approval and a current license are required before accepting work."
    >
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {!loaded ? (
        <p role="status">Loading qualification…</p>
      ) : (
        <>
          <p>
            Qualification: <StatusBadge>{driver?.verificationStatus ?? 'DRAFT'}</StatusBadge>
          </p>
          {driver?.verificationStatus === 'REJECTED' && driver.verificationReason && (
            <section aria-label="Review feedback">
              <h2>Review feedback</h2>
              <p>{driver.verificationReason}</p>
            </section>
          )}
          <form
            key={driver?.id ?? 'new'}
            onSubmit={(event) => void save(event)}
            aria-label="Driver qualification"
          >
            <h2>License and service details</h2>
            <fieldset disabled={busy || driver?.verificationStatus === 'PENDING'}>
              <legend>Private license details</legend>
              <Field
                id="licenseNumber"
                name="licenseNumber"
                label="License number"
                defaultValue={driver?.licenseNumber ?? ''}
                maxLength={40}
                required
              />
              <Field
                id="licenseCountry"
                name="licenseCountry"
                label="License country code"
                hint="Two uppercase letters, for example IN."
                defaultValue={driver?.licenseCountry ?? 'IN'}
                pattern="[A-Z]{2}"
                minLength={2}
                maxLength={2}
                required
              />
              <Field
                id="licenseExpiresOn"
                name="licenseExpiresOn"
                label="License expiry date"
                type="date"
                defaultValue={driver?.licenseExpiresOn ?? ''}
                required
              />
              <CitySelect name="serviceCityId" defaultValue={driver?.cityId ?? ''} />
              <Field
                id="hourlyRate"
                name="hourlyRate"
                label="Hourly rate (INR)"
                type="number"
                min="0.01"
                max="100000"
                step="0.01"
                defaultValue={
                  driver?.hourlyRateMinor ? (driver.hourlyRateMinor / 100).toFixed(2) : ''
                }
                required
              />
              <p className="small-text">Payment not collected by DriveHire.</p>
              <Button type="submit" busy={busy}>
                Save driver details
              </Button>
            </fieldset>
          </form>
          {driver && (
            <>
              <EvidencePanel
                basePath="/drivers/me"
                version={driver.version}
                status={driver.verificationStatus}
                onChanged={reload}
              />
              <section className="profile-section">
                <h2>Public availability</h2>
                <p>
                  {driver.acceptingBookings
                    ? 'Your listing is accepting bookings.'
                    : 'Your listing is paused.'}{' '}
                  Set your driving schedule separately.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    busy || (!driver.acceptingBookings && driver.verificationStatus !== 'APPROVED')
                  }
                  onClick={() => void listing()}
                >
                  {driver.acceptingBookings ? 'Pause listing' : 'Accept bookings'}
                </Button>
                <p>
                  <Link to="/driver/availability">Manage your driving schedule</Link>
                </p>
              </section>
            </>
          )}
        </>
      )}
    </ProviderLayout>
  );
}
