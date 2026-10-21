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

function qualificationSummary(driver: DriverPrivateDto | null) {
  const status = driver?.verificationStatus;
  if (!driver) {
    return {
      title: 'Qualification not started',
      guidance:
        'Enter your license details and service information, upload your license, then submit for review.',
    };
  }
  switch (status) {
    case 'PENDING':
      return {
        title: 'Under review',
        guidance:
          'Submitted for review. License details and evidence are locked until an administrator decides.',
      };
    case 'APPROVED':
      return {
        title: 'Approved',
        guidance:
          'Qualification is approved. Keep your license details and private evidence current.',
      };
    case 'REJECTED':
      return {
        title: 'Changes requested',
        guidance:
          'Review the feedback, update your details or evidence, then submit a new revision.',
      };
    case 'EXPIRED':
      return {
        title: 'Approval expired',
        guidance:
          'Update your license details and upload current evidence before submitting for review again.',
      };
    default:
      return {
        title: 'Draft saved',
        guidance: 'Add current license evidence, then submit your qualification for review.',
      };
  }
}

export function DriverQualificationPage() {
  const { user } = useAuth();
  const [driver, setDriver] = useState<DriverPrivateDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const allowed = user?.roles.includes('DRIVER') ?? false;
  const status = driver?.verificationStatus ?? 'DRAFT';
  const summary = qualificationSummary(driver);
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
        <Link className="button button-secondary" to="/profile">
          Go to your profile
        </Link>
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
          <section className="qualification-status" aria-label="Qualification status">
            <div className="detail-heading">
              <div>
                <p className="section-kicker">Current status</p>
                <h2>{summary.title}</h2>
              </div>
              <StatusBadge>{status}</StatusBadge>
            </div>
            <p>{summary.guidance}</p>
          </section>
          {driver?.verificationStatus === 'REJECTED' && driver.verificationReason && (
            <section className="review-feedback" aria-label="Review feedback">
              <h2>Review feedback</h2>
              <p>{driver.verificationReason}</p>
            </section>
          )}
          <form
            className="qualification-form"
            key={driver?.id ?? 'new'}
            onSubmit={(event) => void save(event)}
            aria-label="Driver qualification"
          >
            <div className="form-heading">
              <h2>License and service details</h2>
              <p>Private identifiers are used for administrator review only.</p>
            </div>
            <fieldset disabled={busy || status === 'PENDING'}>
              <legend>License details</legend>
              <Field
                id="licenseNumber"
                name="licenseNumber"
                label="License number"
                defaultValue={driver?.licenseNumber ?? ''}
                maxLength={40}
                required
              />
              <div className="form-columns">
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
              </div>
            </fieldset>
            <fieldset disabled={busy || status === 'PENDING'}>
              <legend>Service details</legend>
              <div className="form-columns">
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
              </div>
              <p className="small-text">Payment not collected by DriveHire.</p>
            </fieldset>
            <div className="form-actions">
              <Button type="submit" busy={busy}>
                Save driver details
              </Button>
            </div>
          </form>
          {driver && (
            <>
              <EvidencePanel
                basePath="/drivers/me"
                version={driver.version}
                status={driver.verificationStatus}
                onChanged={reload}
              />
              <section className="qualification-listing">
                <div className="section-heading">
                  <h2>Public availability</h2>
                  <StatusBadge status={driver.acceptingBookings ? 'ACTIVE' : 'PAUSED'}>
                    {driver.acceptingBookings ? 'Accepting bookings' : 'Paused'}
                  </StatusBadge>
                </div>
                <p>
                  {driver.acceptingBookings
                    ? 'Your listing is accepting bookings.'
                    : 'Your listing is paused.'}{' '}
                  Set your driving schedule separately.
                </p>
                <div className="form-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      busy ||
                      (!driver.acceptingBookings && driver.verificationStatus !== 'APPROVED')
                    }
                    onClick={() => void listing()}
                  >
                    {driver.acceptingBookings ? 'Pause listing' : 'Accept bookings'}
                  </Button>
                  <Link className="button button-secondary" to="/driver/availability">
                    Manage your driving schedule
                  </Link>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </ProviderLayout>
  );
}
