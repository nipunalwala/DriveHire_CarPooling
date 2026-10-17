import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AvailabilitySchema, type AvailabilityDto } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';

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
      <section className="profile-layout">
        <div>
          <h1>Driver access required</h1>
          <p>Enable driver capability in your profile to manage a schedule.</p>
          <Link to="/profile">Go to your profile</Link>
        </div>
      </section>
    );
  return (
    <section className="profile-layout schedule-page">
      <div>
        <Link to="/profile">Your profile</Link>
        <h1>Your driving schedule</h1>
        <p>Set the times you can drive and protect the times you need to keep free.</p>
        <p>All times are shown in {timezone}. Approval is required before accepting bookings.</p>
      </div>
      <div className="profile-content">
        {error && <ErrorState message={error} />}
        {notice && (
          <p className="success-state" role="status">
            {notice}
          </p>
        )}
        <form onSubmit={(event) => void save(event)} aria-label="Add schedule window">
          <h2>Add a time window</h2>
          <Field id="startsAt" name="startsAt" label="Starts" type="datetime-local" required />
          <Field id="endsAt" name="endsAt" label="Ends" type="datetime-local" required />
          <fieldset disabled={busy}>
            <legend>How should this time be used?</legend>
            <label>
              <input type="radio" name="kind" value="AVAILABLE" defaultChecked /> Available to drive
            </label>
            <label>
              <input type="radio" name="kind" value="BLOCKED" /> Keep this time free
            </label>
          </fieldset>
          <p className="small-text">
            Blocked time cannot overlap an existing booking or shared journey.
          </p>
          <Button type="submit" busy={busy}>
            Save time window
          </Button>
        </form>
        <section className="profile-section" aria-busy={loading}>
          <h2>Saved windows</h2>
          <Button
            variant="secondary"
            disabled={loading || busy}
            onClick={() => {
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            Reload schedule
          </Button>
          {loading ? (
            <p role="status">Loading your schedule…</p>
          ) : windows.length === 0 ? (
            <EmptyState title="No time windows yet">
              Add your first available or blocked period above.
            </EmptyState>
          ) : (
            <ul>
              {windows.map((window) => (
                <li key={window.id}>
                  <p>
                    <StatusBadge>
                      {window.kind === 'AVAILABLE' ? 'Available' : 'Blocked'}
                    </StatusBadge>
                  </p>
                  <p>
                    <time dateTime={window.startsAt}>
                      {new Date(window.startsAt).toLocaleString()}
                    </time>{' '}
                    –{' '}
                    <time dateTime={window.endsAt}>{new Date(window.endsAt).toLocaleString()}</time>
                  </p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    aria-label={`Remove window starting ${new Date(window.startsAt).toLocaleString()}`}
                    onClick={() => void remove(window.id)}
                  >
                    Remove window
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Schedule pages">
            <Button
              variant="secondary"
              disabled={page === 1 || loading || busy}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <span> Page {page} </span>
            <Button
              variant="secondary"
              disabled={!hasMore || loading || busy}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </nav>
        </section>
      </div>
    </section>
  );
}
