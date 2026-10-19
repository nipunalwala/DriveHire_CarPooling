import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DriverPrivateSchema,
  TripSchema,
  HistoryEntrySchema,
  type TripDto,
  type HistoryEntryDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { Pages } from '../providers/ProviderLayout.js';
import { JourneyLayout, journeyTime } from '../bookings/JourneyLayout.js';

export function TripPage() {
  const { id = '' } = useParams();
  return <TripDetails key={id} id={id} />;
}
function TripDetails({ id }: { id: string }) {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles.includes('ADMIN'));
  const isDriver = Boolean(user?.roles.includes('DRIVER'));
  const [trip, setTrip] = useState<TripDto>();
  const [ownDriverId, setOwnDriverId] = useState('');
  const [history, setHistory] = useState<HistoryEntryDto[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [snapshotTime, setSnapshotTime] = useState(0);
  useEffect(() => {
    let active = true;
    const ownDriver = isDriver
      ? api
          .request<unknown>('/drivers/me')
          .then((data) => DriverPrivateSchema.parse(data).id)
          .catch((cause: unknown) => {
            if (cause instanceof ApiError && cause.status === 404) return '';
            throw cause;
          })
      : Promise.resolve('');
    void Promise.all([
      api
        .request<unknown>(`/trips/${encodeURIComponent(id)}`)
        .then((data) => TripSchema.parse(data)),
      api.requestPage<unknown>(
        `/trips/${encodeURIComponent(id)}/history?page=${historyPage}&pageSize=20`,
      ),
      ownDriver,
    ])
      .then(([row, entries, driverId]) => {
        const parsed = entries.data.map((entry) => HistoryEntrySchema.parse(entry));
        if (active) {
          setTrip(row);
          setSnapshotTime(Date.now());
          setHistory(parsed);
          setTotal(entries.meta.total);
          setOwnDriverId(driverId);
          setStale(false);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Could not load the trip and its history. Reload to try again.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, historyPage, attempt, isDriver]);
  function reload() {
    setLoading(true);
    setError('');
    setAttempt((value) => value + 1);
  }
  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip || busy || loading || stale) return;
    const toStatus = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
      ?.value;
    if (!['STARTED', 'IN_TRANSIT', 'COMPLETED', 'FAILED'].includes(toStatus ?? '')) return;
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (
      ((toStatus === 'FAILED' || isAdmin) && reason.length < 10) ||
      (reason && reason.length < 10) ||
      reason.length > 1000
    ) {
      setError(
        'Give a reason between 10 and 1,000 characters for a failure or administrator action. Your entry has been kept.',
      );
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const row = TripSchema.parse(
        await api.request<unknown>(`/trips/${trip.id}/transitions`, {
          method: 'POST',
          body: JSON.stringify({ toStatus, version: trip.version, ...(reason ? { reason } : {}) }),
        }),
      );
      setTrip(row);
      setSnapshotTime(Date.now());
      setNotice('Trip status saved.');
      setHistoryPage(1);
      reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setStale(true);
        setError(
          `This action is no longer available or the trip has changed. Reload trip before trying again. ${cause.message}`,
        );
      } else if (cause instanceof ApiError && cause.status !== 0) setError(cause.message);
      else {
        setStale(true);
        setError(
          'We could not confirm whether the change was saved. Reload trip before trying again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  const canOperate = Boolean(trip && (isAdmin || (isDriver && ownDriverId === trip.driverId)));
  const activeTrip = trip && ['STARTED', 'IN_TRANSIT'].includes(trip.status);
  const now = snapshotTime;
  const startOpens = trip ? new Date(trip.startsAt).getTime() - 15 * 60_000 : 0;
  const startCloses = trip ? new Date(trip.startsAt).getTime() + 30 * 60_000 : 0;
  return (
    <JourneyLayout
      title="Trip details"
      introduction="Follow the actual journey. The assigned driver or an administrator records each trip action; the scheduled end does not complete a trip."
    >
      <Button variant="secondary" busy={loading} disabled={busy} onClick={reload}>
        Reload trip
      </Button>
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {loading && !trip ? (
        <p role="status">Loading trip…</p>
      ) : (
        trip && (
          <>
            <section aria-label="Saved trip">
              <StatusBadge>{trip.status}</StatusBadge>
              <dl className="journey-facts">
                <dt>Planned start</dt>
                <dd>{journeyTime(trip.startsAt)}</dd>
                <dt>Planned end</dt>
                <dd>{journeyTime(trip.endsAt)}</dd>
                <dt>Trip reference</dt>
                <dd>{trip.id}</dd>
              </dl>
              {trip.incidentFlag && (
                <p role="status">
                  An incident is flagged for administrator review. The recorded trip state remains
                  in effect.
                </p>
              )}
              {activeTrip && now > new Date(trip.endsAt).getTime() && (
                <p role="status">
                  The planned end has passed. This trip remains active until completion or a
                  recorded failure.
                </p>
              )}
              {trip.status === 'SCHEDULED' && (
                <p>
                  The booking is awaiting confirmation. Trip actions become available after the
                  driver accepts.
                </p>
              )}
            </section>
            {canOperate && ['ASSIGNED', 'STARTED', 'IN_TRANSIT'].includes(trip.status) && (
              <form onSubmit={(event) => void transition(event)} noValidate>
                <fieldset disabled={busy || loading || stale}>
                  <legend>Update trip</legend>
                  {trip.status === 'ASSIGNED' && (
                    <p>
                      Start window: {journeyTime(new Date(startOpens).toISOString())} to{' '}
                      {journeyTime(new Date(startCloses).toISOString())}. Reload when the window
                      opens.
                    </p>
                  )}
                  <Field
                    id="trip-reason"
                    name="reason"
                    label="Reason"
                    maxLength={1000}
                    hint="Required for a failure or administrator action; use 10–1,000 characters."
                  />
                  <div className="action-row">
                    {trip.status === 'ASSIGNED' && (
                      <Button
                        type="submit"
                        value="STARTED"
                        busy={busy}
                        disabled={now < startOpens || now > startCloses}
                      >
                        Start trip
                      </Button>
                    )}
                    {trip.status === 'STARTED' && (
                      <Button type="submit" value="IN_TRANSIT" busy={busy}>
                        In transit
                      </Button>
                    )}
                    {trip.status === 'IN_TRANSIT' && (
                      <Button type="submit" value="COMPLETED" busy={busy}>
                        Complete trip
                      </Button>
                    )}
                    {activeTrip && (
                      <Button type="submit" value="FAILED" variant="secondary" disabled={busy}>
                        Report failure
                      </Button>
                    )}
                  </div>
                </fieldset>
              </form>
            )}
            <section aria-label="Trip history">
              <h2>Trip history</h2>
              {history.length ? (
                <ol className="record-list">
                  {history.map((entry) => (
                    <li key={entry.id}>
                      <p>
                        {entry.fromStatus} to {entry.toStatus}
                      </p>
                      <p className="small-text">
                        <time dateTime={entry.createdAt}>{journeyTime(entry.createdAt)}</time>
                      </p>
                      {entry.reason && <p>{entry.reason}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                !loading && (
                  <EmptyState title="No history is available">
                    Reload trip to check for recorded updates.
                  </EmptyState>
                )
              )}
              <Pages
                page={historyPage}
                hasMore={historyPage * 20 < total}
                busy={loading}
                onPage={(value) => {
                  setLoading(true);
                  setError('');
                  setHistory([]);
                  setHistoryPage(value);
                }}
              />
            </section>
            <p>
              <Link to="/app/bookings">Your bookings</Link>
            </p>
          </>
        )
      )}
    </JourneyLayout>
  );
}
