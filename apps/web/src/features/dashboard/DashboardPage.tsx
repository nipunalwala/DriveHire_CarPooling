import { ArrowRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.js';
import { PageHeading } from '../../components/PageHeading.js';
import { StatusBadge } from '../../components/ui/index.js';

const firstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? displayName;

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.roles.includes('DRIVER')) return <Navigate to="/app/driver/dashboard" replace />;

  const isAdmin = user.roles.includes('ADMIN');

  return (
    <section className="workspace-page dashboard-page">
      <PageHeading
        title={`Welcome back, ${firstName(user.displayName)}.`}
        introduction="Book a driver for your own vehicle or join a shared journey."
      >
        <div className="dashboard-actions">
          <Link className="button button-primary" to="/drivers">
            Find a driver <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link className="button button-secondary" to="/carpools">
            Find a carpool
          </Link>
        </div>
      </PageHeading>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="journeys-heading">
          <div className="dashboard-panel-heading">
            <h2 id="journeys-heading">Your journeys</h2>
            <span className="dashboard-panel-note">Requests and participation</span>
          </div>
          <ul className="dashboard-list">
            <li>
              <div className="dashboard-list-copy">
                <h3>
                  <Link to="/app/bookings">Your bookings</Link>
                </h3>
                <p>Review driver requests and confirmed journeys.</p>
              </div>
              <ArrowRight className="dashboard-list-arrow" size={18} aria-hidden="true" />
            </li>
            <li>
              <div className="dashboard-list-copy">
                <h3>
                  <Link to="/app/seats">Carpool seats</Link>
                </h3>
                <p>Check your seats and the status of shared rides.</p>
              </div>
              <ArrowRight className="dashboard-list-arrow" size={18} aria-hidden="true" />
            </li>
          </ul>
        </section>

        <section className="dashboard-panel" aria-labelledby="account-heading">
          <div className="dashboard-panel-heading">
            <h2 id="account-heading">Account</h2>
          </div>
          <div className="dashboard-account-row">
            <span className="dashboard-label">Account status</span>
            <StatusBadge status={user.emailVerified ? 'APPROVED' : 'PENDING'}>
              {user.emailVerified ? 'Email verified' : 'Email not verified'}
            </StatusBadge>
          </div>
          <p className="dashboard-account-email">{user.email}</p>
          {!user.emailVerified && (
            <p className="dashboard-account-action">
              <Link to={`/verify-email?email=${encodeURIComponent(user.email)}`}>
                Verify your email
              </Link>{' '}
              to finish setting up your account.
            </p>
          )}
          <div className="dashboard-account-links">
            <Link to="/profile">Profile settings</Link>
            <Link to="/vehicles">Personal vehicles</Link>
          </div>
        </section>

        {isAdmin && (
          <section className="dashboard-panel dashboard-panel-wide" aria-labelledby="admin-heading">
            <div className="dashboard-panel-heading">
              <h2 id="admin-heading">Administration</h2>
              <span className="dashboard-panel-note">Marketplace operations</span>
            </div>
            <div className="dashboard-admin-links">
              <Link to="/admin/operations">Operations</Link>
              <Link to="/admin/verifications">Qualification reviews</Link>
              <Link to="/admin/users">User accounts</Link>
              <Link to="/admin/audit">Audit log</Link>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
