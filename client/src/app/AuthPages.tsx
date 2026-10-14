import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthLayout } from '../components/layouts/AuthLayout';
import { api, setAccessToken } from '../lib/api';
import { useAuth } from './AuthContext';
type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;
export function AuthPage({ mode }: { mode: AuthMode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resendSeconds, setResendSeconds] = useState(60);
  const { setUser } = useAuth();
  useEffect(() => {
    if (mode !== 'verify' || resendSeconds === 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [mode, resendSeconds]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (mode === 'login') {
        const result = await api.post('/auth/login', {
          email: data.get('email'),
          password: data.get('password')
        });
        setAccessToken(result.data.data.accessToken as string);
        const user = result.data.data.user as {
          id: string;
          email: string;
          full_name: string;
          role: 'passenger' | 'driver' | 'owner' | 'admin';
          status: 'active' | 'pending' | 'suspended';
        };
        setUser(user);
        toast.success('Welcome back.');
        navigate(user.role === 'passenger' ? '/dashboard' : `/${user.role}`);
      }
      if (mode === 'register') {
        const password = String(data.get('password') ?? '');
        if (!passwordPattern.test(password)) {
          setMessage('Use 12 or more characters with uppercase, lowercase, a number and a symbol.');
          return;
        }
        const result = await api.post('/auth/register', {
          email: data.get('email'),
          password,
          fullName: data.get('fullName'),
          role: data.get('role')
        });
        if (result.status === 201)
          navigate(`/verify-otp?email=${encodeURIComponent(String(data.get('email')))}`);
      }
      if (mode === 'verify') {
        await api.post('/auth/verify-otp', {
          email: params.get('email') ?? data.get('email'),
          code: data.get('code')
        });
        toast.success('Email verified. You can sign in now.');
        navigate('/login');
      }
      if (mode === 'forgot') {
        await api.post('/auth/forgot-password', { email: data.get('email') });
        setMessage('If an account matches that email, a reset link is on its way.');
      }
      if (mode === 'reset') {
        const password = String(data.get('password') ?? '');
        if (!passwordPattern.test(password)) {
          setMessage('Use 12 or more characters with uppercase, lowercase, a number and a symbol.');
          return;
        }
        await api.post('/auth/reset-password', {
          token: params.get('token'),
          newPassword: password
        });
        toast.success('Password updated. Sign in with your new password.');
        navigate('/login');
      }
    } catch (error) {
      const detail = (error as { response?: { data?: { error?: { message?: string } } } }).response
        ?.data?.error?.message;
      setMessage(detail ?? 'We couldn’t complete that request. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<AuthMode, string> = {
    login: 'Welcome back',
    register: 'Create your account',
    verify: 'Check your inbox',
    forgot: 'Reset your password',
    reset: 'Choose a new password'
  };
  return (
    <AuthLayout>
      <p className="eyebrow">Your next journey starts here</p>
      <h1>{titles[mode]}</h1>
      <p className="auth-intro">
        {mode === 'login'
          ? 'Sign in to pick up where you left off.'
          : mode === 'register'
            ? 'A simpler way to get there is a few details away.'
            : mode === 'verify'
              ? 'Enter the six-digit code we sent to your email.'
              : mode === 'forgot'
                ? 'We’ll send a reset link if we find an account for that email.'
                : 'Create a strong password for your account.'}
      </p>
      <form className="auth-form" onSubmit={submit}>
        {(mode === 'login' || mode === 'register' || mode === 'verify' || mode === 'forgot') && (
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={params.get('email') ?? ''}
              readOnly={mode === 'verify' && Boolean(params.get('email'))}
            />
          </label>
        )}
        {mode === 'register' && (
          <>
            <label>
              Full name
              <input name="fullName" autoComplete="name" minLength={2} required />
            </label>
            <label>
              I’m joining as
              <select name="role" defaultValue={params.get('role') ?? 'passenger'}>
                <option value="passenger">Passenger</option>
                <option value="driver">Driver</option>
                <option value="owner">Vehicle owner</option>
              </select>
            </label>
          </>
        )}
        {mode === 'login' && (
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        )}
        {mode === 'register' && (
          <>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
              <small>12+ characters with uppercase, lowercase, a number and a symbol.</small>
            </label>
            <label className="terms-check">
              <input type="checkbox" required /> I agree to the{' '}
              <Link to="/terms">Terms of use</Link> and <Link to="/privacy">Privacy policy</Link>.
            </label>
          </>
        )}
        {mode === 'verify' && (
          <label>
            6-digit code
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              minLength={6}
              maxLength={6}
              required
            />
          </label>
        )}
        {mode === 'reset' && (
          <label>
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
        )}
        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'login'
              ? 'Sign in'
              : mode === 'register'
                ? 'Create account'
                : mode === 'verify'
                  ? 'Verify email'
                  : mode === 'forgot'
                    ? 'Send reset link'
                    : 'Update password'}
        </button>
      </form>
      <div className="auth-links">
        {mode === 'login' && (
          <>
            <Link to="/forgot-password">Forgot your password?</Link>
            <p>
              New to DriveHire? <Link to="/register">Create an account</Link>
            </p>
          </>
        )}
        {mode === 'register' && (
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        )}
        {mode === 'forgot' && <Link to="/login">Back to sign in</Link>}
        {mode === 'verify' && (
          <button
            className="text-button"
            type="button"
            disabled={resendSeconds > 0}
            onClick={async () => {
              try {
                await api.post('/auth/resend-otp', { email: params.get('email') });
                setMessage(
                  'If your account is waiting for verification, a new code has been sent.'
                );
                setResendSeconds(60);
              } catch {
                setMessage('Please wait before requesting another code.');
              }
            }}
          >
            {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
          </button>
        )}
      </div>
    </AuthLayout>
  );
}
