import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CarpoolSchema, CitySchema, type CarpoolDto } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { Button, EmptyState, ErrorState, Field } from '../../components/ui/index.js';
import { CitySelect, Pages } from '../providers/ProviderLayout.js';
import {
  JourneyLayout,
  JourneyStatus,
  JourneyTime,
  money,
  paymentNotice,
} from '../bookings/JourneyLayout.js';

export function useCityNames() {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    void (async () => {
      const entries: [string, string][] = [];
      for (let page = 1; ; page++) {
        const result = await api.requestPage<unknown>(`/cities?page=${page}&pageSize=100`);
        for (const raw of result.data) {
          const city = CitySchema.parse(raw);
          entries.push([city.id, city.name]);
        }
        if (page * result.meta.pageSize >= result.meta.total) break;
      }
      if (active) setNames(new Map(entries));
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return names;
}

export function RideSummary({
  ride,
  names,
  hosted = false,
}: {
  ride: CarpoolDto;
  names: Map<string, string>;
  hosted?: boolean;
}) {
  const origin = names.get(ride.originCityId) ?? 'Origin city';
  const destination = names.get(ride.destinationCityId) ?? 'Destination city';
  return (
    <div className="journey-card-content">
      <div className="journey-card-heading">
        <div>
          <h2>
            {origin} to {destination}
          </h2>
          <p className="journey-meta">
            Hosted by {ride.hostDisplayName} · {ride.vehicleSummary.make}{' '}
            {ride.vehicleSummary.model}
          </p>
        </div>
        <JourneyStatus status={ride.status} />
      </div>
      <dl className="record-facts">
        <div>
          <dt>Departure</dt>
          <dd>
            <JourneyTime value={ride.startsAt} />
          </dd>
        </div>
        <div>
          <dt>Seats available</dt>
          <dd>
            {ride.availableSeats === 0 ? 'Full' : `${ride.availableSeats} of ${ride.seatsOffered}`}
          </dd>
        </div>
        <div>
          <dt>Price per seat</dt>
          <dd>{money(ride.pricePerSeatMinor)}</dd>
        </div>
      </dl>
      <div className="journey-card-actions">
        {hosted && ride.status === 'DRAFT' && (
          <Link className="button button-secondary" to={`/app/carpools/${ride.id}/edit`}>
            Edit draft
          </Link>
        )}
        <Link className="button button-secondary" to={`/carpools/${ride.id}`}>
          View ride
        </Link>
      </div>
    </div>
  );
}

export function CarpoolsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<CarpoolDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const names = useCityNames();
  const search = params.toString();
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(search);
    query.set('page', String(page));
    query.set('pageSize', '20');
    void api
      .requestPage<unknown>(`/carpools?${query.toString()}`)
      .then((result) => {
        const rides = result.data.map((row) => CarpoolSchema.parse(row));
        if (active) {
          setRows(rides);
          setTotal(result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Carpools could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, page, attempt]);
  function load() {
    setLoading(true);
    setError('');
    setRows([]);
    setTotal(0);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const name of ['originCityId', 'destinationCityId', 'date', 'seats']) {
      const value = String(form.get(name) ?? '');
      if (value) query.set(name, value);
    }
    query.set('page', '1');
    load();
    setParams(query);
    setAttempt((count) => count + 1);
  }
  function resetFilters() {
    load();
    setParams(new URLSearchParams({ page: '1' }));
    setAttempt((count) => count + 1);
  }
  function changePage(next: number) {
    load();
    const query = new URLSearchParams(params);
    query.set('page', String(next));
    setParams(query);
  }
  return (
    <JourneyLayout
      title="Find a carpool"
      introduction="Travel with an approved driver in their own approved vehicle. Seats join instantly; there is no host approval step."
      actions={
        user?.roles.includes('DRIVER') ? (
          <Link className="button button-primary" to="/app/carpools/new">
            Offer a ride
          </Link>
        ) : undefined
      }
    >
      <form className="journey-filter" onSubmit={submit} aria-label="Find carpools" key={search}>
        <div className="journey-filter-heading">
          <h2>Search filters</h2>
          <p className="small-text">Join instantly when seats are available.</p>
        </div>
        <div className="form-columns">
          <CitySelect
            name="originCityId"
            label="Origin"
            defaultValue={params.get('originCityId') ?? ''}
          />
          <CitySelect
            name="destinationCityId"
            label="Destination"
            defaultValue={params.get('destinationCityId') ?? ''}
          />
          <Field
            id="carpool-date"
            name="date"
            label="Departure date"
            type="date"
            required
            defaultValue={params.get('date') ?? ''}
            hint="The calendar day at your origin city."
          />
          <Field
            id="carpool-seats"
            name="seats"
            label="Seats needed"
            type="number"
            min={1}
            max={11}
            required
            defaultValue={params.get('seats') ?? '1'}
          />
        </div>
        <div className="action-row">
          <Button type="submit" busy={loading}>
            Find carpools
          </Button>
          <Button type="button" variant="secondary" onClick={resetFilters} disabled={loading}>
            Reset filters
          </Button>
        </div>
      </form>
      {error && (
        <>
          <ErrorState message={error} />
          <Button
            variant="secondary"
            onClick={() => {
              load();
              setAttempt((count) => count + 1);
            }}
          >
            Reload carpools
          </Button>
        </>
      )}
      <section className="journey-results" aria-label="Carpool results" aria-busy={loading}>
        <div className="journey-result-heading">
          <h2>Available carpools</h2>
          {!loading && !error && (
            <p className="journey-result-count" aria-live="polite">
              {total === 1 ? '1 carpool' : `${total} carpools`}
            </p>
          )}
        </div>
        {loading ? (
          <p role="status">Loading carpools…</p>
        ) : (
          !error && (
            <>
              {rows.length ? (
                <ul className="record-list journey-list journey-card-grid">
                  {rows.map((ride) => (
                    <li key={ride.id} className="journey-card">
                      <RideSummary ride={ride} names={names} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No carpools match">
                  Try another day, route or seat count. Full and closed rides are not available to
                  join.
                </EmptyState>
              )}
              <Pages page={page} hasMore={page * 20 < total} busy={loading} onPage={changePage} />
            </>
          )
        )}
      </section>
      <p className="small-text">{paymentNotice}</p>
    </JourneyLayout>
  );
}

export function HostedCarpoolsPage() {
  const [rows, setRows] = useState<CarpoolDto[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const names = useCityNames();
  useEffect(() => {
    let active = true;
    void api
      .requestPage<unknown>(`/users/me/carpools?page=${page}&pageSize=20`)
      .then((result) => {
        if (active) {
          setRows(result.data.map((row) => CarpoolSchema.parse(row)));
          setTotal(result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Hosted rides could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, attempt]);
  function load() {
    setLoading(true);
    setError('');
    setRows([]);
    setTotal(0);
  }
  return (
    <JourneyLayout
      title="Your hosted carpools"
      introduction="Keep drafts private, publish when ready, and follow the saved state of every ride."
      actions={
        <Link className="button button-primary" to="/app/carpools/new">
          Offer a ride
        </Link>
      }
    >
      <div className="journey-toolbar">
        <div className="journey-toolbar-actions">
          {!loading && !error && (
            <p className="journey-result-count" aria-live="polite">
              {total === 1 ? '1 hosted ride' : `${total} hosted rides`}
            </p>
          )}
          <Button
            variant="secondary"
            busy={loading}
            onClick={() => {
              load();
              setAttempt((count) => count + 1);
            }}
          >
            Reload hosted rides
          </Button>
        </div>
      </div>
      {error && <ErrorState message={error} />}
      {loading ? (
        <p role="status">Loading hosted rides…</p>
      ) : (
        !error && (
          <>
            {rows.length ? (
              <ul className="record-list journey-list journey-card-grid">
                {rows.map((ride) => (
                  <li key={ride.id} className="journey-card">
                    <RideSummary ride={ride} names={names} hosted />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No hosted rides yet">
                <Link to="/app/carpools/new">Create a private draft</Link> using your approved
                personal vehicle.
              </EmptyState>
            )}
            <Pages
              page={page}
              hasMore={page * 20 < total}
              busy={loading}
              onPage={(next) => {
                load();
                setPage(next);
              }}
            />
          </>
        )
      )}
      <p className="small-text">{paymentNotice}</p>
    </JourneyLayout>
  );
}
