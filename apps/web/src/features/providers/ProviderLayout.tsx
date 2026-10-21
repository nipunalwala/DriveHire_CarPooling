import { useEffect, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { CitySchema, type CityDto } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { Button, ErrorState } from '../../components/ui/index.js';
import { PageHeading } from '../../components/PageHeading.js';

export function ProviderLayout({
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
    <section className="workspace-page provider-page">
      <PageHeading title={title} introduction={introduction} actions={actions} />
      <div className="profile-content">{children}</div>
    </section>
  );
}
export function SelectField({
  id,
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { id: string; label: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}
export function CitySelect({
  name,
  defaultValue = '',
  label = 'Service city',
}: {
  name: string;
  defaultValue?: string;
  label?: string;
}) {
  const [cities, setCities] = useState<CityDto[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const rows: CityDto[] = [];
      for (let page = 1; ; page++) {
        const result = await api.requestPage<{ id: string; name: string; timezone: string }>(
          `/cities?page=${page}&pageSize=100`,
        );
        rows.push(...result.data.map((city) => CitySchema.parse(city)));
        if (page * result.meta.pageSize >= result.meta.total) break;
      }
      if (active) setCities(rows);
    }
    void load().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load cities.');
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <>
      {error && (
        <>
          <ErrorState message={error} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setError('');
              setAttempt((value) => value + 1);
            }}
          >
            Reload cities
          </Button>
        </>
      )}
      <SelectField
        key={cities.length}
        id={name}
        name={name}
        label={label}
        defaultValue={defaultValue}
        required
        disabled={!cities.length}
      >
        <option value="">
          {cities.length ? 'Choose a city' : 'Cities unavailable — reload to try again'}
        </option>
        {cities.map((city) => (
          <option key={city.id} value={city.id}>
            {city.name} · {city.timezone}
          </option>
        ))}
      </SelectField>
    </>
  );
}
export function Pages({
  page,
  hasMore,
  busy,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  busy: boolean;
  onPage(page: number): void;
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="page-controls" aria-label="List pages">
      <Button
        type="button"
        variant="secondary"
        disabled={busy || page === 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span>Page {page}</span>
      <Button
        type="button"
        variant="secondary"
        disabled={busy || !hasMore}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
export function messageOf(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : 'Could not complete the request. Please try again.';
}
