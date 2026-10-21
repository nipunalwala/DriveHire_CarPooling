import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CarpoolSchema,
  SeatRequestSchema,
  type CarpoolDto,
  type SeatRequestDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { Button, EmptyState, ErrorState, Field } from '../../components/ui/index.js';
import { Pages } from '../providers/ProviderLayout.js';
import {
  JourneyLayout,
  JourneyStatus,
  JourneyTime,
  money,
  paymentNotice,
  statusLabel,
} from '../bookings/JourneyLayout.js';
import { useCityNames } from '../carpools/CarpoolsPage.js';

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
  const names = useCityNames();
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
    setRows([]);
    setRides(new Map());
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
      actions={
        <Button variant="secondary" busy={loading} disabled={busy} onClick={reload}>
          Reload seats
        </Button>
      }
    >
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      <div className="journey-toolbar">
        <div className="journey-toolbar-actions">
          {!loading && !error && (
            <p className="journey-result-count" aria-live="polite">
              {total === 1 ? '1 seat booking' : `${total} seat bookings`}
            </p>
          )}
        </div>
      </div>
      {loading ? (
        <p role="status">Loading your seats…</p>
      ) : (
        !error && (
          <>
            {rows.length ? (
              <ul className="record-list journey-list">
                {rows.map((seat) => {
                  const ride = rides.get(seat.carpoolId),
                    canCancel =
                      seat.status === 'ACCEPTED' &&
                      ride?.status === 'PUBLISHED' &&
                      now <= new Date(ride.startsAt).getTime() - 15 * 60000;
                  const origin = ride ? (names.get(ride.originCityId) ?? 'Origin city') : '';
                  const destination = ride
                    ? (names.get(ride.destinationCityId) ?? 'Destination city')
                    : '';
                  return (
                    <li key={seat.id} className="journey-card">
                      <div className="journey-card-heading">
                        <div>
                          <h2>
                            {ride ? (
                              <>
                                {origin} to {destination}
                              </>
                            ) : (
                              'Carpool journey'
                            )}
                          </h2>
                          {ride && (
                            <p className="journey-meta">
                              <JourneyTime value={ride.startsAt} /> · Ride{' '}
                              {statusLabel(ride.status).toLowerCase()}
                            </p>
                          )}
                        </div>
                        <JourneyStatus status={seat.status} />
                      </div>
                      <dl className="record-facts">
                        <div>
                          <dt>Seats</dt>
                          <dd>
                            {seat.seats} {seat.seats === 1 ? 'seat' : 'seats'}
                          </dd>
                        </div>
                        <div>
                          <dt>Estimated total</dt>
                          <dd>{money(seat.seats * seat.pricePerSeatMinor)}</dd>
                        </div>
                        {ride && (
                          <div>
                            <dt>Host</dt>
                            <dd>{ride.hostDisplayName}</dd>
                          </div>
                        )}
                      </dl>
                      <div className="journey-card-actions">
                        <Link
                          className="button button-secondary"
                          to={`/carpools/${seat.carpoolId}`}
                        >
                          View ride
                        </Link>
                      </div>
                      {canCancel && (
                        <form
                          className="journey-inline-form"
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
                setRows([]);
                setRides(new Map());
                setPage(next);
              }}
            />
          </>
        )
      )}
      <p className="small-text">{paymentNotice}</p>
    </JourneyLayout>
  );
}
