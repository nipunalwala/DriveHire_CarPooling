import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  EmailInputSchema,
  LoginInputSchema,
  OtpInputSchema,
  RegisterInputSchema,
  ResetInputSchema,
} from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, ErrorState, Field } from '../../components/ui/index.js';
type Mode = 'login' | 'register' | 'verify-email' | 'forgot-password' | 'reset-password';
const copy = {
  login: ['Welcome back', 'Sign in to manage your journeys and your account.', 'Sign in'],
  register: [
    'A better journey starts here',
    'Create an account to hire a driver or join a carpool.',
    'Create account',
  ],
  'verify-email': [
    'Check your inbox',
    'Enter the six-digit code from your email. It expires in 10 minutes.',
    'Verify email',
  ],
  'forgot-password': [
    'Let’s get you back in',
    'Enter your email address to request a password reset link.',
    'Send reset link',
  ],
  'reset-password': [
    'Choose a new password',
    'A new password signs you out of your existing sessions.',
    'Save new password',
  ],
} as const;
const schemas = {
  login: LoginInputSchema,
  register: RegisterInputSchema,
  'verify-email': OtpInputSchema,
  'forgot-password': EmailInputSchema,
  'reset-password': ResetInputSchema,
};
export function AuthForm({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [title, intro, action] = copy[mode];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    setErrors({});
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (data.email) data.email = data.email.trim().toLowerCase();
    const result = schemas[mode].safeParse(data);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) fields[String(issue.path[0])] ??= issue.message;
      setErrors(fields);
      setError('Please check the highlighted fields and try again.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.login(data.email ?? '', data.password ?? '');
        const next = params.get('next');
        navigate(
          next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
            ? next
            : '/profile',
          { replace: true },
        );
      } else {
        await api.request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(result.data) });
        if (mode === 'register')
          navigate(`/verify-email?email=${encodeURIComponent(data.email ?? '')}`);
        else if (mode === 'verify-email') navigate('/login?verified=1', { replace: true });
        else if (mode === 'reset-password') navigate('/login?reset=1', { replace: true });
        else
          setNotice(
            'If an account exists for that email, we’ll send a reset link. Check your inbox and spam folder.',
          );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function resend(form: HTMLFormElement) {
    if (Date.now() < resendAt || busy) {
      setNotice('Please wait 60 seconds before requesting another code.');
      return;
    }
    const parsed = EmailInputSchema.safeParse({ email: new FormData(form).get('email') });
    if (!parsed.success) {
      setError('Enter a valid email address before requesting a new code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.request('/auth/resend-otp', { method: 'POST', body: JSON.stringify(parsed.data) });
      setResendAt(Date.now() + 60_000);
      setNotice(
        'If verification is available, a new code is on its way. Wait 60 seconds before requesting another.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout">
      <div className="auth-introduction">
        <Link className="back-link" to="/">
          Back to DriveHire
        </Link>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="service-note">
          <span className="service-line" />
          <h2>Your account. Your next journey.</h2>
          <p>
            One account for driver hiring and shared journeys. Choose what works for you when you’re
            ready.
          </p>
          <p className="small-text">
            DriveHire does not collect payments. Driver and vehicle approval is reviewed separately.
          </p>
        </div>
      </div>
      <div className="auth-form-panel">
        <form onSubmit={(event) => void submit(event)} noValidate aria-label={action}>
          {params.get('verified') === '1' && (
            <p className="success-state" role="status">
              Email verified. You can sign in now.
            </p>
          )}
          {params.get('reset') === '1' && (
            <p className="success-state" role="status">
              Password updated. Sign in with your new password.
            </p>
          )}
          {error && <ErrorState message={error} />}
          {notice && (
            <p className="success-state" role="status">
              {notice}
            </p>
          )}
          {mode === 'register' && (
            <Field
              id="displayName"
              name="displayName"
              label="Your name"
              autoComplete="name"
              required
              maxLength={80}
              error={errors.displayName}
            />
          )}
          {mode !== 'reset-password' && (
            <Field
              id="email"
              name="email"
              label="Email address"
              type="email"
              autoComplete="email"
              defaultValue={params.get('email') ?? ''}
              required
              error={errors.email}
            />
          )}
          {(mode === 'login' || mode === 'register') && (
            <Field
              id="password"
              name="password"
              label="Password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              maxLength={128}
              hint={
                mode === 'register'
                  ? 'Use at least 12 characters. A few memorable words work well.'
                  : undefined
              }
              error={errors.password}
            />
          )}
          {mode === 'verify-email' && (
            <Field
              id="code"
              name="code"
              label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              minLength={6}
              pattern="[0-9]{6}"
              hint="The six-digit code from your email"
              error={errors.code}
            />
          )}
          {mode === 'reset-password' && (
            <>
              <input type="hidden" name="token" value={params.get('token') ?? ''} />
              {!params.get('token') && (
                <p className="field-error">
                  This link is incomplete. <Link to="/forgot-password">Request a new link</Link>.
                </p>
              )}
              <Field
                id="newPassword"
                name="newPassword"
                label="New password"
                type="password"
                autoComplete="new-password"
                required
                maxLength={128}
                hint="Use at least 12 characters."
                error={errors.newPassword}
              />
            </>
          )}
          {mode === 'login' && (
            <Link className="form-link" to="/forgot-password">
              Forgot password?
            </Link>
          )}
          <Button
            type="submit"
            busy={busy}
            disabled={mode === 'reset-password' && !params.get('token')}
          >
            {action}
          </Button>
          {mode === 'verify-email' && (
            <Button
              variant="secondary"
              type="button"
              disabled={busy}
              onClick={(event) => {
                if (event.currentTarget.form) void resend(event.currentTarget.form);
              }}
            >
              Send a new code
            </Button>
          )}
          <p className="form-footer">
            {mode === 'login' ? (
              <>
                New to DriveHire? <Link to="/register">Create an account</Link>
              </>
            ) : mode === 'register' ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <Link to="/login">Back to sign in</Link>
            )}
          </p>
        </form>
      </div>
    </section>
  );
}
