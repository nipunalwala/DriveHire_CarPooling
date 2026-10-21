import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeading } from '../../components/PageHeading.js';
import { EmptyState, StatusBadge } from '../../components/ui/index.js';
import { ApiError } from '../../api/client.js';

export const paymentNotice = 'Payment not collected by DriveHire.';
export const money = (minor: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
export const journeyTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const statusLabels: Record<string, string> = {
  ACCEPTED: 'Accepted',
  ACTIVE: 'Active',
  APPROVED: 'Approved',
  ASSIGNED: 'Driver assigned',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
  COMPLETED: 'Completed',
  CONFIRMED: 'Confirmed',
  DRAFT: 'Draft',
  EXPIRED: 'Expired',
  FAILED: 'Failed',
  IN_PROGRESS: 'In progress',
  IN_TRANSIT: 'In transit',
  OPEN: 'Open',
  PENDING: 'Pending',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  SCHEDULED: 'Scheduled',
  STARTED: 'Started',
};

export function statusLabel(value: string) {
  return (
    statusLabels[value] ??
    value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

export function JourneyStatus({ status }: { status: string }) {
  return <StatusBadge status={status}>{statusLabel(status)}</StatusBadge>;
}

export function JourneyTime({ value }: { value: string }) {
  return <time dateTime={value}>{journeyTime(value)}</time>;
}

export function dateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isNotFound(cause: unknown) {
  return cause instanceof ApiError && cause.status === 404;
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="journey-back-link" to={to}>
      <ArrowLeft size={16} aria-hidden="true" />
      {children}
    </Link>
  );
}

export function JourneyUnavailable({
  title,
  to,
  action,
}: {
  title: string;
  to: string;
  action: string;
}) {
  return (
    <EmptyState title={title}>
      This record may have been removed, or your account may not have access to it.{' '}
      <Link to={to}>{action}</Link>.
    </EmptyState>
  );
}

export function JourneyLayout({
  title,
  introduction,
  actions,
  children,
}: {
  title: string;
  introduction: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="workspace-page provider-page journey-page">
      <PageHeading title={title} introduction={introduction} actions={actions} />
      <div className="profile-content">{children}</div>
    </section>
  );
}
