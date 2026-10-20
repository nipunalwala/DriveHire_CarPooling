import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CarpoolSchema,
  SeatRequestSchema,
  TripSchema,
  type CarpoolDto,
  type SeatRequestDto,
  type TripDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { Pages } from '../providers/ProviderLayout.js';
import { JourneyLayout, journeyTime, money, paymentNotice } from '../bookings/JourneyLayout.js';
import { useCityNames } from './CarpoolsPage.js';
export async function ownSeats() {
  const rows: SeatRequestDto[] = [];
  for (let page = 1; ; page++) {
    const result = await api.requestPage<unknown>(
      `/users/me/seat-requests?page=${page}&pageSize=100`,
    );
    rows.push(...result.data.map((row) => SeatRequestSchema.parse(row)));
    if (page * result.meta.pageSize >= result.meta.total) break;
  }
  return rows;
}
export function CarpoolDetailPage() {
  const { id = '' } = useParams(),
    { user } = useAuth(),
    names = useCityNames();
  const [ride, setRide] = useState<CarpoolDto>(),
    [trip, setTrip] = useState<TripDto>(),
    [participation, setParticipation] = useState<SeatRequestDto>(),
    [roster, setRoster] = useState<SeatRequestDto[]>([]),
    [rosterPage, setRosterPage] = useState(1),
    [rosterTotal, setRosterTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [attempt, setAttempt] = useState(0),
    [seats, setSeats] = useState('1'),
    [message, setMessage] = useState(''),
    [now, setNow] = useState(0);
  const key = useRef<{ fingerprint: string; value: string } | undefined>(undefined);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  async function snapshot() {
    const current = CarpoolSchema.parse(await api.request<unknown>(`/carpools/${id}`));
    const host = current.hostId === user?.id,
      admin = Boolean(user?.roles.includes('ADMIN'));
    const [mine, participants, currentTrip] = await Promise.all([
      user?.roles.includes('PASSENGER') && !host ? ownSeats() : Promise.resolve([]),
      host || admin
        ? api.requestPage<unknown>(`/carpools/${id}/seat-requests?page=${rosterPage}&pageSize=20`)
        : Promise.resolve(undefined),
      host || admin
        ? api.request<unknown>(`/trips/${current.tripId}`).then((row) => TripSchema.parse(row))
        : Promise.resolve(undefined),
    ]);
    return {
      current,
      mine: mine.find((seat) => seat.carpoolId === id && seat.status === 'ACCEPTED'),
      participants,
      currentTrip,
    };
  }
  function apply(result: Awaited<ReturnType<typeof snapshot>>) {
    setRide(result.current);
    setParticipation(result.mine);
    setTrip(result.currentTrip);
    setRoster(result.participants?.data.map((row) => SeatRequestSchema.parse(row)) ?? []);
    setRosterTotal(result.participants?.meta.total ?? 0);
    setStale(false);
    setNow(Date.now());
  }
  useEffect(() => {
    let active = true;
    void snapshot()
      .then((result) => {
        if (active) apply(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Ride details could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Snapshot inputs are the route, current actor, explicit reload and roster page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, user?.roles.join(','), attempt, rosterPage]);
  function reload() {
    setLoading(true);
    setError('');
    setNotice('');
    setAttempt((n) => n + 1);
  }
  function fail(cause: unknown) {
    if (cause instanceof ApiError && cause.status !== 0 && cause.status !== 409) {
      setError(cause.message);
      return;
    }
    setStale(true);
    setError(
      cause instanceof ApiError && cause.status === 409
        ? `The ride or seat availability changed. Reload ride before trying again. ${cause.message}`
        : 'We could not confirm whether the change was saved. Reload ride before trying again.',
    );
  }
  async function action(kind: 'publish' | 'cancel', reason?: string) {
    if (!ride || busy || loading || stale) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      CarpoolSchema.parse(
        await api.request<unknown>(`/carpools/${id}/${kind}`, {
          method: 'POST',
          body: JSON.stringify({ version: ride.version, ...(reason ? { reason } : {}) }),
        }),
      );
      apply(await snapshot());
      setNotice(
        kind === 'publish'
          ? 'Your ride is published. Passengers can join instantly.'
          : 'Ride cancelled. Accepted seats have been cancelled.',
      );
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ride || busy || loading || stale) return;
    const body = { seats: Number(seats), ...(message.trim() ? { message: message.trim() } : {}) },
      fingerprint = JSON.stringify(body);
    if (key.current?.fingerprint !== fingerprint)
      key.current = { fingerprint, value: crypto.randomUUID() };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      SeatRequestSchema.parse(
        await api.request<unknown>(`/carpools/${id}/seat-requests`, {
          method: 'POST',
          headers: { 'Idempotency-Key': key.current!.value },
          body: JSON.stringify(body),
        }),
      );
      const result = await snapshot();
      apply(result);
      setNotice(
        result.mine
          ? 'Your seat is confirmed.'
          : 'Your request was recorded. Check its current state in your carpool seats.',
      );
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }
  const host = ride?.hostId === user?.id,
    admin = Boolean(user?.roles.includes('ADMIN')),
    cutoff = ride ? new Date(ride.startsAt).getTime() - 15 * 60000 : 0,
    open = ride?.status === 'PUBLISHED' && now <= cutoff && ride.availableSeats > 0,
    canCancel = Boolean(
      (host || admin) &&
      ride &&
      ['DRAFT', 'PUBLISHED'].includes(ride.status) &&
      trip &&
      ['SCHEDULED', 'ASSIGNED'].includes(trip.status),
    );
  return (
    <JourneyLayout
      title="Carpool details"
      introduction="Check the saved route, meeting points and available seats. Joining confirms your seats immediately."
    >
      <Button variant="secondary" busy={loading} disabled={busy} onClick={reload}>
        Reload ride
      </Button>
      {error && <ErrorState message={error} />}{' '}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading ride…</p>
      ) : ride ? (
        <>
          <StatusBadge>{ride.status}</StatusBadge>
          <h2>
            {names.get(ride.originCityId) ?? 'Origin city'} to{' '}
            {names.get(ride.destinationCityId) ?? 'Destination city'}
          </h2>
          <p>
            Hosted by {ride.hostDisplayName} · {ride.vehicleSummary.make}{' '}
            {ride.vehicleSummary.model}
          </p>
          <dl className="record-facts">
            <div>
              <dt>Departure</dt>
              <dd>{journeyTime(ride.startsAt)}</dd>
            </div>
            <div>
              <dt>Planned arrival</dt>
              <dd>{journeyTime(ride.endsAt)}</dd>
            </div>
            <div>
              <dt>Pickup</dt>
              <dd>{ride.pickupNote}</dd>
            </div>
            <div>
              <dt>Dropoff</dt>
              <dd>{ride.dropoffNote}</dd>
            </div>
            <div>
              <dt>Available seats</dt>
              <dd>
                {ride.availableSeats === 0
                  ? 'Full'
                  : `${ride.availableSeats} of ${ride.seatsOffered}`}
              </dd>
            </div>
            <div>
              <dt>Price per seat</dt>
              <dd>{money(ride.pricePerSeatMinor)}</dd>
            </div>
          </dl>
          <p>{paymentNotice}</p>
          <p className="small-text">
            Instant joining closes {journeyTime(new Date(cutoff).toISOString())}. A planned arrival
            time never completes a trip automatically.
          </p>
          {host && ride.status === 'DRAFT' && (
            <div className="action-row">
              <Link className="button button-secondary" to={`/app/carpools/${id}/edit`}>
                Edit draft
              </Link>
              <Button busy={busy} disabled={stale} onClick={() => void action('publish')}>
                Publish ride
              </Button>
            </div>
          )}
          {!host && participation ? (
            <section className="profile-section">
              <h2>Your participation</h2>
              <StatusBadge>{participation.status}</StatusBadge>
              <p>
                {participation.seats} {participation.seats === 1 ? 'seat' : 'seats'} ·{' '}
                {money(participation.seats * participation.pricePerSeatMinor)} estimate
              </p>
              <Link to="/app/seats">Manage your carpool seats</Link>
            </section>
          ) : !host && open ? (
            user ? (
              <form onSubmit={(event) => void join(event)} aria-label="Join carpool">
                <h2>Join this ride</h2>
                <Field
                  id="join-seats"
                  label="Seats to join"
                  type="number"
                  min={1}
                  max={ride.availableSeats}
                  required
                  value={seats}
                  onChange={(event) => setSeats(event.target.value)}
                />
                <Field
                  id="join-message"
                  label="Message to host (optional)"
                  maxLength={500}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <p>
                  {money(Number(seats) * ride.pricePerSeatMinor)} estimated total for {seats} seats
                </p>
                <Button type="submit" busy={busy} disabled={stale}>
                  Join instantly
                </Button>
                <p className="small-text">
                  No approval wait. Your place is confirmed only after the server saves it.
                </p>
              </form>
            ) : (
              <p>
                <Link
                  className="button button-primary"
                  to={`/login?next=${encodeURIComponent(`/carpools/${id}`)}`}
                >
                  Sign in to join
                </Link>
              </p>
            )
          ) : (
            !host && (
              <EmptyState
                title={
                  ride.availableSeats === 0 && ride.status === 'PUBLISHED'
                    ? 'This ride is full'
                    : 'Joining is closed'
                }
              >
                Choose another departure or return to search for available rides.
              </EmptyState>
            )
          )}
          {(host || admin) && (
            <>
              <section className="profile-section">
                <h2>Passengers</h2>
                {roster.length ? (
                  <ul className="record-list">
                    {roster.map((seat) => (
                      <li key={seat.id}>
                        <h3>{seat.passengerDisplayName ?? 'Passenger'}</h3>
                        <StatusBadge>{seat.status}</StatusBadge>
                        <p>
                          {seat.seats} {seat.seats === 1 ? 'seat' : 'seats'} ·{' '}
                          {money(seat.seats * seat.pricePerSeatMinor)} estimate
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No passengers have joined yet.</p>
                )}
                <Pages
                  page={rosterPage}
                  hasMore={rosterPage * 20 < rosterTotal}
                  busy={loading || busy}
                  onPage={(next) => {
                    setLoading(true);
                    setRosterPage(next);
                  }}
                />
              </section>
              <p>
                <Link className="button button-secondary" to={`/app/trips/${ride.tripId}`}>
                  View trip
                </Link>
              </p>
            </>
          )}
          {canCancel && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void action(
                  'cancel',
                  String(new FormData(event.currentTarget).get('reason') ?? '').trim(),
                );
              }}
              aria-label="Cancel ride"
            >
              <h2>Cancel ride</h2>
              <p>
                This cancels every accepted seat. To change published details, cancel and create a
                new ride.
              </p>
              <Field
                id="ride-cancel-reason"
                name="reason"
                label="Cancellation reason"
                required
                minLength={10}
                maxLength={1000}
              />
              <Button variant="secondary" type="submit" busy={busy} disabled={stale}>
                Cancel ride
              </Button>
            </form>
          )}
        </>
      ) : null}
    </JourneyLayout>
  );
}
