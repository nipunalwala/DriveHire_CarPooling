import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  VerificationSchema,
  VerificationDecisionInputSchema,
  type VerificationDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthProvider.js';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  StatusBadge,
} from '../../../components/ui/index.js';
import { messageOf, Pages, SelectField } from '../../providers/ProviderLayout.js';
import { PrivateEvidence } from './PrivateEvidence.js';

export function VerificationPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<VerificationDto[]>([]);
  const [review, setReview] = useState<VerificationDto | null>(null);
  const [status, setStatus] = useState('PENDING');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const allowed = user?.roles.includes('ADMIN') ?? false;
  const key = `${page}:${status}:${type}:${revision}`;
  const loading = loadedKey !== key;
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) query.set('status', status);
    if (type) query.set('type', type);
    void api
      .requestPage<unknown>(`/admin/verifications?${query}`)
      .then((result) => {
        if (active) {
          setRows(result.data.map((row) => VerificationSchema.parse(row)));
          setHasMore(page * result.meta.pageSize < result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoadedKey(key);
      });
    return () => {
      active = false;
    };
  }, [allowed, page, status, type, key]);
  async function open(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setReview(VerificationSchema.parse(await api.request(`/admin/verifications/${id}`)));
      setStale(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review || stale) return;
    setError('');
    setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = VerificationDecisionInputSchema.safeParse({
      ...values,
      version: review.version,
    });
    if (!parsed.success) {
      setError(
        'Choose a decision and give a reason of 10 to 1,000 characters. Your review has been kept.',
      );
      return;
    }
    setBusy(true);
    try {
      setReview(
        VerificationSchema.parse(
          await api.request(`/admin/verifications/${review.id}/decision`, {
            method: 'POST',
            body: JSON.stringify(parsed.data),
          }),
        ),
      );
      setNotice('Review decision saved.');
      setRevision((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setStale(true);
      setError(
        `${messageOf(cause)} Your review context and reason have been kept. Reload review before making a new decision.`,
      );
    } finally {
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <section className="profile-layout">
        <div>
          <h1>Administrator access required</h1>
          <Link to="/profile">Go to your profile</Link>
        </div>
      </section>
    );
  return (
    <section className="profile-layout provider-page">
      <div>
        <Link to="/profile">Your profile</Link>
        <h1>Qualification reviews</h1>
        <p>
          Review current private evidence before approving a driver or personal vehicle. Each
          decision is audited.
        </p>
        <nav className="task-navigation" aria-label="Administrator tasks">
          <Link to="/admin/verifications">Qualification reviews</Link>
          <Link to="/admin/users">User administration</Link>
        </nav>
      </div>
      <div className="profile-content">
        {error && <ErrorState message={error} />}
        {notice && (
          <p role="status" className="success-state">
            {notice}
          </p>
        )}
        <section aria-busy={loading}>
          <div className="form-columns">
            <SelectField
              id="status"
              label="Review status"
              value={status}
              disabled={busy}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'DRAFT'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="subjectType"
              label="Subject type"
              value={type}
              disabled={busy}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Drivers and vehicles</option>
              <option value="DRIVER">Drivers</option>
              <option value="VEHICLE">Vehicles</option>
            </SelectField>
          </div>
          <h2>Review queue</h2>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || loading}
            onClick={() => {
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            Reload queue
          </Button>
          {loading ? (
            <p role="status">Loading reviews…</p>
          ) : rows.length ? (
            <ul className="record-list">
              {rows.map((row, index) => (
                <li key={row.id}>
                  <h3>{row.subjectType === 'DRIVER' ? 'Driver' : 'Vehicle'} qualification</h3>
                  <p>
                    <StatusBadge>{row.status}</StatusBadge> · Submitted{' '}
                    {new Date(row.submittedAt).toLocaleString()}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void open(row.id)}
                    aria-label={`Review ${row.subjectType.toLowerCase()} request ${index + 1}`}
                  >
                    Review request
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No reviews match">
              Change your filters or reload the queue later.
            </EmptyState>
          )}
          <Pages page={page} hasMore={hasMore} busy={busy || loading} onPage={setPage} />
        </section>
        {review && (
          <section className="profile-section" aria-label="Selected review">
            <h2>{review.subjectType === 'DRIVER' ? 'Driver' : 'Vehicle'} review details</h2>
            <p>
              <StatusBadge>{review.status}</StatusBadge> · Revision version {review.version}
            </p>
            <p className="small-text">Request reference: {review.id}</p>
            {review.reason && <p>Decision reason: {review.reason}</p>}
            <h3>Submitted evidence</h3>
            <p>
              Private files download only after an authenticated access check. Check every attached
              document.
            </p>
            <ul className="record-list">
              {review.documentIds.map((id, index) => (
                <PrivateEvidence key={`${review.id}:${id}`} id={id} index={index + 1} />
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void open(review.id)}
            >
              Reload review
            </Button>
            {stale && (
              <p role="status">
                This review changed. Reload review, inspect current evidence and then decide again.
              </p>
            )}
            {review.status === 'PENDING' && (
              <form
                key={review.id}
                onSubmit={(event) => void decide(event)}
                aria-label="Review decision"
              >
                <fieldset disabled={busy || stale}>
                  <legend>Your decision</legend>
                  <SelectField
                    id="decision"
                    name="decision"
                    label="Decision"
                    required
                    defaultValue=""
                  >
                    <option value="">Choose a decision</option>
                    <option value="APPROVE">Approve</option>
                    <option value="REJECT">Reject</option>
                  </SelectField>
                  <Field
                    id="reason"
                    name="reason"
                    label="Reason"
                    minLength={10}
                    maxLength={1000}
                    required
                    hint="10 to 1,000 characters. This reason is recorded in the audit trail."
                  />
                  <Button type="submit" busy={busy}>
                    Save decision
                  </Button>
                </fieldset>
              </form>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
