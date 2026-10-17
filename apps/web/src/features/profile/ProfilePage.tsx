import { useState, type FormEvent } from 'react';
import { ProfileInputSchema, UserSchema } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
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
    <section className="profile-layout">
      <div>
        <h1>Your profile</h1>
        <p>Keep your details up to date for your next journey.</p>
        <p>
          <StatusBadge>{user.emailVerified ? 'Email verified' : 'Email not verified'}</StatusBadge>
        </p>
        <p className="account-email">{user.email}</p>
      </div>
      <div className="profile-content">
        {error && <ErrorState message={error} />}
        {notice && (
          <p className="success-state" role="status">
            {notice}
          </p>
        )}
        <form onSubmit={(event) => void save(event)} noValidate aria-label="Edit profile">
          <h2>Personal details</h2>
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
          <Button type="submit" busy={busy}>
            Save changes
          </Button>
        </form>
        <section className="profile-section">
          <h2>Driving with DriveHire</h2>
          <p>
            {user.roles.includes('DRIVER')
              ? 'Driver capability is enabled. Qualification review is separate from account access.'
              : 'Want to drive? Enable driver capability, then complete qualification when onboarding is available.'}
          </p>
          {!user.roles.includes('DRIVER') && (
            <Button variant="secondary" onClick={() => void enableDriver()} busy={busy}>
              Enable driver capability
            </Button>
          )}
        </section>
        <section className="profile-section">
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
      </div>
    </section>
  );
}
