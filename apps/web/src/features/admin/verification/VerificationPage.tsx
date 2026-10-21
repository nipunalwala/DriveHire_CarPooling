import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  VerificationSchema,
  VerificationDecisionInputSchema,
  type VerificationDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState } from '../../../components/ui/index.js';
import { messageOf, Pages, SelectField } from '../../providers/ProviderLayout.js';
import { journeyTime, statusLabel } from '../../bookings/JourneyLayout.js';
import { PrivateEvidence } from './PrivateEvidence.js';
import {
  AdminDetailPlaceholder,
  AdminForbidden,
  AdminPage,
  AdminReasonField,
  AdminResultHeading,
  AdminStatus,
} from '../AdminUi.js';

const reviewStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'DRAFT'];

export function VerificationPage() {
  const { user } = useAuth();
  const allowed = user?.roles.includes('ADMIN') ?? false;
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'PENDING';
  const type = params.get('type') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [rows, setRows] = useState<VerificationDto[]>([]);
  const [review, setReview] = useState<VerificationDto | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [settledKey, setSettledKey] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const query = params.toString();
  const requestKey = `${query}:${revision}`;
  const loading = settledKey !== requestKey;

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const request = new URLSearchParams(query);
    request.set('page', String(page));
    request.set('pageSize', '20');
    if (status) request.set('status', status);
    else request.delete('status');
    if (type) request.set('type', type);
    else request.delete('type');
    void api
      .requestPage<unknown>(`/admin/verifications?${request.toString()}`)
      .then((result) => {
        if (active) {
          setRows(result.data.map((row) => VerificationSchema.parse(row)));
          setTotal(result.meta.total);
          setHasMore(page * result.meta.pageSize < result.meta.total);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setRows([]);
          setTotal(0);
          setHasMore(false);
          setError(messageOf(cause));
        }
      })
      .finally(() => {
        if (active) setSettledKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [allowed, page, query, requestKey, status, type]);

  function updateFilters(change: (next: URLSearchParams) => void) {
    setReview(null);
    const next = new URLSearchParams(params);
    change(next);
    next.set('page', '1');
    setParams(next);
  }
  function resetFilters() {
    setReview(null);
    setParams(new URLSearchParams({ page: '1' }));
  }
  function changePage(next: number) {
    setReview(null);
    const request = new URLSearchParams(params);
    request.set('page', String(next));
    setParams(request);
  }
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

  return (
    <AdminPage
      title="Qualification reviews"
      introduction="Review current private evidence before approving a driver or personal vehicle. Each decision is audited."
    >
      {!allowed ? (
        <AdminForbidden area="qualification review area" />
      ) : (
        <>
          {error && <ErrorState message={error} />}
          {notice && (
            <p role="status" className="success-state">
              {notice}
            </p>
          )}

          <div className="admin-toolbar">
            <div className="admin-filters">
              <SelectField
                id="status"
                label="Review status"
                value={status}
                disabled={busy}
                onChange={(event) =>
                  updateFilters((next) => {
                    if (event.target.value) next.set('status', event.target.value);
                    else next.delete('status');
                  })
                }
              >
                <option value="">All statuses</option>
                {reviewStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="subjectType"
                label="Subject type"
                value={type}
                disabled={busy}
                onChange={(event) =>
                  updateFilters((next) => {
                    if (event.target.value) next.set('type', event.target.value);
                    else next.delete('type');
                  })
                }
              >
                <option value="">Drivers and vehicles</option>
                <option value="DRIVER">Drivers</option>
                <option value="VEHICLE">Vehicles</option>
              </SelectField>
              <div className="admin-filter-actions">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || loading}
                  onClick={resetFilters}
                >
                  Reset filters
                </Button>
              </div>
            </div>
            <div className="admin-toolbar-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy || loading}
                onClick={() => {
                  setError('');
                  setRevision((value) => value + 1);
                }}
              >
                Reload queue
              </Button>
            </div>
          </div>

          <div className="admin-split">
            <section aria-busy={loading} aria-label="Review queue">
              <AdminResultHeading
                title="Review queue"
                count={loading || error ? null : total}
                noun="review"
              />
              {loading ? (
                <p role="status">Loading reviews…</p>
              ) : error ? null : rows.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <caption className="admin-visually-hidden">
                      Qualification reviews matching the current filters
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Subject</th>
                        <th scope="col">Status</th>
                        <th scope="col">Submitted</th>
                        <th scope="col" className="admin-cell-action">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={row.id} data-selected={review?.id === row.id}>
                          <td>
                            <span className="admin-cell-title">
                              {row.subjectType === 'DRIVER' ? 'Driver' : 'Vehicle'} qualification
                            </span>
                            <span className="admin-ref">
                              {row.subjectType === 'DRIVER' ? 'Driver account' : 'Vehicle record'}:{' '}
                              {row.subjectId}
                            </span>
                            <span className="admin-cell-note">
                              {row.documentIds.length === 1
                                ? '1 private document'
                                : `${row.documentIds.length} private documents`}
                            </span>
                          </td>
                          <td>
                            <AdminStatus status={row.status} />
                          </td>
                          <td>
                            <time dateTime={row.submittedAt}>{journeyTime(row.submittedAt)}</time>
                          </td>
                          <td className="admin-cell-action">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              aria-pressed={review?.id === row.id}
                              aria-label={`Review ${row.subjectType.toLowerCase()} request ${index + 1}`}
                              onClick={() => void open(row.id)}
                            >
                              Review request
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No reviews match">
                  Change your filters or reload the queue later.
                </EmptyState>
              )}
              {!error && (
                <Pages page={page} hasMore={hasMore} busy={busy || loading} onPage={changePage} />
              )}
            </section>

            {review ? (
              <aside className="admin-detail" aria-label="Selected review" aria-busy={busy}>
                <div className="admin-detail-heading">
                  <div>
                    <h2>{review.subjectType === 'DRIVER' ? 'Driver' : 'Vehicle'} review</h2>
                    <p className="admin-ref">Request reference: {review.id}</p>
                  </div>
                  <AdminStatus status={review.status} />
                </div>
                <dl className="admin-facts">
                  <div>
                    <dt>{review.subjectType === 'DRIVER' ? 'Driver account' : 'Vehicle record'}</dt>
                    <dd className="admin-ref">{review.subjectId}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>
                      <time dateTime={review.submittedAt}>{journeyTime(review.submittedAt)}</time>
                    </dd>
                  </div>
                  <div>
                    <dt>Revision version</dt>
                    <dd>{review.version}</dd>
                  </div>
                  {review.reason && (
                    <div>
                      <dt>Decision reason</dt>
                      <dd>{review.reason}</dd>
                    </div>
                  )}
                </dl>

                <section className="admin-evidence" aria-label="Submitted evidence">
                  <h3>
                    Submitted evidence (
                    {review.documentIds.length === 1
                      ? '1 document'
                      : `${review.documentIds.length} documents`}
                    )
                  </h3>
                  <p>
                    Private files download only after an authenticated access check. Load and check
                    every attached document.
                  </p>
                  <ul className="admin-evidence-list">
                    {review.documentIds.map((id, index) => (
                      <PrivateEvidence key={`${review.id}:${id}`} id={id} index={index + 1} />
                    ))}
                  </ul>
                </section>

                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void open(review.id)}
                >
                  Reload review
                </Button>
                {stale && (
                  <p role="status" className="admin-stale">
                    This review changed. Reload review, inspect current evidence and then decide
                    again.
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
                      <AdminReasonField />
                      <Button type="submit" busy={busy}>
                        Save decision
                      </Button>
                    </fieldset>
                  </form>
                )}
              </aside>
            ) : (
              <AdminDetailPlaceholder>
                Select a review to inspect private evidence and record a decision.
              </AdminDetailPlaceholder>
            )}
          </div>
        </>
      )}
    </AdminPage>
  );
}
