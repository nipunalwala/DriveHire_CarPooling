import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
export function DashboardLayout({
  children,
  role = 'passenger'
}: {
  children: ReactNode;
  role?: 'passenger' | 'driver' | 'owner' | 'admin';
}) {
  const links: [string, string][] =
    role === 'owner'
      ? [
          ['Overview', '/owner'],
          ['Vehicles', '/owner/vehicles'],
          ['Bookings', '/owner/bookings']
        ]
      : role === 'driver'
        ? [
            ['Overview', '/driver'],
            ['Requests', '/driver/requests'],
            ['Availability', '/driver/availability']
          ]
        : role === 'admin'
          ? [
              ['Overview', '/admin'],
              ['Users', '/admin/users'],
              ['Reviews', '/admin/verifications']
            ]
          : [
              ['Overview', '/dashboard'],
              ['My bookings', '/bookings'],
              ['My rides', '/rides']
            ];
  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark">↗</span>
          <span>DriveHire</span>
        </Link>
        <nav aria-label={`${role} dashboard`}>
          {links.map(([label, path]) => (
            <Link key={path} to={path}>
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <label className="sr-only" htmlFor="dashboard-search">
            Search
          </label>
          <input id="dashboard-search" placeholder="Search your dashboard" />
          <button aria-label="Notifications">♧</button>
          <button aria-label="Account menu">Account</button>
        </header>
        <main>{children}</main>
      </section>
    </div>
  );
}
