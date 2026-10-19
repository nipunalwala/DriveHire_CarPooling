import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client.js';
import { Button, ErrorState } from '../../../components/ui/index.js';
import { messageOf } from '../../providers/ProviderLayout.js';

export function PrivateEvidence({ id, index }: { id: string; index: number }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function load() {
    setBusy(true);
    setError('');
    try {
      const blob = await api.documentContent(id);
      if (mounted.current) setUrl(URL.createObjectURL(blob));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li>
      {error && <ErrorState message={error} />}
      {url ? (
        <a href={url} download={`private-evidence-${index}`}>
          Download private evidence {index}
        </a>
      ) : (
        <Button type="button" variant="secondary" busy={busy} onClick={() => void load()}>
          Load private evidence {index}
        </Button>
      )}
    </li>
  );
}
