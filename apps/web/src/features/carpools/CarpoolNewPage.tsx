import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CarpoolInputSchema,
  CarpoolSchema,
  VehiclePrivateSchema,
  type CarpoolDto,
  type VehiclePrivateDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field } from '../../components/ui/index.js';
import { CitySelect, SelectField } from '../providers/ProviderLayout.js';
import { JourneyLayout, paymentNotice } from '../bookings/JourneyLayout.js';
function local(value: string) {
  const d = new Date(value),
    pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function paise(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw Error('Enter an INR amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 100_000_000)
    throw Error('Price per seat must be between ₹0 and ₹10,00,000.');
  return result;
}
export function CarpoolNewPage() {
  const { id } = useParams();
  const { user } = useAuth(),
    navigate = useNavigate();
  const [vehicles, setVehicles] = useState<VehiclePrivateDto[]>([]),
    [draft, setDraft] = useState<CarpoolDto>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [uncertain, setUncertain] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const rows: VehiclePrivateDto[] = [];
      for (let page = 1; ; page++) {
        const result = await api.requestPage<unknown>(
          `/users/me/vehicles?page=${page}&pageSize=100`,
        );
        rows.push(...result.data.map((row) => VehiclePrivateSchema.parse(row)));
        if (page * result.meta.pageSize >= result.meta.total) break;
      }
      const ride = id
        ? CarpoolSchema.parse(await api.request<unknown>(`/carpools/${id}`))
        : undefined;
      if (ride && ride.status !== 'DRAFT')
        throw Error('Published rides cannot be edited. Cancel and create a new ride.');
      if (active) {
        setVehicles(rows.filter((row) => row.verificationStatus === 'APPROVED' && !row.archivedAt));
        setDraft(ride);
      }
    })()
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error ? cause.message : 'Could not load approved vehicles.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uncertain) return;
    const form = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      const input = CarpoolInputSchema.parse({
        vehicleId: String(form.get('vehicleId')),
        originCityId: String(form.get('originCityId')),
        destinationCityId: String(form.get('destinationCityId')),
        pickupNote: String(form.get('pickupNote')),
        dropoffNote: String(form.get('dropoffNote')),
        startsAt: new Date(String(form.get('startsAt'))).toISOString(),
        endsAt: new Date(String(form.get('endsAt'))).toISOString(),
        seatsOffered: Number(form.get('seatsOffered')),
        pricePerSeatMinor: paise(String(form.get('price'))),
        joinMode: 'INSTANT',
        ...(draft ? { version: draft.version } : {}),
      });
      let response: unknown;
      try {
        response = await api.request<unknown>(id ? `/carpools/${id}` : '/carpools', {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(input),
        });
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status === 0) setUncertain(true);
        throw cause;
      }
      let ride: CarpoolDto;
      try {
        ride = CarpoolSchema.parse(response);
      } catch {
        setUncertain(true);
        throw Error(
          'The save result could not be confirmed. Check hosted rides before saving again.',
        );
      }
      navigate(`/carpools/${ride.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save the draft. Your entries have been kept.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <JourneyLayout
      title={id ? 'Edit carpool draft' : 'Offer a carpool'}
      introduction="Use your own approved vehicle. A draft stays private and holds no time until you publish it."
    >
      {!user?.roles.includes('DRIVER') ? (
        <EmptyState title="Driver capability is required">
          <Link to="/profile">Enable driver capability</Link>, then complete qualification.
        </EmptyState>
      ) : loading ? (
        <p role="status">Loading your approved vehicles…</p>
      ) : loadError ? (
        <>
          <ErrorState message={loadError} />
          <Button
            onClick={() => {
              setLoading(true);
              setLoadError('');
              setAttempt((n) => n + 1);
            }}
          >
            Reload vehicles
          </Button>
        </>
      ) : !vehicles.length ? (
        <EmptyState title="Add an approved personal vehicle">
          <Link to="/vehicles">Add your vehicle and submit it for review</Link> before offering a
          carpool.
        </EmptyState>
      ) : (
        <form
          key={draft?.version ?? 'new'}
          onSubmit={(event) => void save(event)}
          aria-label="Carpool draft"
        >
          <h2>Ride details</h2>
          {error && <ErrorState message={error} />}
          <SelectField
            id="carpool-vehicle"
            name="vehicleId"
            label="Your vehicle"
            required
            defaultValue={draft?.vehicleId ?? ''}
          >
            <option value="" disabled>
              Choose an approved vehicle
            </option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.make} {vehicle.model} · {vehicle.seats - 1} passenger seats
              </option>
            ))}
          </SelectField>
          <div className="form-columns">
            <CitySelect
              name="originCityId"
              label="Origin"
              defaultValue={draft?.originCityId ?? ''}
            />
            <CitySelect
              name="destinationCityId"
              label="Destination"
              defaultValue={draft?.destinationCityId ?? ''}
            />
          </div>
          <Field
            id="pickup-note"
            name="pickupNote"
            label="Pickup note"
            required
            maxLength={300}
            defaultValue={draft?.pickupNote ?? ''}
            hint="Use a public meeting point. Avoid private contact details."
          />
          <Field
            id="dropoff-note"
            name="dropoffNote"
            label="Dropoff note"
            required
            maxLength={300}
            defaultValue={draft?.dropoffNote ?? ''}
          />
          <div className="form-columns">
            <Field
              id="carpool-starts"
              name="startsAt"
              label="Starts at"
              type="datetime-local"
              required
              defaultValue={draft ? local(draft.startsAt) : ''}
            />
            <Field
              id="carpool-ends"
              name="endsAt"
              label="Ends at"
              type="datetime-local"
              required
              defaultValue={draft ? local(draft.endsAt) : ''}
            />
          </div>
          <p className="small-text">
            Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Allow one hour before
            departure; rides last 15 minutes to 24 hours, within 180 days.
          </p>
          <div className="form-columns">
            <Field
              id="seats-offered"
              name="seatsOffered"
              label="Seats offered"
              type="number"
              min={1}
              max={11}
              required
              defaultValue={draft?.seatsOffered ?? 1}
              hint="Leave one vehicle seat for yourself as driver."
            />
            <Field
              id="seat-price"
              name="price"
              label="Price per seat (INR)"
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              required
              defaultValue={draft ? (draft.pricePerSeatMinor / 100).toFixed(2) : '0.00'}
            />
          </div>
          <p>Passengers join instantly. {paymentNotice}</p>
          <p className="small-text">
            Route, times, seats and price cannot change after publication; cancel and create a new
            ride instead.
          </p>
          {uncertain ? (
            <p role="alert">
              We could not confirm the save. <Link to="/app/carpools">Check hosted rides</Link>{' '}
              before creating another draft.
            </p>
          ) : (
            <Button type="submit" busy={busy}>
              Save draft
            </Button>
          )}
        </form>
      )}
    </JourneyLayout>
  );
}
