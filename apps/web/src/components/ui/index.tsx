import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';

export function Button({
  children,
  busy,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      {...props}
      className={`button button-${variant}`}
      disabled={props.disabled || busy}
      aria-busy={busy}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}
export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}) {
  const description = [hint ? `${props.id}-hint` : '', error ? `${props.id}-error` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="field">
      <label htmlFor={props.id}>{label}</label>
      <input {...props} aria-invalid={Boolean(error)} aria-describedby={description || undefined} />
      {hint && (
        <span className="field-hint" id={`${props.id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${props.id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
export function ErrorState({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [message]);
  return (
    <div className="error-state" role="alert" tabIndex={-1} ref={ref}>
      <strong>Something needs your attention</strong>
      <p>{message}</p>
    </div>
  );
}
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function StatusBadge({ children }: { children: React.ReactNode }) {
  return <span className="status-badge">{children}</span>;
}
