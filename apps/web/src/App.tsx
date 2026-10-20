import { AuditPage } from './features/admin/audit/AuditPage.js';
import { LandingPage } from './features/landing/LandingPage.js';
import { CarpoolsPage, HostedCarpoolsPage } from './features/carpools/CarpoolsPage.js';
import { CarpoolNewPage } from './features/carpools/CarpoolNewPage.js';
import { CarpoolDetailPage } from './features/carpools/CarpoolDetailPage.js';
import { SeatsPage } from './features/seats/SeatsPage.js';
import { useEffect, lazy, Suspense } from 'react';
import { BookingsPage, BookingDetailPage } from './features/bookings/BookingsPage.js';
import { BookingNewPage } from './features/bookings/BookingNewPage.js';
import { DriversPage, DriverDetailPage } from './features/drivers/DriversPage.js';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MoveRight } from 'lucide-react';
import { AuthProvider, ProtectedRoute, useAuth } from './auth/AuthProvider.js';
import { LoginPage } from './features/auth/LoginPage.js';
import { RegisterPage } from './features/auth/RegisterPage.js';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage.js';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage.js';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage.js';
import { ProfilePage } from './features/profile/ProfilePage.js';
import { DriverAvailabilityPage } from './features/providers/DriverAvailabilityPage.js';

import { VehiclesPage } from './features/providers/VehiclesPage.js';
import { DriverQualificationPage } from './features/providers/DriverQualificationPage.js';
import { VerificationPage } from './features/admin/verification/VerificationPage.js';
import { UsersPage } from './features/admin/users/UsersPage.js';
const TripPage = lazy(() =>
  import('./features/trips/TripPage.js').then((module) => ({ default: module.TripPage })),
);
const AdminOperationsPage = lazy(() =>
  import('./features/admin/operations/AdminOperationsPage.js').then((module) => ({
    default: module.AdminOperationsPage,
  })),
);

function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  useEffect(() => {
    document.title = `${location.pathname === '/' ? 'Driver hiring & shared journeys' : location.pathname.slice(1).split('-').join(' ')} · DriveHire`;
    const main = document.getElementById('main');
    if (!main) return;
    const focusHeading = () => {
      const heading = main.querySelector('h1');
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      return true;
    };
    if (focusHeading()) return;
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
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
        <Suspense fallback={<p role="status">Loading journey…</p>}>
          <Routes>
            <Route path="/app/profile" element={<Navigate to="/profile" replace />} />
            <Route path="/app/vehicles" element={<Navigate to="/vehicles" replace />} />
            <Route
              path="/app/driver/profile"
              element={<Navigate to="/driver/qualification" replace />}
            />
            <Route
              path="/app/driver/availability"
              element={<Navigate to="/driver/availability" replace />}
            />
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute>
                  <AuditPage />
                </ProtectedRoute>
              }
            />
            <Route path="/carpools" element={<CarpoolsPage />} />
            <Route path="/carpools/:id" element={<CarpoolDetailPage />} />
            <Route
              path="/app/carpools"
              element={
                <ProtectedRoute>
                  <HostedCarpoolsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/carpools/new"
              element={
                <ProtectedRoute>
                  <CarpoolNewPage key="new" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/carpools/:id/edit"
              element={
                <ProtectedRoute>
                  <CarpoolNewPage key="edit" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/seats"
              element={
                <ProtectedRoute>
                  <SeatsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/trips/:id"
              element={
                <ProtectedRoute>
                  <TripPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/operations"
              element={
                <ProtectedRoute>
                  <AdminOperationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/bookings"
              element={
                <ProtectedRoute>
                  <BookingsPage key="passenger" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/bookings/:id"
              element={
                <ProtectedRoute>
                  <BookingDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/driver/bookings"
              element={
                <ProtectedRoute>
                  <BookingsPage key="driver" driver />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/bookings/new"
              element={
                <ProtectedRoute>
                  <BookingNewPage />
                </ProtectedRoute>
              }
            />
            <Route path="/drivers" element={<DriversPage />} />
            <Route path="/drivers/:id" element={<DriverDetailPage />} />
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/vehicles"
              element={
                <ProtectedRoute>
                  <VehiclesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver/qualification"
              element={
                <ProtectedRoute>
                  <DriverQualificationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/verifications"
              element={
                <ProtectedRoute>
                  <VerificationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/driver/availability"
              element={
                <ProtectedRoute>
                  <DriverAvailabilityPage />
                </ProtectedRoute>
              }
            />
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
        </Suspense>
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
