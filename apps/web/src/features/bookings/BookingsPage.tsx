import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BookingSchema, type BookingDto } from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field } from '../../components/ui/index.js';
import { Pages, SelectField } from '../providers/ProviderLayout.js';
import {
  JourneyLayout,
  JourneyStatus,
  JourneyTime,
  JourneyUnavailable,
  isNotFound,
  money,
  paymentNotice,
  statusLabel,
} from './JourneyLayout.js';

const bookingStatuses = [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
  'FAILED',
];

function bookingStatusHelp(status: string) {
  switch (status) {
    case 'PENDING':
      return 'Waiting for the driver’s decision. This request is not confirmed yet.';
    case 'CONFIRMED':
      return 'The driver accepted this request. The journey is confirmed.';
    case 'REJECTED':
      return 'The driver declined this request. Choose a driver for a new request.';
    case 'CANCELLED':
      return 'This booking was cancelled.';
    case 'EXPIRED':
      return 'The decision window closed before the driver responded.';
    case 'COMPLETED':
      return 'The journey is complete.';
    case 'FAILED':
      return 'The journey was closed after a recorded failure.';
    default:
      return statusLabel(status);
  }
}

export function BookingsPage({ driver = false }: { driver?: boolean }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<BookingDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const status = driver ? '' : (params.get('status') ?? '');
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const search = params.toString();
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
  }, [driver, denied, page, status, search, attempt]);
  function changeStatus(value: string) {
    const query = new URLSearchParams(params);
    if (value) query.set('status', value);
    else query.delete('status');
    query.set('page', '1');
    beginLoad();
    setParams(query);
    setAttempt((count) => count + 1);
  }
  function changePage(next: number) {
    const query = new URLSearchParams(params);
    query.set('page', String(next));
    beginLoad();
    setParams(query);
  }
  function reload() {
    beginLoad();
    setAttempt((count) => count + 1);
  }
  return (
    <JourneyLayout
      title={driver ? 'Driver requests' : 'Your bookings'}
      introduction={
        driver
          ? 'Review requests for your driving services. Accepting confirms a request; trip progress is recorded separately.'
          : 'Follow your driver requests and confirmed journeys. Reload to see the latest decisions.'
      }
      actions={
        driver ? (
          <Link className="button button-secondary" to="/app/driver/dashboard">
            Driver dashboard
          </Link>
        ) : (
          <Link className="button button-primary" to="/drivers">
            Find a driver
          </Link>
        )
      }
    >
      {denied ? (
        <EmptyState title="Driver capability is needed">
          <Link to="/profile">Visit your profile</Link> to manage your capabilities.
        </EmptyState>
      ) : (
        <>
          <div className="journey-toolbar">
            {!driver && (
              <SelectField
                id="booking-status"
                label="Booking status"
                value={status}
                onChange={(event) => changeStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                {bookingStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </SelectField>
            )}
            <div className="journey-toolbar-actions">
              {!loading && !error && (
                <p className="journey-result-count" aria-live="polite">
                  {total === 1 ? '1 booking' : `${total} bookings`}
                </p>
              )}
              <Button variant="secondary" busy={loading} onClick={reload}>
                Reload bookings
              </Button>
            </div>
          </div>
          {error && <ErrorState message={error} />}
          {loading ? (
            <p role="status">Loading bookings…</p>
          ) : (
            !error && (
              <>
                {rows.length ? (
                  <ul className="record-list journey-list">
                    {rows.map((row) => (
                      <li key={row.id} className="journey-card">
                        <div className="journey-card-heading">
                          <div>
                            <h2>
                              <JourneyTime value={row.startsAt} />
                            </h2>
                            <p className="journey-meta">
                              Until <JourneyTime value={row.endsAt} />
                            </p>
                          </div>
                          <JourneyStatus status={row.status} />
                        </div>
                        <p>{bookingStatusHelp(row.status)}</p>
                        <dl className="record-facts">
                          <div>
                            <dt>Estimated total</dt>
                            <dd>{money(row.totalMinor)}</dd>
                          </div>
                          <div>
                            <dt>Request reference</dt>
                            <dd>{row.id}</dd>
                          </div>
                        </dl>
                        <div className="journey-card-actions">
                          <Link className="button button-secondary" to={`/app/bookings/${row.id}`}>
                            View booking
                          </Link>
                        </div>
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
                <Pages page={page} hasMore={page * 20 < total} busy={loading} onPage={changePage} />
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
  const [missing, setMissing] = useState(false);
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
          setMissing(false);
          setStale(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          if (isNotFound(cause)) setMissing(true);
          else
            setError(cause instanceof Error ? cause.message : 'This booking could not be loaded.');
        }
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
      actions={
        <Button
          variant="secondary"
          busy={loading}
          disabled={busy}
          onClick={() => {
            setMissing(false);
            setNotice('');
            setLoading(true);
            setError('');
            setAttempt((value) => value + 1);
          }}
        >
          Reload booking
        </Button>
      }
    >
      {missing ? (
        <JourneyUnavailable
          title="Booking unavailable"
          to="/app/bookings"
          action="Return to your bookings"
        />
      ) : (
        <>
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
                <section className="journey-detail-card" aria-label="Saved booking">
                  <div className="journey-card-heading">
                    <div>
                      <h2>Driver hire</h2>
                      <p className="journey-meta">
                        <JourneyTime value={booking.startsAt} /> to{' '}
                        <JourneyTime value={booking.endsAt} />
                      </p>
                    </div>
                    <JourneyStatus status={booking.status} />
                  </div>
                  <p>{bookingStatusHelp(booking.status)}</p>
                  {booking.status === 'PENDING' && (
                    <p>
                      The driver has until <JourneyTime value={booking.expiresAt} /> to respond.
                      This request is not confirmed.
                    </p>
                  )}
                  <p className="journey-price">
                    {money(booking.totalMinor)} <span>estimated total</span>
                  </p>
                  <p>{paymentNotice}</p>
                  <dl className="record-facts">
                    <div>
                      <dt>Starts</dt>
                      <dd>
                        <JourneyTime value={booking.startsAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>Ends</dt>
                      <dd>
                        <JourneyTime value={booking.endsAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>Driver decision</dt>
                      <dd>{statusLabel(booking.decisions[0]?.status ?? 'PENDING')}</dd>
                    </div>
                    <div>
                      <dt>Request reference</dt>
                      <dd>{booking.id}</dd>
                    </div>
                  </dl>
                  <div className="journey-card-actions">
                    <Link
                      className={canDecide ? 'button button-secondary' : 'button button-primary'}
                      to={`/app/trips/${booking.tripId}`}
                    >
                      View trip
                    </Link>
                  </div>
                </section>
                {canDecide && (
                  <form
                    className="journey-action-panel"
                    key={booking.id}
                    onSubmit={decide}
                    noValidate
                  >
                    <fieldset disabled={busy || loading || stale}>
                      <legend>Your decision</legend>
                      <p>Accepting confirms the request. Rejecting closes it with a reason.</p>
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
                    className="journey-action-panel"
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
                    <Link to="/drivers">Find a driver for a new request</Link>. Choose a new
                    estimate; completed requests cannot be reassigned.
                  </p>
                )}
              </>
            )
          )}
        </>
      )}
    </JourneyLayout>
  );
}
