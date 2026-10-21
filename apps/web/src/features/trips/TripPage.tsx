import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  DriverPrivateSchema,
  TripSchema,
  HistoryEntrySchema,
  type TripDto,
  type HistoryEntryDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field } from '../../components/ui/index.js';
import { Pages } from '../providers/ProviderLayout.js';
import {
  BackLink,
  JourneyLayout,
  JourneyStatus,
  JourneyTime,
  JourneyUnavailable,
  isNotFound,
  statusLabel,
} from '../bookings/JourneyLayout.js';

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
  const [missing, setMissing] = useState(false);
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
          setMissing(false);
          setStale(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          if (isNotFound(cause)) setMissing(true);
          else
            setError(
              cause instanceof ApiError
                ? cause.message
                : 'Could not load the trip and its history. Reload to try again.',
            );
        }
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
    setMissing(false);
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
  const returnTo = isDriver ? '/app/driver/bookings' : '/app/bookings';
  return (
    <JourneyLayout
      title="Trip details"
      introduction="Follow the actual journey. The assigned driver or an administrator records each trip action; the scheduled end does not complete a trip."
      actions={
        <>
          <BackLink to={returnTo}>
            {isDriver ? 'Back to driver requests' : 'Back to your bookings'}
          </BackLink>
          <Button variant="secondary" busy={loading} disabled={busy} onClick={reload}>
            Reload trip
          </Button>
        </>
      }
    >
      {missing ? (
        <JourneyUnavailable
          title="Trip unavailable"
          to={returnTo}
          action={isDriver ? 'Return to driver requests' : 'Return to your bookings'}
        />
      ) : (
        <>
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
                <section className="journey-detail-card" aria-label="Saved trip">
                  <div className="journey-card-heading">
                    <div>
                      <h2>{trip.kind === 'CARPOOL' ? 'Carpool journey' : 'Driver hire journey'}</h2>
                      <p className="journey-meta">
                        Planned <JourneyTime value={trip.startsAt} /> to{' '}
                        <JourneyTime value={trip.endsAt} />
                      </p>
                    </div>
                    <JourneyStatus status={trip.status} />
                  </div>
                  <dl className="record-facts">
                    <div>
                      <dt>Planned start</dt>
                      <dd>
                        <JourneyTime value={trip.startsAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>Planned end</dt>
                      <dd>
                        <JourneyTime value={trip.endsAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>Trip reference</dt>
                      <dd>{trip.id}</dd>
                    </div>
                  </dl>
                  {trip.incidentFlag && (
                    <p role="status">
                      An incident is flagged for administrator review. The recorded trip state
                      remains in effect.
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
                  <form
                    className="journey-action-panel"
                    onSubmit={(event) => void transition(event)}
                    noValidate
                  >
                    <fieldset disabled={busy || loading || stale}>
                      <legend>Update trip</legend>
                      {trip.status === 'ASSIGNED' && (
                        <p>
                          Start window: <JourneyTime value={new Date(startOpens).toISOString()} />{' '}
                          to <JourneyTime value={new Date(startCloses).toISOString()} />. Reload
                          when the window opens.
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
                <section className="journey-detail-card" aria-label="Trip history">
                  <div className="journey-result-heading">
                    <h2>Trip history</h2>
                    {total > 0 && (
                      <p className="journey-result-count">
                        {total === 1 ? '1 recorded update' : `${total} recorded updates`}
                      </p>
                    )}
                  </div>
                  {history.length ? (
                    <ol className="record-list journey-list">
                      {history.map((entry) => (
                        <li key={entry.id} className="journey-card">
                          <p>
                            <strong>{statusLabel(entry.fromStatus)}</strong> to{' '}
                            <strong>{statusLabel(entry.toStatus)}</strong>
                          </p>
                          <p className="small-text">
                            <JourneyTime value={entry.createdAt} />
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
              </>
            )
          )}
        </>
      )}
    </JourneyLayout>
  );
}
