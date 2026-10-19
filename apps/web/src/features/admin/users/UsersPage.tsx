import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ReasonInputSchema, UserSchema, type UserDto } from '@drivehire/contracts';
import { api } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthProvider.js';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  StatusBadge,
} from '../../../components/ui/index.js';
import { messageOf, Pages, SelectField } from '../../providers/ProviderLayout.js';

export function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserDto[]>([]);
  const [selected, setSelected] = useState<UserDto | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const allowed = user?.roles.includes('ADMIN') ?? false;
  const key = `${page}:${status}:${role}:${search}:${revision}`;
  const loading = loadedKey !== key;
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) query.set('status', status);
    if (role) query.set('role', role);
    if (search) query.set('search', search);
    void api
      .requestPage<unknown>(`/admin/users?${query}`)
      .then((result) => {
        if (active) {
          setRows(result.data.map((row) => UserSchema.parse(row)));
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
  }, [allowed, page, search, status, role, key]);
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
        <h1>User administration</h1>
        <p>
          Find an account and review its current access. Suspension and reactivation require an
          audited reason.
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(String(new FormData(event.currentTarget).get('search') ?? '').trim());
            setPage(1);
          }}
          aria-label="Find user"
        >
          <Field id="search" name="search" label="Search name or email" maxLength={100} />
          <Button type="submit" disabled={busy}>
            Search users
          </Button>
        </form>
        <div className="form-columns">
          <SelectField
            id="accountStatus"
            label="Account status"
            value={status}
            disabled={busy}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
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
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {['PASSENGER', 'DRIVER', 'ADMIN'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>
        <section aria-busy={loading}>
          <h2>Accounts</h2>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || loading}
            onClick={() => {
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            Reload users
          </Button>
          {loading ? (
            <p role="status">Loading accounts…</p>
          ) : rows.length ? (
            <ul className="record-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <h3>{row.displayName}</h3>
                  <p className="account-email">{row.email}</p>
                  <p>
                    <StatusBadge>{row.status}</StatusBadge> · {row.roles.join(', ')}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void open(row.id)}
                  >
                    Manage {row.displayName}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No accounts match">
              Try a different name, email or filter.
            </EmptyState>
          )}
          <Pages page={page} hasMore={hasMore} busy={busy || loading} onPage={setPage} />
        </section>
        {selected && (
          <section className="profile-section" aria-label="Selected user">
            <h2>{selected.displayName}</h2>
            <p className="account-email">{selected.email}</p>
            <p>
              <StatusBadge>{selected.status}</StatusBadge> ·{' '}
              {selected.emailVerified ? 'Email verified' : 'Email not verified'}
            </p>
            <p>{selected.roles.join(', ')}</p>
            <Button
              type="button"
              variant="secondary"
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
              <Field
                id="reason"
                name="reason"
                label="Reason"
                minLength={10}
                maxLength={1000}
                required
              />
              <Button type="submit" busy={busy} disabled={selected.id === user?.id}>
                {selected.status === 'ACTIVE' ? 'Confirm suspension' : 'Confirm reactivation'}
              </Button>
            </form>
          </section>
        )}
      </div>
    </section>
  );
}
