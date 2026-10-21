import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { AvailabilitySchema, type AvailabilityDto } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { PageHeading } from '../../components/PageHeading.js';
import { Pages } from './ProviderLayout.js';

const dateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export function DriverAvailabilityPage() {
  const { user } = useAuth();
  const [windows, setWindows] = useState<AvailabilityDto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const allowed = user?.roles.includes('DRIVER') ?? false;
  const requestKey = `${page}-${revision}`;
  const loading = loadedKey !== requestKey;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void api
      .requestPage<unknown>(`/drivers/me/availability?page=${page}&pageSize=20`)
      .then((result) => {
        const rows = result.data.map((row) => AvailabilitySchema.parse(row));
        if (active) {
          setWindows(rows);
          setHasMore(result.meta.page * result.meta.pageSize < result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Could not load your schedule.');
      })
      .finally(() => {
        if (active) setLoadedKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [allowed, page, requestKey]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const start = new Date(String(values.get('startsAt')));
    const end = new Date(String(values.get('endsAt')));
    setError('');
    setNotice('');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setError('Choose valid dates, with the end after the start. Your draft has been kept.');
      return;
    }
    setBusy(true);
    try {
      await api.request('/drivers/me/availability', {
        method: 'POST',
        body: JSON.stringify({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          kind: values.get('kind'),
        }),
      });
      form.reset();
      setPage(1);
      setRevision((value) => value + 1);
      setNotice('Your schedule window has been saved.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save. Your draft has been kept.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.request(`/drivers/me/availability/${id}`, { method: 'DELETE' });
      setRevision((value) => value + 1);
      setNotice('The schedule window has been removed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this window.');
    } finally {
      setBusy(false);
    }
  }

  if (!allowed)
    return (
      <section className="workspace-page">
        <PageHeading
          title="Driver access required"
          introduction="Enable driver capability in your profile to manage a schedule."
        >
          <Link className="button button-secondary" to="/profile">
            Go to your profile
          </Link>
        </PageHeading>
      </section>
    );
  return (
    <section className="workspace-page schedule-page">
      <PageHeading
        title="Your driving schedule"
        introduction="Set the times you can drive and protect the times you need to keep free."
      >
        <p className="page-note">
          All times are shown in {timezone}. Approval is required before accepting bookings.
        </p>
      </PageHeading>
      <div className="availability-workspace">
        <div className="schedule-form-column">
          {error && <ErrorState message={error} />}
          {notice && (
            <p className="success-state" role="status">
              {notice}
            </p>
          )}
          <form
            className="schedule-form"
            onSubmit={(event) => void save(event)}
            aria-label="Add schedule window"
          >
            <div className="form-heading">
              <h2>Add a time window</h2>
              <p>Available time can be offered for work. Blocked time stays free.</p>
            </div>
            <div className="form-columns">
              <Field id="startsAt" name="startsAt" label="Starts" type="datetime-local" required />
              <Field id="endsAt" name="endsAt" label="Ends" type="datetime-local" required />
            </div>
            <p className="timezone-note">
              <Clock size={18} aria-hidden="true" />
              Create and review times in {timezone}.
            </p>
            <fieldset disabled={busy}>
              <legend>How should this time be used?</legend>
              <label>
                <input type="radio" name="kind" value="AVAILABLE" defaultChecked />
                <span>
                  <strong>Available to drive</strong>
                  <small>Offer this period for new driving work.</small>
                </span>
              </label>
              <label>
                <input type="radio" name="kind" value="BLOCKED" />
                <span>
                  <strong>Keep this time free</strong>
                  <small>Protect this period from overlapping work.</small>
                </span>
              </label>
            </fieldset>
            <p className="small-text">
              Blocked time cannot overlap an existing booking or shared journey.
            </p>
            <div className="form-actions">
              <Button type="submit" busy={busy}>
                Save time window
              </Button>
            </div>
          </form>
        </div>
        <section className="schedule-windows" aria-busy={loading}>
          <div className="section-heading">
            <div>
              <h2>Saved windows</h2>
              <p>Times remain in {timezone}.</p>
            </div>
            <Button
              variant="ghost"
              disabled={loading || busy}
              onClick={() => {
                setError('');
                setRevision((value) => value + 1);
              }}
            >
              Reload schedule
            </Button>
          </div>
          {loading ? (
            <p role="status">Loading your schedule…</p>
          ) : windows.length === 0 ? (
            <EmptyState title="No time windows yet">
              Add your first available or blocked period in the form.
            </EmptyState>
          ) : (
            <ul className="window-list">
              {windows.map((window) => (
                <li key={window.id}>
                  <div className="window-heading">
                    <StatusBadge status={window.kind}>
                      {window.kind === 'AVAILABLE' ? 'Available to drive' : 'Keep this time free'}
                    </StatusBadge>
                  </div>
                  <dl className="window-facts">
                    <div>
                      <dt>Starts</dt>
                      <dd>
                        <time dateTime={window.startsAt}>{dateTime(window.startsAt)}</time>
                      </dd>
                    </div>
                    <div>
                      <dt>Ends</dt>
                      <dd>
                        <time dateTime={window.endsAt}>{dateTime(window.endsAt)}</time>
                      </dd>
                    </div>
                  </dl>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove window starting ${dateTime(window.startsAt)}`}
                    onClick={() => void remove(window.id)}
                  >
                    Remove window
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Pages
            page={page}
            hasMore={hasMore}
            busy={loading || busy}
            onPage={(value) => setPage(value)}
          />
        </section>
      </div>
    </section>
  );
}
