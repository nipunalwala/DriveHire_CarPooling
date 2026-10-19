import { useEffect, useState, type FormEvent } from 'react';
import {
  VehicleInputSchema,
  VehiclePrivateSchema,
  type VehiclePrivateDto,
} from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { CitySelect, messageOf, Pages, ProviderLayout, SelectField } from './ProviderLayout.js';
import { EvidencePanel } from './EvidencePanel.js';

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehiclePrivateDto[]>([]);
  const [selected, setSelected] = useState<VehiclePrivateDto | null>(null);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadedPage, setLoadedPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function reload() {
    const result = await api.requestPage<unknown>(`/users/me/vehicles?page=${page}&pageSize=20`);
    const rows = result.data.map((row) => VehiclePrivateSchema.parse(row));
    setVehicles(rows);
    setHasMore(page * result.meta.pageSize < result.meta.total);
    setLoadedPage(page);
    setSelected((current) =>
      current ? (rows.find((row) => row.id === current.id) ?? current) : null,
    );
  }
  useEffect(() => {
    let active = true;
    void api
      .requestPage<unknown>(`/users/me/vehicles?page=${page}&pageSize=20`)
      .then((result) => {
        const rows = result.data.map((row) => VehiclePrivateSchema.parse(row));
        if (active) {
          setVehicles(rows);
          setHasMore(page * result.meta.pageSize < result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoadedPage(page);
      });
    return () => {
      active = false;
    };
  }, [page]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const draft: Record<string, unknown> = {
      ...data,
      year: Number(data.year),
      seats: Number(data.seats),
      ...(selected ? { version: selected.version } : {}),
    };
    if (!draft.description) delete draft.description;
    const parsed = VehicleInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError('Check all vehicle fields and choose a service city. Your draft has been kept.');
      return;
    }
    setBusy(true);
    try {
      const saved = VehiclePrivateSchema.parse(
        await api.request(selected ? `/vehicles/${selected.id}` : '/vehicles', {
          method: selected ? 'PUT' : 'POST',
          body: JSON.stringify(parsed.data),
        }),
      );
      setSelected(saved);
      setEditing(false);
      setNotice('Vehicle details saved. Add current evidence before submitting for approval.');
      await reload();
    } catch (cause) {
      setError(`${messageOf(cause)} Your draft has been kept.`);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.request(`/vehicles/${selected.id}`, { method: 'DELETE' });
      setSelected(null);
      setNotice('Vehicle archived. Historical records are retained.');
      await reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ProviderLayout
      title="Your personal vehicles"
      introduction="Register your own vehicle, add private evidence and request approval before using it for a journey."
    >
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      <section aria-busy={loadedPage !== page}>
        <div className="section-heading">
          <h2>Saved vehicles</h2>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || editing}
            onClick={() => {
              setSelected(null);
              setEditing(true);
              setError('');
              setNotice('');
            }}
          >
            Add vehicle
          </Button>
        </div>
        {loadedPage !== page ? (
          <p role="status">Loading vehicles…</p>
        ) : vehicles.length ? (
          <ul className="record-list">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <h3>
                  {vehicle.make} {vehicle.model}
                </h3>
                <p>
                  {vehicle.year} · {vehicle.seats} seats ·{' '}
                  <StatusBadge>{vehicle.verificationStatus}</StatusBadge>
                  {vehicle.archivedAt ? ' · Archived' : ''}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || editing}
                  onClick={() => {
                    setSelected(vehicle);
                    setEditing(false);
                    setError('');
                    setNotice('');
                  }}
                >
                  Manage {vehicle.make} {vehicle.model}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No personal vehicles yet">
            Add a vehicle to begin qualification. You do not need driver capability to register your
            own vehicle.
          </EmptyState>
        )}
        <Pages
          page={page}
          hasMore={hasMore}
          busy={busy || editing || loadedPage !== page}
          onPage={(value) => {
            setPage(value);
            setSelected(null);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setError('');
            void reload().catch((cause) => setError(messageOf(cause)));
          }}
        >
          Reload vehicles
        </Button>
      </section>
      {editing && (
        <form
          key={selected?.id ?? 'new'}
          onSubmit={(event) => void save(event)}
          aria-label={selected ? 'Edit vehicle' : 'Add vehicle'}
        >
          <h2>{selected ? 'Edit vehicle' : 'Add vehicle'}</h2>
          <fieldset disabled={busy}>
            <legend>Vehicle details</legend>
            <Field
              id="registrationNumber"
              name="registrationNumber"
              label="Registration number"
              defaultValue={selected?.registrationNumber ?? ''}
              maxLength={30}
              required
            />
            <div className="form-columns">
              <Field
                id="make"
                name="make"
                label="Make"
                defaultValue={selected?.make ?? ''}
                maxLength={60}
                required
              />
              <Field
                id="model"
                name="model"
                label="Model"
                defaultValue={selected?.model ?? ''}
                maxLength={60}
                required
              />
              <Field
                id="year"
                name="year"
                label="Year"
                type="number"
                min={1990}
                max={2100}
                defaultValue={selected?.year ?? ''}
                required
              />
              <Field
                id="seats"
                name="seats"
                label="Total seats, including driver"
                type="number"
                min={2}
                max={12}
                defaultValue={selected?.seats ?? ''}
                required
              />
            </div>
            <SelectField
              id="category"
              name="category"
              label="Category"
              defaultValue={selected?.category ?? 'SEDAN'}
            >
              {['HATCHBACK', 'SEDAN', 'SUV', 'VAN'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="transmission"
              name="transmission"
              label="Transmission"
              defaultValue={selected?.transmission ?? 'MANUAL'}
            >
              <option value="MANUAL">Manual</option>
              <option value="AUTOMATIC">Automatic</option>
            </SelectField>
            <SelectField
              id="fuelType"
              name="fuelType"
              label="Fuel type"
              defaultValue={selected?.fuelType ?? 'PETROL'}
            >
              {['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectField>
            <CitySelect name="cityId" defaultValue={selected?.cityId ?? ''} />
            <Field
              id="description"
              name="description"
              label="Description (optional)"
              defaultValue={selected?.description ?? ''}
              maxLength={1500}
            />
            <div className="action-row">
              <Button type="submit" busy={busy}>
                Save vehicle
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel editing
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {selected && !editing && (
        <section className="profile-section">
          <h2>
            {selected.make} {selected.model}
          </h2>
          <p>
            <StatusBadge>{selected.verificationStatus}</StatusBadge>
          </p>
          {selected.verificationStatus === 'REJECTED' && selected.verificationReason && (
            <section aria-label="Review feedback">
              <h3>Review feedback</h3>
              <p>{selected.verificationReason}</p>
            </section>
          )}
          <p>
            Registration {selected.registrationNumber} · {selected.year} · {selected.seats} seats
          </p>
          {!selected.archivedAt && (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || selected.verificationStatus === 'PENDING'}
                onClick={() => setEditing(true)}
              >
                Edit vehicle
              </Button>
              <EvidencePanel
                key={selected.id}
                basePath={`/vehicles/${selected.id}`}
                version={selected.version}
                status={selected.verificationStatus}
                onChanged={reload}
              />
              <details className="archive-confirmation">
                <summary>Archive this vehicle</summary>
                <p>
                  This removes the vehicle from future use. Historical journey records are retained.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || selected.verificationStatus === 'PENDING'}
                  onClick={() => void archive()}
                >
                  Confirm archive
                </Button>
              </details>
            </>
          )}
        </section>
      )}
    </ProviderLayout>
  );
}
