import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookingSchema, TripSchema, type BookingDto, type TripDto } from '@drivehire/contracts';
import { api, ApiError } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthProvider.js';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  StatusBadge,
} from '../../../components/ui/index.js';
import { Pages, SelectField } from '../../providers/ProviderLayout.js';
import { JourneyLayout, journeyTime, money, paymentNotice } from '../../bookings/JourneyLayout.js';

export function AdminOperationsPage() {
  const { user } = useAuth();
  const allowed = Boolean(user?.roles.includes('ADMIN'));
  const [kind, setKind] = useState<'bookings' | 'trips'>('bookings');
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dateBounds, setDateBounds] = useState({ from: '', to: '' });
  const [dateError, setDateError] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<(BookingDto | TripDto)[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) query.set('status', status);
    if (kind === 'bookings') {
      if (dateBounds.from) query.set('from', dateBounds.from);
      if (dateBounds.to) query.set('to', dateBounds.to);
    }
    if (kind === 'trips' && overdue) query.set('overdue', 'true');
    void api
      .requestPage<unknown>(`/admin/${kind}?${query.toString()}`)
      .then((result) => {
        const parsed = result.data.map((row) =>
          kind === 'bookings' ? BookingSchema.parse(row) : TripSchema.parse(row),
        );
        if (active) {
          setRows(parsed);
          setTotal(result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Could not load journey operations. Reload to try again.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowed, kind, status, overdue, page, attempt, dateBounds]);
  function beginLoad() {
    setLoading(true);
    setRows([]);
    setTotal(0);
    setError('');
  }
  const statuses =
    kind === 'bookings'
      ? ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'FAILED']
      : [
          'SCHEDULED',
          'ASSIGNED',
          'STARTED',
          'IN_TRANSIT',
          'COMPLETED',
          'CANCELLED',
          'REJECTED',
          'EXPIRED',
          'FAILED',
        ];
  return (
    <JourneyLayout
      title="Journey administration"
      introduction="Inspect bookings and trips, then open their saved details to record an authorized action with a reason."
    >
      {!allowed ? (
        <EmptyState title="Administrator access is required">
          This area is available to current administrators only.
        </EmptyState>
      ) : (
        <>
          <div className="action-row" role="group" aria-label="Journey type">
            <Button
              variant={kind === 'bookings' ? 'primary' : 'secondary'}
              aria-pressed={kind === 'bookings'}
              onClick={() => {
                beginLoad();
                setKind('bookings');
                setAttempt((value) => value + 1);
                setStatus('');
                setPage(1);
              }}
            >
              Bookings
            </Button>
            <Button
              variant={kind === 'trips' ? 'primary' : 'secondary'}
              aria-pressed={kind === 'trips'}
              onClick={() => {
                beginLoad();
                setKind('trips');
                setAttempt((value) => value + 1);
                setStatus('');
                setPage(1);
              }}
            >
              Trips
            </Button>
          </div>
          <SelectField
            id="operations-status"
            label="Status"
            value={status}
            onChange={(event) => {
              beginLoad();
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          {kind === 'bookings' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const fromDate = from ? new Date(from) : null;
                const toDate = to ? new Date(to) : null;
                if (
                  (fromDate && !Number.isFinite(fromDate.getTime())) ||
                  (toDate && !Number.isFinite(toDate.getTime())) ||
                  (fromDate && toDate && fromDate >= toDate)
                ) {
                  setDateError('From must be earlier than To. Check both dates and try again.');
                  return;
                }
                setDateError('');
                beginLoad();
                setPage(1);
                setDateBounds({
                  from: fromDate?.toISOString() ?? '',
                  to: toDate?.toISOString() ?? '',
                });
              }}
            >
              <div className="form-columns">
                <Field
                  id="operations-from"
                  label="From"
                  type="datetime-local"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
                <Field
                  id="operations-to"
                  label="To"
                  type="datetime-local"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary">
                Apply date filters
              </Button>
              {dateError && <ErrorState message={dateError} />}
            </form>
          )}
          {kind === 'trips' && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={overdue}
                onChange={(event) => {
                  beginLoad();
                  setOverdue(event.target.checked);
                  setPage(1);
                }}
              />
              Overdue trips only
            </label>
          )}
          <Button
            variant="secondary"
            busy={loading}
            onClick={() => {
              beginLoad();
              setAttempt((value) => value + 1);
            }}
          >
            Reload operations
          </Button>
          {error && <ErrorState message={error} />}
          {loading ? (
            <p role="status">Loading journey operations…</p>
          ) : (
            !error && (
              <>
                {rows.length ? (
                  <ul className="record-list">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <StatusBadge>{row.status}</StatusBadge>
                        <h2>{journeyTime(row.startsAt)}</h2>
                        <p>Until {journeyTime(row.endsAt)}</p>
                        {'totalMinor' in row ? (
                          <p>
                            {money(row.totalMinor)} · Estimate. {paymentNotice}
                          </p>
                        ) : (
                          row.incidentFlag && <p>Incident flagged</p>
                        )}
                        <p className="small-text">Reference: {row.id}</p>
                        <Link className="button button-secondary" to={`/app/${kind}/${row.id}`}>
                          Open {kind === 'bookings' ? 'booking' : 'trip'}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No journeys match">
                    Change the status or journey type, or reload to check for updates.
                  </EmptyState>
                )}
                <Pages
                  page={page}
                  hasMore={page * 20 < total}
                  busy={loading}
                  onPage={(value) => {
                    beginLoad();
                    setPage(value);
                  }}
                />
              </>
            )
          )}
        </>
      )}
    </JourneyLayout>
  );
}
