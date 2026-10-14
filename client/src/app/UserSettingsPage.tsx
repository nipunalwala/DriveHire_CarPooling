import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { DashboardLayout } from '../components/layouts/DashboardLayout';
export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .get('/users/me')
      .then((response) => {
        const profile = response.data.data.user;
        setFullName(profile.full_name);
        setPhone(profile.phone ?? '');
      })
      .catch(() => setError('We couldn’t load your profile. Try again.'))
      .finally(() => setLoading(false));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const response = await api.patch('/users/me', { fullName, phone: phone || null });
      setUser(response.data.data.user);
      toast.success('Your profile is up to date.');
    } catch {
      setError('We couldn’t save your changes. Your entries are still here.');
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG or WebP image.');
      return;
    }
    const body = new FormData();
    body.append('avatar', file);
    try {
      await api.post('/users/me/avatar', body);
      toast.success('Profile photo updated.');
    } catch {
      setError('We couldn’t upload that image. Choose a smaller photo and try again.');
    }
  }
  return (
    <DashboardLayout role={user?.role ?? 'passenger'}>
      <p className="eyebrow">Account settings</p>
      <h1>Your profile</h1>
      {loading ? (
        <div className="skeleton" role="status" aria-label="Loading profile" />
      ) : (
        <>
          <label className="avatar-upload">
            Profile photo{' '}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void upload(event.currentTarget.files?.[0])}
            />
            <small>JPG, PNG or WebP. Up to 5 MB.</small>
          </label>
          <form className="auth-form settings-form" onSubmit={submit}>
            <label>
              Full name
              <input
                autoComplete="name"
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary">Save profile</button>
          </form>
        </>
      )}
    </DashboardLayout>
  );
}
export function ChangePasswordPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.post('/users/me/change-password', {
        currentPassword: form.get('currentPassword'),
        newPassword: form.get('newPassword')
      });
      toast.success('Password changed. Other sessions have been signed out.');
      formElement.reset();
    } catch {
      setMessage('We couldn’t change your password. Check your current password and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DashboardLayout role={user?.role ?? 'passenger'}>
      <p className="eyebrow">Account security</p>
      <h1>Change password</h1>
      <form className="auth-form settings-form" onSubmit={submit}>
        <label>
          Current password
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        {message && (
          <p role="alert" className="form-error">
            {message}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </DashboardLayout>
  );
}
