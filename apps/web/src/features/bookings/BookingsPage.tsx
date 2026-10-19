import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookingSchema, type BookingDto } from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { Pages, SelectField } from '../providers/ProviderLayout.js';
import { JourneyLayout, journeyTime, money, paymentNotice } from './JourneyLayout.js';

export function BookingsPage({ driver = false }: { driver?: boolean }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<BookingDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  function beginLoad() {
    setLoading(true);
    setRows([]);
    setTotal(0);
    setError('');
  }
  const denied = driver && !user?.roles.includes('DRIVER');
  useEffect(() => {
    if (denied) return;
    let active = true;

    const path = driver ? '/drivers/me/bookings' : '/bookings';
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (!driver && status) query.set('status', status);
    void api
      .requestPage<unknown>(`${path}?${query.toString()}`)
      .then((result) => {
        const data = result.data.map((row) => BookingSchema.parse(row));
        if (active) {
          setRows(data);
          setTotal(result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load bookings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [driver, denied, page, status, attempt]);
  return (
    <JourneyLayout
      title={driver ? 'Driver requests' : 'Your bookings'}
      introduction={
        driver
          ? 'Review requests for your driving services. Accepting confirms a request; trip progress is recorded separately.'
          : 'Follow your driver requests and confirmed journeys. Reload to see the latest decisions.'
      }
    >
      {denied ? (
        <EmptyState title="Driver capability is needed">
          <Link to="/profile">Visit your profile</Link> to manage your capabilities.
        </EmptyState>
      ) : (
        <>
          {!driver && (
            <SelectField
              id="booking-status"
              label="Booking status"
              value={status}
              onChange={(event) => {
                beginLoad();
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {[
                'PENDING',
                'CONFIRMED',
                'REJECTED',
                'CANCELLED',
                'EXPIRED',
                'COMPLETED',
                'FAILED',
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectField>
          )}
          <Button
            variant="secondary"
            busy={loading}
            onClick={() => {
              beginLoad();
              setAttempt((value) => value + 1);
            }}
          >
            Reload bookings
          </Button>
          {error && <ErrorState message={error} />}
          {loading ? (
            <p role="status">Loading bookings…</p>
          ) : (
            !error && (
              <>
                {rows.length ? (
                  <ul className="record-list">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <StatusBadge>{row.status}</StatusBadge>
                        <h2>{journeyTime(row.startsAt)}</h2>
                        <p>Until {journeyTime(row.endsAt)}</p>
                        <p>{money(row.totalMinor)} · Estimate</p>
                        <p className="small-text">Request reference: {row.id}</p>
                        <Link className="button button-secondary" to={`/app/bookings/${row.id}`}>
                          View booking
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No bookings match">
                    {driver ? (
                      'Requests for your services will appear here. Check your listing and driving schedule if you are ready for work.'
                    ) : (
                      <>
                        <Link to="/drivers">Find a driver</Link> or change the status filter to see
                        another booking.
                      </>
                    )}
                  </EmptyState>
                )}
                <Pages
                  page={page}
                  hasMore={page * 20 < total}
                  busy={loading}
                  onPage={(value) => {
                    beginLoad();
                    setPage(value);
                  }}
                />
              </>
            )
          )}
        </>
      )}
      <p className="small-text">{paymentNotice}</p>
    </JourneyLayout>
  );
}

export function BookingDetailPage() {
  const { id = '' } = useParams();
  return <BookingDetails key={id} id={id} />;
}

function BookingDetails({ id }: { id: string }) {
  const { user } = useAuth();
  const [booking, setBooking] = useState<BookingDto>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;

    void api
      .request<unknown>(`/bookings/${encodeURIComponent(id)}`)
      .then((data) => {
        const row = BookingSchema.parse(data);
        if (active) {
          setBooking(row);
          setStale(false);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'This booking could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  async function mutate(action: 'ACCEPT' | 'REJECT' | 'CANCEL', reason: string) {
    if (!booking || busy || loading || stale) return;
    if ((action !== 'ACCEPT' || reason) && (reason.trim().length < 10 || reason.length > 1000)) {
      setError('Give a reason between 10 and 1,000 characters. Your entry has been kept.');
      return;
    }
    const captured = booking;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload =
        action === 'CANCEL'
          ? { version: captured.version, reason: reason.trim() }
          : {
              version: captured.version,
              decision: action,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            };
      const row = BookingSchema.parse(
        await api.request<unknown>(
          `/bookings/${captured.id}/${action === 'CANCEL' ? 'cancel' : 'decisions'}`,
          { method: 'POST', body: JSON.stringify(payload) },
        ),
      );
      setBooking(row);
      setNotice(
        action === 'ACCEPT'
          ? 'Request accepted. The booking is now confirmed.'
          : action === 'REJECT'
            ? 'Request rejected.'
            : 'Booking cancelled.',
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setStale(true);
        setError(
          `The booking has changed or this action is no longer available. Reload booking before trying again. ${cause.message}`,
        );
      } else if (cause instanceof ApiError && cause.status !== 0) {
        setError(cause.message);
      } else {
        setStale(true);
        setError(
          'We could not confirm whether the change was saved. Reload booking before trying again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
      ?.value;
    if (action !== 'ACCEPT' && action !== 'REJECT') return;
    void mutate(action, String(new FormData(event.currentTarget).get('reason') ?? ''));
  }
  const canDecide =
    booking?.status === 'PENDING' &&
    booking.decisions[0]?.providerId === user?.id &&
    user?.roles.includes('DRIVER');
  const participant =
    booking &&
    (booking.passengerId === user?.id ||
      booking.decisions[0]?.providerId === user?.id ||
      user?.roles.includes('ADMIN'));
  const canCancel = participant && booking && ['PENDING', 'CONFIRMED'].includes(booking.status);
  return (
    <JourneyLayout
      title="Booking details"
      introduction="Check the saved request, driver decision and journey status. Reload before acting on information that may have changed."
    >
      <Button
        variant="secondary"
        busy={loading}
        disabled={busy}
        onClick={() => {
          setNotice('');
          setLoading(true);
          setError('');
          setAttempt((value) => value + 1);
        }}
      >
        Reload booking
      </Button>
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {loading && !booking ? (
        <p role="status">Loading booking…</p>
      ) : (
        booking && (
          <>
            <section aria-label="Saved booking">
              <StatusBadge>{booking.status}</StatusBadge>
              {booking.status === 'PENDING' && (
                <p>
                  Waiting for the driver’s decision. This request is not confirmed. Decision
                  deadline: {journeyTime(booking.expiresAt)}.
                </p>
              )}
              <p className="journey-price">
                {money(booking.totalMinor)} <span>estimated total</span>
              </p>
              <p>{paymentNotice}</p>
              <dl className="journey-facts">
                <dt>Starts</dt>
                <dd>{journeyTime(booking.startsAt)}</dd>
                <dt>Ends</dt>
                <dd>{journeyTime(booking.endsAt)}</dd>
                <dt>Driver decision</dt>
                <dd>{booking.decisions[0]?.status}</dd>
                <dt>Request reference</dt>
                <dd>{booking.id}</dd>
              </dl>
              <Link className="button button-secondary" to={`/app/trips/${booking.tripId}`}>
                View trip
              </Link>
            </section>
            {canDecide && (
              <form key={booking.id} onSubmit={decide} noValidate>
                <fieldset disabled={busy || loading || stale}>
                  <legend>Your decision</legend>
                  <Field
                    id="decision-reason"
                    name="reason"
                    label="Reason"
                    maxLength={1000}
                    hint="Required to reject. Use at least 10 characters."
                  />
                  <div className="action-row">
                    <Button type="submit" name="decision" value="ACCEPT" busy={busy}>
                      Accept request
                    </Button>
                    <Button
                      type="submit"
                      name="decision"
                      value="REJECT"
                      variant="secondary"
                      disabled={busy}
                    >
                      Reject request
                    </Button>
                  </div>
                </fieldset>
              </form>
            )}
            {canCancel && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(
                    'CANCEL',
                    String(new FormData(event.currentTarget).get('reason') ?? ''),
                  );
                }}
              >
                <fieldset disabled={busy || loading || stale}>
                  <legend>Cancel booking</legend>
                  <p>
                    Cancellation depends on the journey’s start time and current trip state. To
                    change the driver or vehicle, cancel and request a new estimate.
                  </p>
                  <Field
                    id="cancellation-reason"
                    name="reason"
                    label="Cancellation reason"
                    required
                    minLength={10}
                    maxLength={1000}
                  />
                  <Button type="submit" variant="secondary" busy={busy}>
                    Cancel booking
                  </Button>
                </fieldset>
              </form>
            )}
            {['REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(booking.status) && (
              <p>
                <Link to="/drivers">Find a driver for a new request</Link>. Choose a new estimate;
                completed requests cannot be reassigned.
              </p>
            )}
          </>
        )
      )}
    </JourneyLayout>
  );
}
