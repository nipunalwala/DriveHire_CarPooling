import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DriverSchema, type DriverDto } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { Button, EmptyState, ErrorState, Field } from '../../components/ui/index.js';
import { CitySelect, Pages } from '../providers/ProviderLayout.js';
import {
  BackLink,
  JourneyLayout,
  JourneyStatus,
  JourneyUnavailable,
  dateTimeInput,
  isNotFound,
  money,
  paymentNotice,
} from '../bookings/JourneyLayout.js';

export function DriversPage() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<DriverDto[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const search = params.toString();
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  useEffect(() => {
    let active = true;
    const request = new URLSearchParams(search);
    request.set('page', String(page));
    request.set('pageSize', '20');

    void api
      .requestPage<unknown>(`/drivers?${request.toString()}`)
      .then((result) => {
        const drivers = result.data.map((row) => DriverSchema.parse(row));
        if (active) {
          setRows(drivers);
          setTotal(result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'Could not load drivers. Please try again.',
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [search, page, attempt]);
  function beginLoad() {
    setBusy(true);
    setError('');
    setFormError('');
    setRows([]);
    setTotal(0);
  }
  function searchDrivers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const starts = String(data.get('startsAt') ?? '');
    const ends = String(data.get('endsAt') ?? '');
    const startDate = new Date(starts);
    const endDate = new Date(ends);
    if (
      Boolean(starts) !== Boolean(ends) ||
      (starts &&
        (Number.isNaN(startDate.getTime()) ||
          Number.isNaN(endDate.getTime()) ||
          endDate <= startDate))
    ) {
      setFormError('Choose both times, with the end after the start. Your filters have been kept.');
      return;
    }
    const next = new URLSearchParams();
    const city = String(data.get('cityId') ?? '');
    if (city) next.set('cityId', city);
    if (starts && ends) {
      next.set('startsAt', startDate.toISOString());
      next.set('endsAt', endDate.toISOString());
    }
    const maximum = String(data.get('maximum') ?? '');
    if (maximum !== '') next.set('maxHourlyRateMinor', String(Math.round(Number(maximum) * 100)));
    next.set('page', '1');
    beginLoad();
    setParams(next);
    setAttempt((value) => value + 1);
  }
  function resetFilters() {
    beginLoad();
    setParams(new URLSearchParams({ page: '1' }));
    setAttempt((value) => value + 1);
  }
  function changePage(next: number) {
    beginLoad();
    const query = new URLSearchParams(params);
    query.set('page', String(next));
    setParams(query);
  }
  const maximum = params.get('maxHourlyRateMinor');
  return (
    <JourneyLayout
      title="Find a driver"
      introduction="Choose an approved driver for your own approved personal vehicle. Search a city and the full interval you need."
      actions={
        <Link className="button button-secondary" to="/app/bookings">
          Your bookings
        </Link>
      }
    >
      <form
        className="journey-filter"
        onSubmit={searchDrivers}
        aria-label="Search approved drivers"
        key={search}
      >
        <div className="journey-filter-heading">
          <h2>Search filters</h2>
          <p className="small-text">Times use this device’s timezone.</p>
        </div>
        <div className="form-columns">
          <CitySelect name="cityId" label="City" defaultValue={params.get('cityId') ?? ''} />
          <Field
            id="maximum-rate"
            name="maximum"
            label="Maximum hourly rate"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            defaultValue={maximum ? String(Number(maximum) / 100) : ''}
            hint="Optional, in INR."
          />
        </div>
        <div className="form-columns">
          <Field
            id="search-start"
            name="startsAt"
            label="Starts at"
            type="datetime-local"
            defaultValue={dateTimeInput(params.get('startsAt'))}
          />
          <Field
            id="search-end"
            name="endsAt"
            label="Ends at"
            type="datetime-local"
            defaultValue={dateTimeInput(params.get('endsAt'))}
          />
        </div>
        <div className="action-row">
          <Button type="submit" busy={busy}>
            Find drivers
          </Button>
          <Button type="button" variant="secondary" onClick={resetFilters} disabled={busy}>
            Reset filters
          </Button>
        </div>
      </form>
      {formError && <ErrorState message={formError} />}
      {error && (
        <>
          <ErrorState message={error} />
          <Button
            variant="secondary"
            onClick={() => {
              beginLoad();
              setAttempt((value) => value + 1);
            }}
          >
            Reload drivers
          </Button>
        </>
      )}
      <section className="journey-results" aria-label="Driver results" aria-busy={busy}>
        <div className="journey-result-heading">
          <h2>Available drivers</h2>
          {!busy && !error && (
            <p className="journey-result-count" aria-live="polite">
              {total === 1 ? '1 driver' : `${total} drivers`}
            </p>
          )}
        </div>
        {busy ? (
          <p role="status">Finding available drivers…</p>
        ) : (
          !error && (
            <>
              {rows.length === 0 ? (
                <EmptyState title="No drivers match">
                  Change your filters or try another time. Only currently eligible drivers appear
                  here.
                </EmptyState>
              ) : (
                <ul className="record-list journey-list journey-card-grid">
                  {rows.map((driver) => (
                    <li key={driver.id} className="journey-card">
                      <div className="journey-card-heading">
                        <div>
                          <h2>{driver.displayName}</h2>
                          <p className="journey-rate">
                            {money(driver.hourlyRateMinor)} per hour · Current rate
                          </p>
                        </div>
                        <JourneyStatus status={driver.verificationStatus} />
                      </div>
                      {driver.bio && <p>{driver.bio}</p>}
                      <div className="journey-card-actions">
                        <Link className="button button-secondary" to={`/drivers/${driver.id}`}>
                          View driver details
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Pages page={page} hasMore={page * 20 < total} busy={busy} onPage={changePage} />
            </>
          )
        )}
      </section>
      <p className="small-text">{paymentNotice}</p>
    </JourneyLayout>
  );
}

export function DriverDetailPage() {
  const { id = '' } = useParams();
  return <DriverDetails key={id} id={id} />;
}
function DriverDetails({ id }: { id: string }) {
  const [driver, setDriver] = useState<DriverDto>();
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;

    void api
      .request<unknown>(`/drivers/${encodeURIComponent(id ?? '')}`)
      .then((data) => {
        const parsed = DriverSchema.parse(data);
        if (active) {
          setDriver(parsed);
          setMissing(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          if (isNotFound(cause)) setMissing(true);
          else
            setError(
              cause instanceof Error ? cause.message : 'This driver is unavailable right now.',
            );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  return (
    <JourneyLayout
      title="Driver details"
      introduction="Review the driver’s current rate, then request an estimate for your vehicle and journey."
      actions={<BackLink to="/drivers">Back to driver search</BackLink>}
    >
      {missing ? (
        <JourneyUnavailable
          title="Driver unavailable"
          to="/drivers"
          action="Return to driver search"
        />
      ) : error ? (
        <>
          <ErrorState message={error} />
          <Button
            variant="secondary"
            onClick={() => {
              setDriver(undefined);
              setError('');
              setLoading(true);
              setAttempt((value) => value + 1);
            }}
          >
            Reload driver
          </Button>
        </>
      ) : loading ? (
        <p role="status">Loading driver…</p>
      ) : (
        driver && (
          <section className="journey-detail-card" aria-label="Driver summary">
            <div className="journey-card-heading">
              <div>
                <h2>{driver.displayName}</h2>
                <p className="journey-rate">
                  {money(driver.hourlyRateMinor)} per hour · Current rate
                </p>
              </div>
              <JourneyStatus status={driver.verificationStatus} />
            </div>
            {driver.bio && <p>{driver.bio}</p>}
            <dl className="record-facts">
              <div>
                <dt>Rate</dt>
                <dd>{money(driver.hourlyRateMinor)} per hour</dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>
                  {driver.acceptingBookings
                    ? 'Accepting hire requests'
                    : 'Not accepting hire requests'}
                </dd>
              </div>
            </dl>
            <p>
              Availability and qualification are checked again when you request an estimate. Your
              request is confirmed only after the driver accepts.
            </p>
            <div className="journey-card-actions">
              <Link
                className="button button-primary"
                to={`/app/bookings/new?driverId=${driver.id}`}
              >
                Hire this driver
              </Link>
            </div>
            <p className="small-text">{paymentNotice}</p>
          </section>
        )
      )}
    </JourneyLayout>
  );
}
