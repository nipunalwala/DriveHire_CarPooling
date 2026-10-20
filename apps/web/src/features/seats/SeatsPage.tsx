import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CarpoolSchema,
  SeatRequestSchema,
  type CarpoolDto,
  type SeatRequestDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { Pages } from '../providers/ProviderLayout.js';
import { JourneyLayout, journeyTime, money, paymentNotice } from '../bookings/JourneyLayout.js';
export function SeatsPage() {
  const [rows, setRows] = useState<SeatRequestDto[]>([]),
    [rides, setRides] = useState<Map<string, CarpoolDto>>(new Map()),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [attempt, setAttempt] = useState(0),
    [now, setNow] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await api.requestPage<unknown>(
          `/users/me/seat-requests?page=${page}&pageSize=20`,
        ),
        seats = result.data.map((row) => SeatRequestSchema.parse(row));
      const unique = [...new Set(seats.map((seat) => seat.carpoolId))],
        parents = await Promise.all(
          unique.map(async (id) =>
            CarpoolSchema.parse(await api.request<unknown>(`/carpools/${id}`)),
          ),
        );
      if (active) {
        setNow(Date.now());
        setRows(seats);
        setTotal(result.meta.total);
        setRides(new Map(parents.map((ride) => [ride.id, ride])));
        setStale(false);
      }
    })()
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Your seats could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, attempt]);
  function reload() {
    setLoading(true);
    setError('');
    setAttempt((n) => n + 1);
  }
  async function cancel(event: FormEvent<HTMLFormElement>, seat: SeatRequestDto) {
    event.preventDefault();
    if (busy || stale || loading) return;
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      SeatRequestSchema.parse(
        await api.request<unknown>(`/seat-requests/${seat.id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ version: seat.version, ...(reason ? { reason } : {}) }),
        }),
      );
      setNotice('Your seats were cancelled.');
      reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status !== 0 && cause.status !== 409)
        setError(cause.message);
      else {
        setStale(true);
        setError(
          cause instanceof ApiError && cause.status === 409
            ? 'Participation changed. Reload seats before trying again.'
            : 'We could not confirm whether cancellation was saved. Reload seats before trying again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <JourneyLayout
      title="Your carpool seats"
      introduction="See current participation and past journeys. Accepted seats remain in history when a ride completes or fails."
    >
      <Button variant="secondary" busy={loading} disabled={busy} onClick={reload}>
        Reload seats
      </Button>
      {error && <ErrorState message={error} />}{' '}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      <p>{paymentNotice}</p>
      {loading ? (
        <p role="status">Loading your seats…</p>
      ) : (
        <>
          {rows.length ? (
            <ul className="record-list">
              {rows.map((seat) => {
                const ride = rides.get(seat.carpoolId),
                  canCancel =
                    seat.status === 'ACCEPTED' &&
                    ride?.status === 'PUBLISHED' &&
                    now <= new Date(ride.startsAt).getTime() - 15 * 60000;
                return (
                  <li key={seat.id}>
                    <StatusBadge>{seat.status}</StatusBadge>
                    <h2>{ride?.hostDisplayName ?? 'Carpool journey'}</h2>
                    {ride && (
                      <p>
                        {journeyTime(ride.startsAt)} ·{' '}
                        {ride.status === 'COMPLETED'
                          ? 'Ride completed'
                          : ride.status === 'FAILED'
                            ? 'Ride failed'
                            : `Ride ${ride.status.toLowerCase()}`}
                      </p>
                    )}
                    <p>
                      {seat.seats} {seat.seats === 1 ? 'seat' : 'seats'} ·{' '}
                      {money(seat.seats * seat.pricePerSeatMinor)} estimate
                    </p>
                    <p>
                      <Link to={`/carpools/${seat.carpoolId}`}>View ride</Link>
                    </p>
                    {canCancel && (
                      <form
                        onSubmit={(event) => void cancel(event, seat)}
                        aria-label="Cancel carpool seats"
                      >
                        <Field
                          id={`seat-reason-${seat.id}`}
                          name="reason"
                          label="Cancellation reason"
                          minLength={10}
                          maxLength={1000}
                          required
                        />
                        <Button variant="secondary" busy={busy} disabled={stale} type="submit">
                          Cancel seats
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No carpool seats yet">
              <Link to="/carpools">Find a carpool</Link> and join an available ride instantly.
            </EmptyState>
          )}
          <Pages
            page={page}
            hasMore={page * 20 < total}
            busy={loading || busy}
            onPage={(next) => {
              setLoading(true);
              setError('');
              setPage(next);
            }}
          />
        </>
      )}
    </JourneyLayout>
  );
}
