import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuditEntrySchema, type AuditEntryDto } from '@drivehire/contracts';
import { api } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field } from '../../../components/ui/index.js';
import { Pages } from '../../providers/ProviderLayout.js';
import { JourneyLayout, journeyTime } from '../../bookings/JourneyLayout.js';
function local(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
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
              ? cause.message
              : 'Could not load audit entries. Reload to try again.',
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
    setParams(search);
    setAttempt((value) => value + 1);
  }
  function changePage(next: number) {
    const search = new URLSearchParams(params);
    search.set('page', String(next));
    setParams(search);
  }
  return (
    <JourneyLayout
      title="Administrative audit"
      introduction="Inspect immutable administrative actions. Audit entries cannot be edited or deleted here."
    >
      {!allowed ? (
        <EmptyState title="Administrator access is required">
          This area is available to current administrators only.
        </EmptyState>
      ) : (
        <>
          <form key={query} onSubmit={apply} aria-label="Audit filters">
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
            <div className="form-columns">
              <Field
                id="audit-from"
                name="from"
                label="From (local time)"
                type="datetime-local"
                defaultValue={local(params.get('from'))}
              />
              <Field
                id="audit-to"
                name="to"
                label="To (local time)"
                type="datetime-local"
                defaultValue={local(params.get('to'))}
              />
            </div>
            <Button type="submit" busy={loading}>
              Apply filters
            </Button>
          </form>
          {!loading && error && <ErrorState message={error} />}
          <Button
            type="button"
            variant="secondary"
            busy={loading}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reload audit
          </Button>
          {loading ? (
            <p role="status">Loading audit entries…</p>
          ) : !error && !rows.length ? (
            <EmptyState title="No audit entries match">
              Change the filters to inspect other administrative actions.
            </EmptyState>
          ) : (
            <ol className="record-list" aria-label="Audit entries">
              {rows.map((row) => (
                <li key={row.id} data-audit-entry>
                  <h2>{row.action}</h2>
                  <p>{journeyTime(row.createdAt)}</p>
                  <dl className="record-facts">
                    <div>
                      <dt>Actor</dt>
                      <dd>{row.actorId ?? 'System worker'}</dd>
                    </div>
                    <div>
                      <dt>Subject</dt>
                      <dd>
                        {row.subjectType} · {row.subjectId}
                      </dd>
                    </div>
                    <div>
                      <dt>Request</dt>
                      <dd>{row.requestId}</dd>
                    </div>
                    {row.reason && (
                      <div>
                        <dt>Reason</dt>
                        <dd>{row.reason}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ol>
          )}
          <Pages page={page} hasMore={page * 20 < total} busy={loading} onPage={changePage} />
        </>
      )}
    </JourneyLayout>
  );
}
