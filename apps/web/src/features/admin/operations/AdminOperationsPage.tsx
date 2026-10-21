import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BookingSchema,
  TripSchema,
  CarpoolSchema,
  type CarpoolDto,
  type BookingDto,
  type TripDto,
} from '@drivehire/contracts';
import { api, ApiError } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field } from '../../../components/ui/index.js';
import { Pages, SelectField } from '../../providers/ProviderLayout.js';
import { journeyTime, money, statusLabel } from '../../bookings/JourneyLayout.js';
import {
  AdminForbidden,
  AdminPage,
  AdminResultHeading,
  AdminStatus,
  adminLocalDateTime,
} from '../AdminUi.js';

type Kind = 'bookings' | 'carpools' | 'trips';
const kinds: Kind[] = ['bookings', 'carpools', 'trips'];
const kindNames: Record<Kind, string> = {
  bookings: 'Booking',
  carpools: 'Carpool',
  trips: 'Trip',
};
const statuses: Record<Kind, string[]> = {
  bookings: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'FAILED'],
  carpools: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'FAILED'],
  trips: [
    'SCHEDULED',
    'ASSIGNED',
    'STARTED',
    'IN_TRANSIT',
    'COMPLETED',
    'CANCELLED',
    'REJECTED',
    'EXPIRED',
    'FAILED',
  ],
};

function kindOf(value: string | null): Kind {
  return value === 'carpools' || value === 'trips' ? value : 'bookings';
}

