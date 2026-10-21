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

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, '$1 $2')
    .trim();

function guidanceFor(vehicle: VehiclePrivateDto) {
  if (vehicle.archivedAt)
    return 'This vehicle is archived. Historical journey records are retained.';
  switch (vehicle.verificationStatus) {
    case 'PENDING':
      return 'Approval is pending. Vehicle details and evidence are locked until review finishes.';
    case 'APPROVED':
      return 'Approved for use. Keep registration and insurance evidence current.';
    case 'REJECTED':
      return 'Changes were requested. Review the feedback, update the details or evidence, then submit a new revision.';
    case 'EXPIRED':
      return 'Approval has expired. Update the vehicle details and add current evidence before resubmitting.';
    default:
      return 'Draft saved. Add current registration and insurance evidence, then submit for review.';
  }
}

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
  function startAdd() {
    setSelected(null);
    setEditing(true);
    setError('');
    setNotice('');
  }
  return (
    <ProviderLayout
      title="Your personal vehicles"
      introduction="Register your own vehicle, add private evidence and request approval before using it for a journey."
      actions={
        <Button
          type="button"
          disabled={busy || editing}
          onClick={startAdd}
          aria-label="Add vehicle"
        >
          Add vehicle
        </Button>
      }
    >
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      <div className="vehicle-workspace">
        <section
          className="vehicle-list-panel"
          aria-label="Saved vehicles"
          aria-busy={loadedPage !== page}
        >
          <div className="section-heading">
            <h2>Saved vehicles</h2>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || editing || loadedPage !== page}
              onClick={() => {
                setError('');
                void reload().catch((cause) => setError(messageOf(cause)));
              }}
            >
              Reload
            </Button>
          </div>
          {loadedPage !== page ? (
            <p role="status">Loading vehicles…</p>
          ) : vehicles.length ? (
            <ul className="vehicle-list">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id}>
                  <button
                    type="button"
                    className={
                      selected?.id === vehicle.id ? 'vehicle-select is-selected' : 'vehicle-select'
                    }
                    aria-pressed={selected?.id === vehicle.id}
                    aria-label={`Manage ${vehicle.make} ${vehicle.model}`}
                    disabled={busy || editing}
                    onClick={() => {
                      setSelected(vehicle);
                      setEditing(false);
                      setError('');
                      setNotice('');
                    }}
                  >
                    <span className="vehicle-select-main">
                      <strong>
                        {vehicle.make} {vehicle.model}
                      </strong>
                      <span>
                        {vehicle.year} · {vehicle.seats} seats
                        {vehicle.archivedAt ? ' · Archived' : ''}
                      </span>
                    </span>
                    <StatusBadge>{vehicle.verificationStatus}</StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No personal vehicles yet">
              Add a vehicle to begin qualification. You do not need driver capability to register
              your own vehicle.
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
        </section>
        <div className="vehicle-detail-panel">
          {editing ? (
            <form
              className="vehicle-form"
              key={selected?.id ?? 'new'}
              onSubmit={(event) => void save(event)}
              aria-label={selected ? 'Edit vehicle' : 'Add vehicle'}
            >
              <div className="form-heading">
                <h2>{selected ? 'Edit vehicle' : 'Add vehicle'}</h2>
                <p>Use the details shown on the vehicle registration.</p>
              </div>
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
                  <SelectField
                    id="category"
                    name="category"
                    label="Category"
                    defaultValue={selected?.category ?? 'SEDAN'}
                  >
                    {['HATCHBACK', 'SEDAN', 'SUV', 'VAN'].map((value) => (
                      <option key={value} value={value}>
                        {titleCase(value)}
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
                </div>
                <SelectField
                  id="fuelType"
                  name="fuelType"
                  label="Fuel type"
                  defaultValue={selected?.fuelType ?? 'PETROL'}
                >
                  {['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID'].map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
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
                <div className="form-actions">
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
          ) : selected ? (
            <>
              <section className="vehicle-summary" aria-labelledby="vehicle-summary-heading">
                <div className="detail-heading">
                  <div>
                    <h2 id="vehicle-summary-heading">
                      {selected.make} {selected.model}
                    </h2>
                    <p>
                      {selected.year} · {selected.seats} seats · Registration{' '}
                      {selected.registrationNumber}
                    </p>
                  </div>
                  <StatusBadge>{selected.verificationStatus}</StatusBadge>
                </div>
                <p className="status-note">{guidanceFor(selected)}</p>
                <dl className="detail-facts">
                  <div>
                    <dt>Category</dt>
                    <dd>{titleCase(selected.category)}</dd>
                  </div>
                  <div>
                    <dt>Transmission</dt>
                    <dd>{titleCase(selected.transmission)}</dd>
                  </div>
                  <div>
                    <dt>Fuel type</dt>
                    <dd>{titleCase(selected.fuelType)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{titleCase(selected.verificationStatus)}</dd>
                  </div>
                </dl>
                {selected.verificationStatus === 'REJECTED' && selected.verificationReason && (
                  <section className="review-feedback" aria-label="Review feedback">
                    <h3>Review feedback</h3>
                    <p>{selected.verificationReason}</p>
                  </section>
                )}
                {!selected.archivedAt && (
                  <div className="form-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || selected.verificationStatus === 'PENDING'}
                      onClick={() => setEditing(true)}
                    >
                      Edit vehicle
                    </Button>
                  </div>
                )}
              </section>
              {!selected.archivedAt && (
                <>
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
                      This removes the vehicle from future use. Historical journey records are
                      retained.
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
            </>
          ) : vehicles.length ? (
            <section className="vehicle-placeholder" aria-label="Vehicle details">
              <h2>Vehicle details</h2>
              <p>Select a saved vehicle to review its approval status and private evidence.</p>
            </section>
          ) : null}
        </div>
      </div>
    </ProviderLayout>
  );
}
