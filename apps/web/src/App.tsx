import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { MoveRight } from 'lucide-react';
import { AuthProvider, ProtectedRoute, useAuth } from './auth/AuthProvider.js';
import { LoginPage } from './features/auth/LoginPage.js';
import { RegisterPage } from './features/auth/RegisterPage.js';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage.js';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage.js';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage.js';
import { ProfilePage } from './features/profile/ProfilePage.js';

function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  useEffect(() => {
    document.title = `${location.pathname === '/' ? 'Driver hiring & shared journeys' : location.pathname.slice(1).split('-').join(' ')} · DriveHire`;
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="DriveHire home">
          <span className="brand-symbol" aria-hidden="true">
            <MoveRight size={21} />
          </span>
          DriveHire<span className="wordmark-detail">&amp; CarPooling</span>
        </Link>
        <nav aria-label="Main navigation">
          {user ? (
            <Link to="/profile">Your profile</Link>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link className="nav-join" to="/register">
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={
              <section className="landing-intro">
                <h1>
                  Your journey.
                  <br />A little more together.
                </h1>
                <p>
                  Hire a driver for your own vehicle, or share a scheduled journey with a carpool.
                  Start with an account, then choose your next step.
                </p>
                <Link className="button button-primary" to={user ? '/profile' : '/register'}>
                  {user ? 'Go to your profile' : 'Create your account'}
                  <MoveRight size={19} aria-hidden="true" />
                </Link>
                <div className="service-summary">
                  <div>
                    <h2>Driver hiring</h2>
                    <p>A driver for your approved personal vehicle.</p>
                  </div>
                  <div>
                    <h2>Shared journeys</h2>
                    <p>A seat in a scheduled, instant-join carpool.</p>
                  </div>
                </div>
                <p className="small-text">
                  Booking and carpool journeys are being built. Payment is not collected by
                  DriveHire.
                </p>
              </section>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <p>This route is not available.</p>
                <Link to="/">Return home</Link>
              </>
            }
          />
        </Routes>
      </main>
      <footer className="site-footer">
        <span>DriveHire &amp; CarPooling</span>
        <span>A clearer way to plan your journey.</span>
      </footer>
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