export function AdminOperationsPage() {
  const { user } = useAuth();
  const allowed = Boolean(user?.roles.includes('ADMIN'));
  const [params, setParams] = useSearchParams();
  const kind = kindOf(params.get('kind'));
  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const overdue = params.get('overdue') === 'true';
  const fromBound = params.get('from') ?? '';
  const toBound = params.get('to') ?? '';
  const [dateError, setDateError] = useState('');
  const [rows, setRows] = useState<(BookingDto | TripDto | CarpoolDto)[]>([]);
  const [selected, setSelected] = useState<BookingDto | TripDto | CarpoolDto | null>(null);
  const [total, setTotal] = useState(0);
  const [settledKey, setSettledKey] = useState<string>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const query = params.toString();
  const requestKey = `${query}:${attempt}`;
  const loading = settledKey !== requestKey;
  const selectedRow = selected && rows.some((row) => row.id === selected.id) ? selected : null;

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const search = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) search.set('status', status);
    if (kind !== 'trips') {
      if (fromBound) search.set('from', fromBound);
      if (toBound) search.set('to', toBound);
    }
    if (kind === 'trips' && overdue) search.set('overdue', 'true');
    void api
      .requestPage<unknown>(`/admin/${kind}?${search.toString()}`)
      .then((result) => {
        const parsed = result.data.map((row) =>
          kind === 'bookings'
            ? BookingSchema.parse(row)
            : kind === 'carpools'
              ? CarpoolSchema.parse(row)
              : TripSchema.parse(row),
        );
        if (active) {
          setRows(parsed);
          setTotal(result.meta.total);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setRows([]);
          setTotal(0);
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Could not load journey operations. Reload to try again.',
          );
        }
      })
      .finally(() => {
        if (active) setSettledKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [allowed, kind, status, overdue, page, fromBound, toBound, requestKey]);

  function chooseKind(next: Kind) {
    setDateError('');
    setSelected(null);
    setParams(new URLSearchParams({ kind: next, page: '1' }));
  }
  function changeStatus(value: string) {
    setSelected(null);
    const next = new URLSearchParams(params);
    if (value) next.set('status', value);
    else next.delete('status');
    next.set('page', '1');
    setParams(next);
  }
  function changeOverdue(value: boolean) {
    setSelected(null);
    const next = new URLSearchParams(params);
    if (value) next.set('overdue', 'true');
    else next.delete('overdue');
    next.set('page', '1');
    setParams(next);
  }
  function applyDates(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get('from') ?? '');
    const to = String(data.get('to') ?? '');
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
    setSelected(null);
    const next = new URLSearchParams(params);
    if (fromDate) next.set('from', fromDate.toISOString());
    else next.delete('from');
    if (toDate) next.set('to', toDate.toISOString());
    else next.delete('to');
    next.set('page', '1');
    setParams(next);
  }
  function resetFilters() {
    setDateError('');
    setSelected(null);
    setParams(new URLSearchParams({ kind, page: '1' }));
  }
  function changePage(next: number) {
    setSelected(null);
    const query = new URLSearchParams(params);
    query.set('page', String(next));
    setParams(query);
  }

  function amountOrNote(row: BookingDto | TripDto | CarpoolDto) {
    if ('totalMinor' in row) return `${money(row.totalMinor)} estimate`;
    if ('pricePerSeatMinor' in row) return `${money(row.pricePerSeatMinor)} per seat`;
    return row.incidentFlag ? 'Incident flagged' : 'No incident flagged';
  }
  function recordSummary(row: BookingDto | TripDto | CarpoolDto) {
    if ('totalMinor' in row) return `Driver hire - ${row.currency}`;
    if ('hostDisplayName' in row) {
      return `${row.hostDisplayName} - ${row.availableSeats} of ${row.seatsOffered} seats open`;
    }
    return `${statusLabel(row.kind)} trip`;
  }
  function openPath(row: BookingDto | TripDto | CarpoolDto) {
    return kind === 'carpools' ? `/carpools/${row.id}` : `/app/${kind}/${row.id}`;
  }

  return (
    <AdminPage
      title="Journey administration"
      introduction="Inspect bookings, carpools and trips, then open a saved record to take an authorized action with a reason."
    >
      {!allowed ? (
        <AdminForbidden area="journey operations area" />
      ) : (
        <>
          <div className="admin-toolbar">
            <div className="admin-toolbar-top">
              <div className="admin-tabs" role="group" aria-label="Journey type">
                {kinds.map((value) => (
                  <Button
                    key={value}
                    variant={kind === value ? 'primary' : 'secondary'}
                    aria-pressed={kind === value}
                    onClick={() => chooseKind(value)}
                  >
                    {kindNames[value]}s
                  </Button>
                ))}
              </div>
              <div className="admin-toolbar-actions">
                <Button
                  variant="ghost"
                  busy={loading}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Reload operations
                </Button>
              </div>
            </div>
            <form
              className="admin-filters"
              key={`${fromBound}:${toBound}`}
              onSubmit={applyDates}
              aria-label="Journey filters"
            >
              <SelectField
                id="operations-status"
                label="Status"
                value={status}
                onChange={(event) => changeStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                {statuses[kind].map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </SelectField>
              {kind === 'trips' ? (
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={overdue}
                    onChange={(event) => changeOverdue(event.target.checked)}
                  />
                  Overdue trips only
                </label>
              ) : (
                <>
                  <Field
                    id="operations-from"
                    label="From"
                    name="from"
                    type="datetime-local"
                    defaultValue={adminLocalDateTime(fromBound)}
                  />
                  <Field
                    id="operations-to"
                    label="To"
                    name="to"
                    type="datetime-local"
                    defaultValue={adminLocalDateTime(toBound)}
                  />
                  <Button type="submit" variant="secondary">
                    Apply filters
                  </Button>
                </>
              )}
              <Button type="button" variant="ghost" onClick={resetFilters}>
                Reset filters
              </Button>
            </form>
            {dateError && <ErrorState message={dateError} />}
          </div>

          <AdminResultHeading
            title={`${kindNames[kind]} records`}
            count={loading || error ? null : total}
            noun={kindNames[kind].toLowerCase()}
          >
            <p className="admin-inline-note">Payment is not collected by DriveHire.</p>
          </AdminResultHeading>

          {selectedRow && (
            <aside className="admin-selection" aria-label="Selected journey record">
              <div className="admin-selection-heading">
                <div>
                  <span className="admin-selection-kicker">{kindNames[kind]} record</span>
                  <h3>{recordSummary(selectedRow)}</h3>
                  <span className="admin-ref">Reference: {selectedRow.id}</span>
                </div>
                <AdminStatus status={selectedRow.status} />
              </div>
              <dl className="admin-facts admin-facts-inline">
                <div>
                  <dt>Journey window</dt>
                  <dd>
                    <time dateTime={selectedRow.startsAt}>{journeyTime(selectedRow.startsAt)}</time>{' '}
                    until{' '}
                    <time dateTime={selectedRow.endsAt}>{journeyTime(selectedRow.endsAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt>Amount or note</dt>
                  <dd>{amountOrNote(selectedRow)}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{selectedRow.version}</dd>
                </div>
              </dl>
              <div className="admin-selection-actions">
                <p className="admin-inline-note">
                  Open the saved record to take an authorized action. Any action requires an audited
                  reason.
                </p>
                <Link className="button button-primary button-compact" to={openPath(selectedRow)}>
                  Open {kindNames[kind].toLowerCase()}
                </Link>
              </div>
            </aside>
          )}

          {error && (
            <ErrorState
              message={`${error} The current filters have been kept. Use Reload operations to retry.`}
            />
          )}
          {loading ? (
            <p role="status">Loading journey operations...</p>
          ) : error ? null : rows.length ? (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <caption className="admin-visually-hidden">
                    {kindNames[kind]} records matching the current filters
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Status</th>
                      <th scope="col">Journey window</th>
                      <th scope="col">Record</th>
                      <th scope="col">Amount or note</th>
                      <th scope="col" className="admin-cell-action">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} data-selected={selectedRow?.id === row.id}>
                        <td>
                          <AdminStatus status={row.status} />
                        </td>
                        <td>
                          <time dateTime={row.startsAt}>{journeyTime(row.startsAt)}</time>
                          <span className="admin-cell-note">
                            Until <time dateTime={row.endsAt}>{journeyTime(row.endsAt)}</time>
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="admin-record-button"
                            aria-pressed={selectedRow?.id === row.id}
                            aria-label={`Inspect ${kindNames[kind].toLowerCase()} ${row.id}`}
                            onClick={() =>
                              setSelected((current) => (current?.id === row.id ? null : row))
                            }
                          >
                            <span className="admin-cell-title">{recordSummary(row)}</span>
                            <span className="admin-ref">Reference: {row.id}</span>
                          </button>
                        </td>
                        <td>{amountOrNote(row)}</td>
                        <td className="admin-cell-action">
                          <Link
                            className="button button-secondary button-compact"
                            to={openPath(row)}
                          >
                            Open {kindNames[kind].toLowerCase()}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pages page={page} hasMore={page * 20 < total} busy={loading} onPage={changePage} />
            </>
          ) : (
            <EmptyState title={`No ${kind.toLowerCase()} match`}>
              Change the status, journey type or date range, then reload to check for updates.
            </EmptyState>
          )}
        </>
      )}
    </AdminPage>
  );
}
