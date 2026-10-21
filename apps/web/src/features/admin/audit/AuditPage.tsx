import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuditEntrySchema, type AuditEntryDto } from '@drivehire/contracts';
import { api } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field } from '../../../components/ui/index.js';
import { Pages } from '../../providers/ProviderLayout.js';
import { journeyTime, statusLabel } from '../../bookings/JourneyLayout.js';
import { AdminForbidden, AdminPage, AdminResultHeading, adminLocalDateTime } from '../AdminUi.js';

export function AuditPage() {
  const { user } = useAuth();
  const allowed = Boolean(user?.roles.includes('ADMIN'));
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [rows, setRows] = useState<AuditEntryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [settledKey, setSettledKey] = useState<string>();

  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${query}:${attempt}`;
  const loading = settledKey !== requestKey;
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const search = new URLSearchParams(query);
    search.set('pageSize', '20');
    void api
      .requestPage<unknown>(`/admin/audit-logs?${search}`)
      .then((result) => {
        const parsed = result.data.map((row) => AuditEntrySchema.parse(row));
        if (active) {
          setError('');
          setRows(parsed);
          setTotal(result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setRows([]);
          setTotal(0);
          setError(
            cause instanceof Error
              ? `${cause.message} The current filters have been kept. Use Reload audit to retry.`
              : 'Could not load audit entries. The current filters have been kept. Use Reload audit to retry.',
          );
        }
      })
      .finally(() => {
        if (active) setSettledKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [allowed, query, requestKey]);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      search = new URLSearchParams();
    for (const name of ['action', 'actorId']) {
      const value = String(form.get(name) ?? '').trim();
      if (value) search.set(name, value);
    }
    const from = String(form.get('from') ?? ''),
      to = String(form.get('to') ?? '');
    if (from && to && new Date(to) < new Date(from)) {
      setError('The end of the date range must be after its start.');
      return;
    }
    for (const [name, value] of [
      ['from', from],
      ['to', to],
    ] as const)
      if (value) search.set(name, new Date(value).toISOString());
    search.set('page', '1');
    setError('');
    setParams(search);
  }
  function resetFilters() {
    setError('');
    setParams(new URLSearchParams());
  }
  function changePage(next: number) {
    const search = new URLSearchParams(params);
    search.set('page', String(next));
    setParams(search);
  }
  return (
    <AdminPage
      title="Administrative audit"
      introduction="Inspect immutable administrative actions. Audit entries cannot be edited or deleted here."
    >
      {!allowed ? (
        <AdminForbidden area="administrative audit area" />
      ) : (
        <>
          <div className="admin-toolbar">
            <form key={query} className="admin-filters" onSubmit={apply} aria-label="Audit filters">
              <Field
                id="audit-action"
                name="action"
                label="Action"
                maxLength={100}
                defaultValue={params.get('action') ?? ''}
                hint="Exact action, for example ADMIN_USER_READ."
              />
              <Field
                id="audit-actor"
                name="actorId"
                label="Actor ID"
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                defaultValue={params.get('actorId') ?? ''}
              />
              <Field
                id="audit-from"
                name="from"
                label="From (local time)"
                type="datetime-local"
                defaultValue={adminLocalDateTime(params.get('from'))}
              />
              <Field
                id="audit-to"
                name="to"
                label="To (local time)"
                type="datetime-local"
                defaultValue={adminLocalDateTime(params.get('to'))}
              />
              <div className="admin-filter-actions">
                <Button type="submit" variant="secondary" busy={loading}>
                  Apply filters
                </Button>
                <Button type="button" variant="ghost" onClick={resetFilters}>
                  Reset filters
                </Button>
              </div>
            </form>
            <div className="admin-toolbar-actions">
              <Button
                type="button"
                variant="ghost"
                busy={loading}
                onClick={() => setAttempt((value) => value + 1)}
              >
                Reload audit
              </Button>
            </div>
          </div>

          <AdminResultHeading
            title="Audit entries"
            count={loading || error ? null : total}
            noun="audit entry"
            plural="audit entries"
          >
            <p className="admin-inline-note">Entries are immutable and cannot be edited here.</p>
          </AdminResultHeading>

          {!loading && error && <ErrorState message={error} />}
          {loading ? (
            <p role="status">Loading audit entries…</p>
          ) : !error && !rows.length ? (
            <EmptyState title="No audit entries match">
              Change the filters or reset them to inspect other administrative actions.
            </EmptyState>
          ) : error ? null : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table admin-audit-table">
                  <caption className="admin-visually-hidden">
                    Immutable administrative audit entries matching the current filters
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Action</th>
                      <th scope="col">Actor</th>
                      <th scope="col">Subject</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} data-audit-entry>
                        <td className="admin-cell-time">
                          <time dateTime={row.createdAt}>{journeyTime(row.createdAt)}</time>
                        </td>
                        <td className="admin-cell-action-name">
                          <span className="admin-cell-title">{statusLabel(row.action)}</span>
                          <span className="admin-ref">{row.action}</span>
                        </td>
                        <td className="admin-cell-actor">
                          <span className="admin-ref">{row.actorId ?? 'System worker'}</span>
                        </td>
                        <td className="admin-cell-subject">
                          <span className="admin-cell-title">{statusLabel(row.subjectType)}</span>
                          <span className="admin-ref">{row.subjectId}</span>
                          <details className="admin-details">
                            <summary>Request metadata</summary>
                            <p className="admin-ref">Request: {row.requestId}</p>
                          </details>
                        </td>
                        <td className="admin-cell-reason">
                          {row.reason ? (
                            <span className="admin-reason">{row.reason}</span>
                          ) : (
                            <span className="admin-muted">No reason recorded</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pages page={page} hasMore={page * 20 < total} busy={loading} onPage={changePage} />
            </>
          )}
        </>
      )}
    </AdminPage>
  );
}
