import {
  BriefcaseBusiness,
  Car,
  ClipboardCheck,
  Compass,
  Gauge,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';

export type WorkspaceKind = 'customer' | 'driver';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `app-sidebar-link${isActive ? ' is-active' : ''}`;

export function AppSidebar({ workspace }: { workspace: WorkspaceKind }) {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles.includes('ADMIN'));
  const dashboardPath = workspace === 'driver' ? '/app/driver/dashboard' : '/app/dashboard';

  return (
    <aside className="app-sidebar" aria-label="Workspace navigation">
      <div className="app-sidebar-heading">
        <span className="app-sidebar-kicker">
          {workspace === 'driver' ? 'Driver workspace' : 'Customer workspace'}
        </span>
        <strong>{user?.displayName ?? 'DriveHire'}</strong>
      </div>
      <nav className="app-sidebar-nav">
        <NavLink className={linkClass} to={dashboardPath} end>
          <LayoutDashboard size={18} aria-hidden="true" /> Dashboard
        </NavLink>
        {workspace === 'customer' ? (
          <>
            <span className="app-sidebar-section">Journeys</span>
            <NavLink className={linkClass} to="/drivers">
              <Compass size={18} aria-hidden="true" /> Find a driver
            </NavLink>
            <NavLink className={linkClass} to="/carpools">
              <Users size={18} aria-hidden="true" /> Find a carpool
            </NavLink>
            <NavLink className={linkClass} to="/app/bookings">
              <ClipboardCheck size={18} aria-hidden="true" /> Your bookings
            </NavLink>
            <NavLink className={linkClass} to="/app/seats">
              <BriefcaseBusiness size={18} aria-hidden="true" /> Carpool seats
            </NavLink>
          </>
        ) : (
          <>
            <span className="app-sidebar-section">Driver tools</span>
            <NavLink className={linkClass} to="/driver/qualification">
              <ShieldCheck size={18} aria-hidden="true" /> Qualification
            </NavLink>
            <NavLink className={linkClass} to="/driver/availability">
              <Settings size={18} aria-hidden="true" /> Availability
            </NavLink>
            <NavLink className={linkClass} to="/app/driver/bookings">
              <ClipboardCheck size={18} aria-hidden="true" /> Driver requests
            </NavLink>
            <NavLink className={linkClass} to="/app/carpools">
              <Users size={18} aria-hidden="true" /> Hosted carpools
            </NavLink>
          </>
        )}
        <span className="app-sidebar-section">Account</span>
        <NavLink className={linkClass} to="/vehicles">
          <Car size={18} aria-hidden="true" /> Personal vehicles
        </NavLink>
        <NavLink className={linkClass} to="/profile">
          <UserRound size={18} aria-hidden="true" /> Profile settings
        </NavLink>
        {isAdmin && (
          <>
            <span className="app-sidebar-section">Administration</span>
            <NavLink className={linkClass} to="/admin/operations">
              <Gauge size={18} aria-hidden="true" /> Operations
            </NavLink>
            <NavLink className={linkClass} to="/admin/users">
              <Users size={18} aria-hidden="true" /> User accounts
            </NavLink>
            <NavLink className={linkClass} to="/admin/verifications">
              <ShieldCheck size={18} aria-hidden="true" /> Reviews
            </NavLink>
            <NavLink className={linkClass} to="/admin/audit">
              <ClipboardCheck size={18} aria-hidden="true" /> Audit log
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}
