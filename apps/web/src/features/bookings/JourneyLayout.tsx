import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.js';

export const paymentNotice = 'Payment not collected by DriveHire.';
export const money = (minor: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
export const journeyTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export function JourneyLayout({
  title,
  introduction,
  children,
}: {
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <section className="profile-layout provider-page journey-page">
      <div>
        <h1>{title}</h1>
        <p>{introduction}</p>
        <nav className="task-navigation" aria-label="Journey tasks">
          <Link to="/drivers">Find a driver</Link>
          <Link to="/carpools">Find a carpool</Link>
          {user && (
            <>
              <Link to="/app/bookings">Your bookings</Link>
              <Link to="/app/seats">Your carpool seats</Link>
              <Link to="/vehicles">Personal vehicles</Link>
              {user.roles.includes('DRIVER') && (
                <>
                  <Link to="/app/driver/bookings">Driver requests</Link>
                  <Link to="/app/carpools">Your hosted carpools</Link>
                </>
              )}
              {user.roles.includes('ADMIN') && (
                <>
                  <Link to="/admin/operations">Journey administration</Link>
                  <Link to="/admin/users">User accounts</Link>
                  <Link to="/admin/verifications">Qualification reviews</Link>
                  <Link to="/admin/audit">Administrative audit</Link>
                </>
              )}
            </>
          )}
        </nav>
      </div>
      <div className="profile-content">{children}</div>
    </section>
  );
}
