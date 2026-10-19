import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DriverSchema, type DriverDto } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { Button, EmptyState, ErrorState, Field } from '../../components/ui/index.js';
import { CitySelect, Pages } from '../providers/ProviderLayout.js';
import { JourneyLayout, money, paymentNotice } from '../bookings/JourneyLayout.js';

export function DriversPage() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DriverDto[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;

    void api
      .requestPage<unknown>(`/drivers?page=${page}&pageSize=20&${query}`)
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
  }, [query, page, attempt]);
  function beginLoad() {
    setBusy(true);
    setError('');
    setRows([]);
    setTotal(0);
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const starts = String(data.get('startsAt') ?? '');
    const ends = String(data.get('endsAt') ?? '');
    if (Boolean(starts) !== Boolean(ends) || (starts && new Date(ends) <= new Date(starts))) {
      setError('Choose both times, with the end after the start. Your filters have been kept.');
      return;
    }
    const next = new URLSearchParams();
    const city = String(data.get('cityId') ?? '');
    if (city) next.set('cityId', city);
    if (starts && ends) {
      next.set('startsAt', new Date(starts).toISOString());
      next.set('endsAt', new Date(ends).toISOString());
    }
    const maximum = String(data.get('maximum') ?? '');
    if (maximum !== '') next.set('maxHourlyRateMinor', String(Math.round(Number(maximum) * 100)));
    beginLoad();
    setPage(1);
    setQuery(next.toString());
    setAttempt((value) => value + 1);
  }
  return (
    <JourneyLayout
      title="Find a driver"
      introduction="Choose an approved driver for your own approved personal vehicle. Search a city and the full interval you need."
    >
      <form onSubmit={search}>
        <CitySelect name="cityId" label="City" />
        <div className="form-columns">
          <Field id="search-start" name="startsAt" label="Starts at" type="datetime-local" />
          <Field id="search-end" name="endsAt" label="Ends at" type="datetime-local" />
        </div>
        <Field
          id="maximum-rate"
          name="maximum"
          label="Maximum hourly rate"
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          hint="Optional, in INR. Times use this device’s timezone."
        />
        <Button type="submit" busy={busy}>
          Find drivers
        </Button>
      </form>
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
      <section aria-label="Driver results" aria-busy={busy}>
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
                <ul className="record-list">
                  {rows.map((driver) => (
                    <li key={driver.id}>
                      <h2>{driver.displayName}</h2>
                      <p className="journey-price">
                        {money(driver.hourlyRateMinor)} <span>per hour</span>
                      </p>
                      {driver.bio && <p>{driver.bio}</p>}
                      <Link className="button button-secondary" to={`/drivers/${driver.id}`}>
                        View {driver.displayName}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Pages
                page={page}
                hasMore={page * 20 < total}
                busy={busy}
                onPage={(value) => {
                  beginLoad();
                  setPage(value);
                }}
              />
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
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;

    void api
      .request<unknown>(`/drivers/${encodeURIComponent(id ?? '')}`)
      .then((data) => {
        const parsed = DriverSchema.parse(data);
        if (active) setDriver(parsed);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'This driver is unavailable.');
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  return (
    <JourneyLayout
      title="Driver details"
      introduction="Review the driver’s current rate, then request an estimate for your vehicle and journey."
    >
      {error ? (
        <>
          <ErrorState message={error} />
          <Button
            variant="secondary"
            onClick={() => {
              setDriver(undefined);
              setError('');
              setAttempt((value) => value + 1);
            }}
          >
            Reload driver
          </Button>
        </>
      ) : driver ? (
        <section>
          <h2>{driver.displayName}</h2>
          <p className="journey-price">
            {money(driver.hourlyRateMinor)} <span>per hour</span>
          </p>
          {driver.bio && <p>{driver.bio}</p>}
          <p>Availability and qualification are checked again when you request an estimate.</p>
          <Link className="button button-primary" to={`/app/bookings/new?driverId=${driver.id}`}>
            Hire this driver
          </Link>
          <p className="small-text">{paymentNotice}</p>
        </section>
      ) : (
        <p role="status">Loading driver…</p>
      )}
    </JourneyLayout>
  );
}
