import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import {
  DriverPrivateSchema,
  type DriverPrivateDto,
  type VerificationStatus,
} from '@drivehire/contracts';
import { api, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { PageHeading } from '../../components/PageHeading.js';
import { Button, ErrorState, StatusBadge } from '../../components/ui/index.js';

const firstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? displayName;

type SetupDetails = {
  title: string;
  description: string;
  link: string;
};

function describeSetup(driver: DriverPrivateDto | null): SetupDetails {
  switch (driver?.verificationStatus) {
    case 'APPROVED':
      return driver.acceptingBookings
        ? {
            title: 'Your driver profile is approved.',
            description: 'Your public listing is accepting bookings.',
            link: 'Manage qualification',
          }
        : {
            title: 'Your driver profile is approved.',
            description:
              'Your public listing is paused. Turn it back on when you are ready for requests.',
            link: 'Manage listing',
          };
    case 'PENDING':
      return {
        title: 'Qualification is under review.',
        description:
          'You can prepare your availability while the review is completed. You cannot accept work yet.',
        link: 'View qualification',
      };
    case 'REJECTED':
      return {
        title: 'Qualification needs attention.',
        description:
          'Review the feedback on your qualification and resubmit the required evidence.',
        link: 'Review qualification',
      };
    case 'EXPIRED':
      return {
        title: 'Qualification has expired.',
        description: 'Renew your license details and evidence before accepting new work.',
        link: 'Review and renew qualification',
      };
    case 'DRAFT':
      return {
        title: 'Qualification draft saved.',
        description:
          'Finish your license details, upload current evidence and submit for review before accepting work.',
        link: 'View qualification details',
      };
    default:
      return {
        title: 'Qualification not started',
        description: 'Add your license details and evidence before accepting work.',
        link: 'View qualification requirements',
      };
  }
}

function setupAction(driver: DriverPrivateDto | null) {
  switch (driver?.verificationStatus) {
    case 'PENDING':
      return 'View qualification';
    case 'REJECTED':
      return 'Review qualification';
    case 'EXPIRED':
      return 'Renew qualification';
    case 'DRAFT':
      return 'Continue qualification';
    default:
      return 'Set up qualification';
  }
}

export function DriverDashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (!user.roles.includes('DRIVER')) return <Navigate to="/app/dashboard" replace />;
  return <DriverDashboard displayName={user.displayName} />;
}

function DriverDashboard({ displayName }: { displayName: string }) {
  const [driver, setDriver] = useState<DriverPrivateDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void api
      .request('/drivers/me')
      .then((value) => {
        if (active) setDriver(DriverPrivateSchema.parse(value));
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setDriver(null);
          return;
        }
        setError('We could not load your driver setup. Your work links remain available.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const setup = describeSetup(driver);
  const setupStatus: VerificationStatus = driver?.verificationStatus ?? 'DRAFT';
  const needsSetup = !loading && !error && setupStatus !== 'APPROVED';

  return (
    <section className="workspace-page dashboard-page">
      <PageHeading
        title={`Welcome back, ${firstName(displayName)}.`}
        introduction="Keep your driver setup current, respond to requests and manage hosted carpools."
      >
        <div className="dashboard-actions">
          {needsSetup ? (
            <>
              <Link className="button button-primary" to="/driver/qualification">
                {setupAction(driver)} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="button button-secondary" to="/app/driver/bookings">
                View driver requests
              </Link>
            </>
          ) : (
            <>
              <Link className="button button-primary" to="/app/driver/bookings">
                View driver requests <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="button button-secondary" to="/driver/availability">
                Set availability
              </Link>
            </>
          )}
        </div>
      </PageHeading>

      <div className="dashboard-grid">
        <section
          className="dashboard-panel"
          aria-labelledby="driver-setup-heading"
          aria-busy={loading}
        >
          <div className="dashboard-panel-heading">
            <h2 id="driver-setup-heading">Driver setup</h2>
            <span className="dashboard-panel-note">Before you accept work</span>
          </div>
          {loading ? (
            <p role="status">Checking your driver qualification…</p>
          ) : error ? (
            <div className="dashboard-feedback">
              <ErrorState message={error} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setError('');
                  setLoading(true);
                  setAttempt((value) => value + 1);
                }}
              >
                Retry setup check
              </Button>
            </div>
          ) : (
            <>
              <div className="dashboard-account-row">
                <span className="dashboard-label">Qualification</span>
                <StatusBadge>{setupStatus}</StatusBadge>
              </div>
              <h3>{setup.title}</h3>
              <p>{setup.description}</p>
              <p className="dashboard-account-action">
                <Link to="/driver/qualification">{setup.link}</Link>
              </p>
            </>
          )}
          <div className="dashboard-account-links">
            <Link to="/vehicles">Personal vehicles</Link>
            <Link to="/profile">Profile settings</Link>
          </div>
        </section>

        <section className="dashboard-panel" aria-labelledby="driver-work-heading">
          <div className="dashboard-panel-heading">
            <h2 id="driver-work-heading">Your work</h2>
            <span className="dashboard-panel-note">Requests and hosted journeys</span>
          </div>
          <ul className="dashboard-list">
            <li>
              <div className="dashboard-list-copy">
                <h3>
                  <Link to="/app/driver/bookings">Driver requests</Link>
                </h3>
                <p>Review incoming requests and respond with a decision.</p>
              </div>
              <ArrowRight className="dashboard-list-arrow" size={18} aria-hidden="true" />
            </li>
            <li>
              <div className="dashboard-list-copy">
                <h3>
                  <Link to="/app/carpools">Hosted carpools</Link>
                </h3>
                <p>Create and manage scheduled shared journeys.</p>
              </div>
              <ArrowRight className="dashboard-list-arrow" size={18} aria-hidden="true" />
            </li>
            <li>
              <div className="dashboard-list-copy">
                <h3>
                  <Link to="/driver/availability">Availability</Link>
                </h3>
                <p>Set when passengers can request your service.</p>
              </div>
              <ArrowRight className="dashboard-list-arrow" size={18} aria-hidden="true" />
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}
