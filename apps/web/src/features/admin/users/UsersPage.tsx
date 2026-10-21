import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReasonInputSchema, UserSchema, type UserDto } from '@drivehire/contracts';
import { api } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field } from '../../../components/ui/index.js';
import { messageOf, Pages, SelectField } from '../../providers/ProviderLayout.js';
import { journeyTime, statusLabel } from '../../bookings/JourneyLayout.js';
import {
  AdminDetailPlaceholder,
  AdminForbidden,
  AdminPage,
  AdminReasonField,
  AdminResultHeading,
  AdminStatus,
} from '../AdminUi.js';

export function UsersPage() {
  const { user } = useAuth();
  const allowed = user?.roles.includes('ADMIN') ?? false;
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const role = params.get('role') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [rows, setRows] = useState<UserDto[]>([]);
  const [selected, setSelected] = useState<UserDto | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [settledKey, setSettledKey] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
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
    void api
      .requestPage<unknown>(`/admin/users?${request.toString()}`)
      .then((result) => {
        if (active) {
          setRows(result.data.map((row) => UserSchema.parse(row)));
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
  }, [allowed, page, query, requestKey]);

  function updateFilters(change: (next: URLSearchParams) => void) {
    setSelected(null);
    const next = new URLSearchParams(params);
    change(next);
    next.set('page', '1');
    setParams(next);
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('search') ?? '').trim();
    updateFilters((next) => {
      if (value) next.set('search', value);
      else next.delete('search');
    });
  }
  function resetFilters() {
    setSelected(null);
    setParams(new URLSearchParams({ page: '1' }));
  }
  function changePage(next: number) {
    setSelected(null);
    const request = new URLSearchParams(params);
    request.set('page', String(next));
    setParams(request);
  }
  async function open(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setSelected(UserSchema.parse(await api.request(`/admin/users/${id}`)));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError('');
    setNotice('');
    const parsed = ReasonInputSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setError('Give a reason of 10 to 1,000 characters. Your draft has been kept.');
      return;
    }
    setBusy(true);
    try {
      const result = UserSchema.parse(
        await api.request(
          `/admin/users/${selected.id}/${selected.status === 'ACTIVE' ? 'suspend' : 'reactivate'}`,
          { method: 'POST', body: JSON.stringify(parsed.data) },
        ),
      );
      setSelected(result);
      setNotice(
        result.status === 'SUSPENDED'
          ? 'User suspended. Their active sessions are revoked.'
          : 'User reactivated.',
      );
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(
        `${messageOf(cause)} Your reason has been kept. Reload user details before retrying.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage
      title="User administration"
      introduction="Find an account and review its current access. Suspension and reactivation require an audited reason."
    >
      {!allowed ? (
        <AdminForbidden area="account administration area" />
      ) : (
        <>
          {error && <ErrorState message={error} />}
          {notice && (
            <p role="status" className="success-state">
              {notice}
            </p>
          )}

          <div className="admin-toolbar">
            <form className="admin-filters" onSubmit={submitSearch} aria-label="Find user">
              <Field
                key={search}
                id="search"
                name="search"
                type="search"
                autoComplete="off"
                label="Search name or email"
                maxLength={100}
                defaultValue={search}
              />
              <SelectField
                id="accountStatus"
                label="Account status"
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
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </SelectField>
              <SelectField
                id="role"
                label="Account role"
                value={role}
                disabled={busy}
                onChange={(event) =>
                  updateFilters((next) => {
                    if (event.target.value) next.set('role', event.target.value);
                    else next.delete('role');
                  })
                }
              >
                <option value="">All roles</option>
                {['PASSENGER', 'DRIVER', 'ADMIN'].map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </SelectField>
              <div className="admin-filter-actions">
                <Button type="submit" variant="secondary" disabled={busy}>
                  Search users
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || loading}
                  onClick={resetFilters}
                >
                  Reset filters
                </Button>
              </div>
            </form>
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
                Reload users
              </Button>
            </div>
          </div>

          <div className="admin-split">
            <section aria-busy={loading} aria-label="Accounts">
              <AdminResultHeading
                title="Accounts"
                count={loading || error ? null : total}
                noun="account"
              />
              {loading ? (
                <p role="status">Loading accounts…</p>
              ) : error ? null : rows.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <caption className="admin-visually-hidden">
                      Accounts matching the current search and filters
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Account</th>
                        <th scope="col">Status</th>
                        <th scope="col">Roles</th>
                        <th scope="col">Created</th>
                        <th scope="col" className="admin-cell-action">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} data-selected={selected?.id === row.id}>
                          <td>
                            <span className="admin-cell-title">{row.displayName}</span>
                            <span className="admin-email">{row.email}</span>
                            <span className="admin-cell-note">
                              {row.emailVerified ? 'Email verified' : 'Email not verified'}
                            </span>
                          </td>
                          <td>
                            <AdminStatus status={row.status} />
                          </td>
                          <td>{row.roles.map((entry) => statusLabel(entry)).join(' · ')}</td>
                          <td>
                            <time dateTime={row.createdAt}>{journeyTime(row.createdAt)}</time>
                          </td>
                          <td className="admin-cell-action">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              aria-pressed={selected?.id === row.id}
                              aria-label={`Manage ${row.displayName}`}
                              onClick={() => void open(row.id)}
                            >
                              Manage
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No accounts match">
                  Try a different name, email, status or role, or reset the filters.
                </EmptyState>
              )}
              {!error && (
                <Pages page={page} hasMore={hasMore} busy={busy || loading} onPage={changePage} />
              )}
            </section>

            {selected ? (
              <aside className="admin-detail" aria-label="Selected user" aria-busy={busy}>
                <div className="admin-detail-heading">
                  <div>
                    <h2>{selected.displayName}</h2>
                    <p className="admin-email">{selected.email}</p>
                  </div>
                  <AdminStatus status={selected.status} />
                </div>
                <dl className="admin-facts">
                  <div>
                    <dt>Roles</dt>
                    <dd>{selected.roles.map((entry) => statusLabel(entry)).join(' · ')}</dd>
                  </div>
                  <div>
                    <dt>Email state</dt>
                    <dd>{selected.emailVerified ? 'Verified' : 'Not verified'}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>
                      <time dateTime={selected.createdAt}>{journeyTime(selected.createdAt)}</time>
                    </dd>
                  </div>
                  <div>
                    <dt>Account ID</dt>
                    <dd className="admin-ref">{selected.id}</dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void open(selected.id)}
                >
                  Reload user details
                </Button>
                <form
                  key={`${selected.id}:${selected.status}`}
                  onSubmit={(event) => void changeStatus(event)}
                  aria-label="Change account access"
                >
                  <h3>{selected.status === 'ACTIVE' ? 'Suspend account' : 'Reactivate account'}</h3>
                  <p>
                    {selected.status === 'ACTIVE'
                      ? 'Suspension removes current access and revokes active sessions. The server protects your account and the last active administrator.'
                      : 'Reactivation restores account access. Previous sessions remain revoked.'}
                  </p>
                  <AdminReasonField />
                  <Button type="submit" busy={busy} disabled={selected.id === user?.id}>
                    {selected.status === 'ACTIVE' ? 'Confirm suspension' : 'Confirm reactivation'}
                  </Button>
                </form>
              </aside>
            ) : (
              <AdminDetailPlaceholder>
                Select an account to review its current access and recorded identity.
              </AdminDetailPlaceholder>
            )}
          </div>
        </>
      )}
    </AdminPage>
  );
}
