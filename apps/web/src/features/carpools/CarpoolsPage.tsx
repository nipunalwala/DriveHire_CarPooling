import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CarpoolSchema, CitySchema, type CarpoolDto } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { CitySelect, Pages } from '../providers/ProviderLayout.js';
import { JourneyLayout, journeyTime, money, paymentNotice } from '../bookings/JourneyLayout.js';
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
export function RideSummary({ ride, names }: { ride: CarpoolDto; names: Map<string, string> }) {
  return (
    <>
      <StatusBadge>{ride.status}</StatusBadge>
      <h2>{ride.hostDisplayName}</h2>
      <p>
        {names.get(ride.originCityId) ?? 'Origin city'} to{' '}
        {names.get(ride.destinationCityId) ?? 'Destination city'}
      </p>
      <p>
        {journeyTime(ride.startsAt)} · {ride.vehicleSummary.make} {ride.vehicleSummary.model}
      </p>
      <p>
        {ride.availableSeats === 0 ? 'Full' : `${ride.availableSeats} seats available`} ·{' '}
        {money(ride.pricePerSeatMinor)} per seat
      </p>
      <Link className="button button-secondary" to={`/carpools/${ride.id}`}>
        View ride
      </Link>
    </>
  );
}
export function CarpoolsPage() {
  const [params, setParams] = useSearchParams(),
    [rows, setRows] = useState<CarpoolDto[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const names = useCityNames(),
    search = params.toString(),
    page = Number(params.get('page') ?? 1);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(search);
    query.set('pageSize', '20');
    void api
      .requestPage<unknown>(`/carpools?${query}`)
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
  }, [search, attempt]);
  function load() {
    setLoading(true);
    setError('');
    setRows([]);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      query = new URLSearchParams();
    for (const name of ['originCityId', 'destinationCityId', 'date', 'seats']) {
      const value = String(form.get(name) ?? '');
      if (value) query.set(name, value);
    }
    query.set('page', '1');
    load();
    setParams(query);
    setAttempt((n) => n + 1);
  }
  return (
    <JourneyLayout
      title="Find a carpool"
      introduction="Travel with an approved driver in their own approved vehicle. Seats join instantly; there is no host approval step."
    >
      <form onSubmit={submit} aria-label="Find carpools">
        <h2>Your journey</h2>
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
        <Button type="submit" busy={loading}>
          Find carpools
        </Button>
      </form>
      <p>
        <Link to="/app/carpools/new">Offer a ride</Link>
      </p>
      <p>{paymentNotice}</p>
      {error && (
        <>
          <ErrorState message={error} />
          <Button
            variant="secondary"
            onClick={() => {
              load();
              setAttempt((n) => n + 1);
            }}
          >
            Reload carpools
          </Button>
        </>
      )}
      {loading ? (
        <p role="status">Loading carpools…</p>
      ) : (
        !error && (
          <>
            {rows.length ? (
              <ul className="record-list">
                {rows.map((ride) => (
                  <li key={ride.id}>
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
            <Pages
              page={page}
              hasMore={page * 20 < total}
              busy={loading}
              onPage={(next) => {
                load();
                const query = new URLSearchParams(params);
                query.set('page', String(next));
                setParams(query);
              }}
            />
          </>
        )
      )}
    </JourneyLayout>
  );
}
export function HostedCarpoolsPage() {
  const [rows, setRows] = useState<CarpoolDto[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
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
  return (
    <JourneyLayout
      title="Your hosted carpools"
      introduction="Keep drafts private, publish when ready, and follow the saved state of every ride."
    >
      <p>
        <Link className="button button-primary" to="/app/carpools/new">
          Offer a ride
        </Link>
      </p>
      {error && <ErrorState message={error} />}
      <Button
        variant="secondary"
        busy={loading}
        onClick={() => {
          setLoading(true);
          setError('');
          setAttempt((n) => n + 1);
        }}
      >
        Reload hosted rides
      </Button>
      {loading ? (
        <p role="status">Loading hosted rides…</p>
      ) : (
        !error && (
          <>
            {rows.length ? (
              <ul className="record-list">
                {rows.map((ride) => (
                  <li key={ride.id}>
                    <RideSummary ride={ride} names={names} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No hosted rides yet">
                Create a private draft using your approved personal vehicle.
              </EmptyState>
            )}
            <Pages
              page={page}
              hasMore={page * 20 < total}
              busy={loading}
              onPage={(next) => {
                setLoading(true);
                setError('');
                setPage(next);
              }}
            />
          </>
        )
      )}
    </JourneyLayout>
  );
}
