import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading.js';
import { EmptyState } from '../../components/ui/index.js';
import { statusLabel } from '../bookings/JourneyLayout.js';

export function AdminPage({
  title,
  introduction,
  children,
}: {
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  return (
    <section className="workspace-page provider-page admin-page">
      <PageHeading title={title} introduction={introduction} />
      {children}
    </section>
  );
}

export function AdminForbidden({ area }: { area: string }) {
  return (
    <EmptyState title="Administrator access is required">
      This {area} is available to current administrators only.{' '}
      <Link to="/profile">Go to your profile</Link>.
    </EmptyState>
  );
}

export function AdminResultHeading({
  title,
  count,
  noun,
  plural,
  children,
}: {
  title: string;
  count: number | null;
  noun: string;
  plural?: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-result-heading">
      <h2>{title}</h2>
      <div className="admin-result-meta">
        {count !== null && (
          <p className="admin-result-count" aria-live="polite">
            {count === 1 ? `1 ${noun}` : `${count} ${plural ?? `${noun}s`}`}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

export function AdminStatus({ status }: { status: string }) {
  return (
    <span className="status-badge" data-status={status}>
      {statusLabel(status)}
    </span>
  );
}

export function AdminDetailPlaceholder({ children }: { children: ReactNode }) {
  return (
    <aside className="admin-detail admin-detail-placeholder" aria-label="Record details">
      <p>{children}</p>
    </aside>
  );
}

export function AdminReasonField({ id = 'reason' }: { id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>Reason</label>
      <textarea
        id={id}
        name="reason"
        minLength={10}
        maxLength={1000}
        rows={3}
        required
        aria-describedby={`${id}-hint`}
      />
      <span className="field-hint" id={`${id}-hint`}>
        10 to 1,000 characters. This reason is recorded in the audit trail.
      </span>
    </div>
  );
}

export function adminLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
