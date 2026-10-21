import { useEffect, useState, type FormEvent } from 'react';
import { DocumentSchema, VerificationSchema, type DocumentDto } from '@drivehire/contracts';
import { api } from '../../api/client.js';
import { Button, EmptyState, ErrorState, Field, StatusBadge } from '../../components/ui/index.js';
import { messageOf, Pages, SelectField } from './ProviderLayout.js';

const kindLabel = (kind: string) =>
  kind === 'LICENSE' ? 'License' : kind === 'REGISTRATION' ? 'Registration' : 'Insurance';

function nextStepFor(status: string, documents: DocumentDto[], isDriver: boolean) {
  if (status === 'PENDING')
    return 'Review is pending. Reload status to check the administrator’s decision.';
  if (status === 'REJECTED')
    return 'Review was rejected. Correct your details and evidence, then submit a new revision.';
  if (status === 'EXPIRED')
    return 'Approval has expired. Update your details and upload current evidence before resubmitting.';
  if (!documents.length)
    return `Upload ${isDriver ? 'your license' : 'registration and insurance evidence'} to prepare for review.`;
  if (documents.some((document) => document.scanStatus === 'REJECTED'))
    return 'One or more scans were rejected. Replace them with a clear JPEG, PNG, WebP or PDF before submitting.';
  if (documents.some((document) => document.scanStatus === 'PENDING'))
    return 'Scan checks are still running. Reload status before submitting.';
  if (status === 'APPROVED')
    return isDriver
      ? 'Qualification is approved. Add replacement evidence if a document changes or expires.'
      : 'Vehicle is approved. Add replacement evidence if a document changes or expires.';
  return 'Evidence scans are clean. Submit for review when your details are current.';
}

export function EvidencePanel({
  basePath,
  version,
  status,
  onChanged,
}: {
  basePath: string;
  version: number;
  status: string;
  onChanged(): Promise<void>;
}) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const key = `${basePath}:${page}:${revision}`;
  const isDriver = basePath.startsWith('/drivers/');
  const loading = loadedKey !== key;
  useEffect(() => {
    let active = true;
    void api
      .requestPage<unknown>(`${basePath}/documents?page=${page}&pageSize=20`)
      .then((result) => {
        if (active) {
          setDocuments(result.data.map((row) => DocumentSchema.parse(row)));
          setHasMore(page * result.meta.pageSize < result.meta.total);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoadedKey(key);
      });
    return () => {
      active = false;
    };
  }, [basePath, page, key]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    setFileError('');
    setError('');
    setNotice('');
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 5 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)
    ) {
      setFileError('Choose a JPEG, PNG, WebP or PDF file up to 5 MiB.');
      setError(
        'Choose a JPEG, PNG, WebP or PDF file up to 5 MiB. Your other details have been kept.',
      );
      return;
    }
    if (!data.get('expiresOn')) data.delete('expiresOn');
    setBusy(true);
    try {
      const document = DocumentSchema.parse(
        await api.request(`${basePath}/documents`, { method: 'POST', body: data }),
      );
      form.reset();
      setPage(1);
      setRevision((value) => value + 1);
      setNotice(
        document.scanStatus === 'CLEAN'
          ? 'Document uploaded. Scan status: CLEAN.'
          : `Document uploaded. Scan status: ${document.scanStatus}. It cannot be submitted until CLEAN.`,
      );
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = VerificationSchema.parse(
        await api.request(`${basePath}/verification`, {
          method: 'POST',
          body: JSON.stringify({ version }),
        }),
      );
      setNotice(`Submitted for review: ${result.status}.`);
      await onChanged();
    } catch (cause) {
      setError(
        `${messageOf(cause)} Your details have been kept. Reload status before trying again.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function retire(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.request(`/documents/${id}`, { method: 'DELETE' });
      setRevision((value) => value + 1);
      setNotice('Document removed from current evidence.');
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-section evidence-panel" aria-label="Private evidence">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Review support</p>
          <h2>Private evidence</h2>
        </div>
        <StatusBadge>{status}</StatusBadge>
      </div>
      <p>
        Files stay private. Only clean scans can be submitted, and an administrator must approve
        this record.
      </p>
      {!loading && <p className="next-step">{nextStepFor(status, documents, isDriver)}</p>}
      {error && <ErrorState message={error} />}
      {notice && (
        <p role="status" className="success-state">
          {notice}
        </p>
      )}
      <form
        className="evidence-form"
        onSubmit={(event) => void upload(event)}
        aria-label="Upload private evidence"
      >
        <fieldset disabled={busy || status === 'PENDING'}>
          <legend>Upload a document</legend>
          <SelectField id="kind" name="kind" label="Document type">
            {(isDriver ? ['LICENSE'] : ['REGISTRATION', 'INSURANCE']).map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind)}
              </option>
            ))}
          </SelectField>
          <Field
            id="file"
            name="file"
            label="Evidence file"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            error={fileError || undefined}
            hint="JPEG, PNG, WebP or PDF. Maximum 5 MiB."
          />
          <Field
            id="expiresOn"
            name="expiresOn"
            label="Document expiry date (optional)"
            type="date"
          />
          <div className="form-actions">
            <Button type="submit" busy={busy}>
              Upload document
            </Button>
          </div>
        </fieldset>
      </form>
      <div aria-busy={loading}>
        {loading ? (
          <p role="status">Loading documents…</p>
        ) : documents.length ? (
          <ul className="record-list evidence-list">
            {documents.map((document) => (
              <li key={document.id}>
                <strong>{kindLabel(document.kind)}</strong>
                <p>
                  <StatusBadge>{document.scanStatus}</StatusBadge> · Uploaded{' '}
                  {new Date(document.createdAt).toLocaleDateString()}
                  {document.expiresOn ? ` · Expires ${document.expiresOn}` : ''}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || status === 'PENDING'}
                  onClick={() => void retire(document.id)}
                  aria-label={`Remove ${kindLabel(document.kind).toLowerCase()} document`}
                >
                  Remove document
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No documents yet">
            Upload {isDriver ? 'your license' : 'registration and insurance evidence'} to prepare
            for review.
          </EmptyState>
        )}
      </div>
      <Pages page={page} hasMore={hasMore} busy={busy || loading} onPage={setPage} />
      <div className="form-actions">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setError('');
            setRevision((value) => value + 1);
            void onChanged().catch((cause) => setError(messageOf(cause)));
          }}
        >
          Reload status
        </Button>
        <Button
          type="button"
          disabled={busy || status === 'PENDING' || loading || documents.length === 0}
          onClick={() => void submit()}
        >
          Submit for review
        </Button>
      </div>
    </section>
  );
}
