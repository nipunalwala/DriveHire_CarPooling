import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ProfileInputSchema, UserSchema } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { PageHeading } from '../../components/PageHeading.js';
export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const isDriver = user.roles.includes('DRIVER');
  const isAdmin = user.roles.includes('ADMIN');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.phone) delete values.phone;
    const parsed = ProfileInputSchema.safeParse(values);
    if (!parsed.success) {
      setError(
        'Check your name and phone number. Include the country code, for example +919876543210.',
      );
      return;
    }
    setBusy(true);
    try {
      setUser(
        UserSchema.parse(
          await api.request('/users/me', { method: 'PATCH', body: JSON.stringify(parsed.data) }),
        ),
      );
      setNotice('Your profile has been saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function enableDriver() {
    setBusy(true);
    setError('');
    try {
      setUser(
        UserSchema.parse(
          await api.request('/users/me/roles', {
            method: 'POST',
            body: JSON.stringify({ role: 'DRIVER' }),
          }),
        ),
      );
      setNotice(
        'Driver capability enabled. Qualification approval is required before accepting work.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-page profile-page">
      <PageHeading
        title="Your profile"
        introduction="Manage the details and access attached to your account."
      >
        <div className="account-identity">
          <StatusBadge status={user.emailVerified ? 'APPROVED' : 'PENDING'}>
            {user.emailVerified ? 'Email verified' : 'Email not verified'}
          </StatusBadge>
          <span className="account-email">{user.email}</span>
        </div>
      </PageHeading>
      <div className="profile-overview">
        <div className="profile-main-column">
          {error && <ErrorState message={error} />}
          {notice && (
            <p className="success-state" role="status">
              {notice}
            </p>
          )}
          <form
            className="profile-form"
            onSubmit={(event) => void save(event)}
            noValidate
            aria-label="Edit profile"
          >
            <div className="form-heading">
              <h2>Personal details</h2>
              <p>These details are used for your account and journey coordination.</p>
            </div>
            <Field
              id="displayName"
              name="displayName"
              label="Your name"
              defaultValue={user.displayName}
              autoComplete="name"
              maxLength={80}
              required
            />
            <Field
              id="phone"
              name="phone"
              label="Phone number (optional)"
              defaultValue={user.phone ?? ''}
              type="tel"
              autoComplete="tel"
              hint="Include your country code, for example +919876543210."
            />
            <div className="form-actions">
              <Button type="submit" busy={busy}>
                Save changes
              </Button>
            </div>
          </form>
        </div>
        <aside className="profile-aside" aria-label="Account and workspace">
          {isDriver ? (
            <section className="profile-section">
              <h2>Driver workspace</h2>
              <p>Qualification, schedule and hosted journeys live in your driver tools.</p>
              <nav className="profile-link-list" aria-label="Driver tools">
                <Link to="/app/driver/dashboard">Driver dashboard</Link>
                <Link to="/driver/qualification">Qualification</Link>
                <Link to="/driver/availability">Availability</Link>
                <Link to="/app/driver/bookings">Driver requests</Link>
                <Link to="/app/carpools">Hosted carpools</Link>
              </nav>
            </section>
          ) : (
            <section className="profile-section">
              <h2>Your journeys</h2>
              <p>Find work or manage journeys you have already started.</p>
              <nav className="profile-link-list" aria-label="Journey tools">
                <Link to="/drivers">Find a driver</Link>
                <Link to="/app/bookings">Your bookings</Link>
                <Link to="/carpools">Find a carpool</Link>
                <Link to="/app/seats">Your carpool seats</Link>
              </nav>
            </section>
          )}
          <section className="profile-section">
            <h2>Your personal vehicles</h2>
            <p>Register your own vehicle and keep its private evidence current.</p>
            <nav className="profile-link-list" aria-label="Vehicle tools">
              <Link to="/vehicles">Manage your personal vehicles</Link>
            </nav>
          </section>
          {!isDriver && (
            <section className="profile-section">
              <h2>Driver access</h2>
              <p>
                Want to drive? Enable driver capability, then complete qualification for
                administrator review.
              </p>
              <Button variant="secondary" onClick={() => void enableDriver()} busy={busy}>
                Enable driver capability
              </Button>
            </section>
          )}
          {isAdmin && (
            <section className="profile-section">
              <h2>Administration</h2>
              <p>Review qualification evidence and manage platform access.</p>
              <nav className="profile-link-list" aria-label="Administration tools">
                <Link to="/admin/verifications">Qualification reviews</Link>
                <Link to="/admin/users">User accounts</Link>
                <Link to="/admin/operations">Bookings &amp; trips</Link>
                <Link to="/admin/audit">Audit log</Link>
              </nav>
            </section>
          )}
          <section className="profile-section profile-account-access">
            <h2>Account access</h2>
            <p>Sign out of this session on this device.</p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void logout()
                  .catch((cause: unknown) =>
                    setError(
                      cause instanceof Error ? cause.message : 'Sign out failed. Please try again.',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Sign out
            </Button>
          </section>
        </aside>
      </div>
    </section>
  );
}
