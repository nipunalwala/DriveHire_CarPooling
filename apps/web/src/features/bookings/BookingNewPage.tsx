import { useAuth } from '../../auth/AuthProvider.js';
import {
  readJourneyDraft,
  rememberJourneyDraft,
  forgetJourneyDraft,
} from '../journeys/draft-memory.js';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookingSchema,
  DriverSchema,
  QuoteInputSchema,
  QuoteSchema,
  VehiclePrivateSchema,
  type DriverDto,
  type QuoteDto,
  type VehiclePrivateDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { Button, EmptyState, ErrorState, Field } from '../../components/ui/index.js';
import { CitySelect, SelectField } from '../providers/ProviderLayout.js';
import { JourneyLayout, journeyTime, money, paymentNotice } from './JourneyLayout.js';

export function BookingNewPage() {
  const [params] = useSearchParams();
  const driverId = params.get('driverId') ?? '';
  return <BookingForm key={driverId} driverId={driverId} />;
}

function BookingForm({ driverId }: { driverId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const journeyKey = `hire:${driverId}`;
  const [retained] = useState(() => readJourneyDraft(user?.id, journeyKey));
  const [driver, setDriver] = useState<DriverDto>();
  const [vehicles, setVehicles] = useState<VehiclePrivateDto[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState(retained.vehicleId ?? '');
  const [loading, setLoading] = useState(Boolean(driverId));
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<{ quote: QuoteDto; key: string }>();
  useEffect(() => {
    if (!driverId) return;
    let active = true;

    async function load() {
      const [publicDriver, ownVehicles] = await Promise.all([
        api
          .request<unknown>(`/drivers/${encodeURIComponent(driverId)}`)
          .then((data) => DriverSchema.parse(data)),
        (async () => {
          const all: VehiclePrivateDto[] = [];
          for (let page = 1; ; page++) {
            const result = await api.requestPage<unknown>(
              `/users/me/vehicles?page=${page}&pageSize=100`,
            );
            all.push(...result.data.map((row) => VehiclePrivateSchema.parse(row)));
            if (page * result.meta.pageSize >= result.meta.total) break;
          }
          return all.filter((row) => row.verificationStatus === 'APPROVED' && !row.archivedAt);
        })(),
      ]);
      if (active) {
        setDriver(publicDriver);
        setVehicles(ownVehicles);
      }
    }
    void load()
      .catch((cause: unknown) => {
        if (active)
          setLoadError(cause instanceof Error ? cause.message : 'Could not load journey details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [driverId, attempt]);
  useEffect(() => {
    if (!estimate) return;
    const timer = window.setTimeout(
      () => {
        setEstimate(undefined);
        setError(
          'Your estimate has expired. Review a new estimate using the journey details below.',
        );
      },
      Math.max(0, new Date(estimate.quote.expiresAt).getTime() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [estimate]);
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || loadError || !driver) return;
    const data = new FormData(event.currentTarget);
    rememberJourneyDraft(user?.id, journeyKey, data);
    setError('');
    setEstimate(undefined);
    const start = new Date(String(data.get('startsAt') ?? ''));
    const end = new Date(String(data.get('endsAt') ?? ''));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError('Choose a valid start and end, with the end after the start.');
      return;
    }
    const input = QuoteInputSchema.safeParse({
      service: 'DRIVER_HIRE',
      driverId: driver.id,
      vehicleId: data.get('vehicleId'),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      originCityId: data.get('originCityId'),
      destinationCityId: data.get('destinationCityId'),
      passengers: Number(data.get('passengers')),
    });
    if (!input.success) {
      setError(
        'Check the vehicle, cities, passenger count and journey times. Your entries have been kept.',
      );
      return;
    }
    setBusy(true);
    try {
      const quote = QuoteSchema.parse(
        await api.request<unknown>('/booking-quotes', {
          method: 'POST',
          body: JSON.stringify(input.data),
        }),
      );
      setEstimate({ quote, key: crypto.randomUUID() });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not calculate an estimate. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!estimate || busy) return;
    if (new Date(estimate.quote.expiresAt).getTime() <= Date.now()) {
      setEstimate(undefined);
      setError('Your estimate has expired. Review a new estimate before sending a request.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const booking = BookingSchema.parse(
        await api.request<unknown>('/bookings', {
          method: 'POST',
          headers: { 'Idempotency-Key': estimate.key },
          body: JSON.stringify({ quoteId: estimate.quote.id }),
        }),
      );
      forgetJourneyDraft(user?.id, journeyKey);
      navigate(`/app/bookings/${booking.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && [403, 404, 409, 410, 422].includes(cause.status)) {
        setEstimate(undefined);
        setError(`Review a new estimate before trying again. ${cause.message}`);
      } else {
        setError(
          cause instanceof ApiError && cause.status !== 0
            ? cause.message
            : 'We could not confirm whether your request was saved. Retry this same estimate or check Your bookings before making a new request.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  const vehicle = vehicles.find((row) => row.id === selectedVehicle);
  return (
    <JourneyLayout
      title="Request a driver"
      introduction="Choose your vehicle and journey, review the estimate, then send a request. A request becomes confirmed only when the driver accepts."
    >
      {!driverId ? (
        <EmptyState title="Choose a driver first">
          <Link to="/drivers">Find a driver</Link> to begin your request.
        </EmptyState>
      ) : (
        <>
          {loadError && (
            <>
              <ErrorState message={loadError} />
              <Button
                variant="secondary"
                onClick={() => {
                  setLoading(true);
                  setLoadError('');
                  setEstimate(undefined);
                  setAttempt((value) => value + 1);
                }}
              >
                Reload journey details
              </Button>
            </>
          )}
          {loading && <p role="status">Loading the driver and your approved vehicles…</p>}
          {driver && (
            <section className="journey-summary">
              <h2>{driver.displayName}</h2>
              <p>{money(driver.hourlyRateMinor)} per hour · Current rate</p>
              <Link to="/drivers">Choose a different driver</Link>
            </section>
          )}
          {!loading && !loadError && vehicles.length === 0 && (
            <EmptyState title="An approved personal vehicle is needed">
              <Link to="/vehicles">Register or manage your vehicle</Link> and complete qualification
              before requesting a driver.
            </EmptyState>
          )}
          {Object.keys(retained).length > 0 && (
            <p role="status">
              Your previous journey details are restored in this tab. Review a new estimate before
              sending a request.
            </p>
          )}
          {error && <ErrorState message={error} />}
          <form
            onSubmit={(event) => void review(event)}
            onChange={(event) => {
              rememberJourneyDraft(user?.id, journeyKey, new FormData(event.currentTarget));
              setEstimate(undefined);
              setError('');
            }}
          >
            <fieldset
              disabled={busy || loading || Boolean(loadError) || !driver || vehicles.length === 0}
            >
              <legend>Journey details</legend>
              <SelectField
                id="booking-vehicle"
                name="vehicleId"
                label="Your vehicle"
                value={selectedVehicle}
                required
                onChange={(event) => setSelectedVehicle(event.target.value)}
              >
                <option value="">Choose an approved vehicle</option>
                {vehicles.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.make} {row.model} · {row.registrationNumber} · {row.seats} seats
                  </option>
                ))}
              </SelectField>
              <div className="form-columns">
                <Field
                  defaultValue={retained.startsAt}
                  id="booking-start"
                  name="startsAt"
                  label="Starts at"
                  type="datetime-local"
                  required
                />
                <Field
                  defaultValue={retained.endsAt}
                  id="booking-end"
                  name="endsAt"
                  label="Ends at"
                  type="datetime-local"
                  required
                />
              </div>
              <p className="small-text">
                Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Allow at least one
                hour before departure. Journeys may last 1–720 hours, within the next 180 days.
              </p>
              <div className="form-columns">
                <CitySelect
                  name="originCityId"
                  label="Origin"
                  defaultValue={retained.originCityId ?? ''}
                />
                <CitySelect
                  name="destinationCityId"
                  label="Destination"
                  defaultValue={retained.destinationCityId ?? ''}
                />
              </div>
              <Field
                id="booking-passengers"
                name="passengers"
                label="Passengers"
                type="number"
                min="1"
                max={vehicle ? vehicle.seats - 1 : 11}
                defaultValue={retained.passengers ?? '1'}
                required
                hint="Include yourself; leave one seat for the hired driver."
              />
              <Button type="submit" busy={busy}>
                Review estimate
              </Button>
            </fieldset>
          </form>
          {estimate && (
            <section className="estimate-panel" aria-live="polite">
              <h2>Your estimate</h2>
              <p className="journey-price">{money(estimate.quote.totalMinor)}</p>
              <p>
                {estimate.quote.billableHours} billable{' '}
                {estimate.quote.billableHours === 1 ? 'hour' : 'hours'} · Driver service only
              </p>
              <dl className="journey-facts">
                <dt>Starts</dt>
                <dd>{journeyTime(estimate.quote.startsAt)}</dd>
                <dt>Ends</dt>
                <dd>{journeyTime(estimate.quote.endsAt)}</dd>
                <dt>Estimate valid until</dt>
                <dd>{journeyTime(estimate.quote.expiresAt)}</dd>
              </dl>
              <p>{paymentNotice}</p>
              <p>Send a request for the driver to review. This does not confirm your booking.</p>
              <Button type="button" busy={busy} onClick={() => void send()}>
                Send request
              </Button>
            </section>
          )}
        </>
      )}
      {!estimate && <p className="small-text">{paymentNotice}</p>}
    </JourneyLayout>
  );
}
