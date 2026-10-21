import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function Button({
  children,
  busy,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
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
  revealPassword,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  revealPassword?: boolean;
}) {
  const [isRevealed, setIsRevealed] = useState(false);
  const description = [hint ? `${props.id}-hint` : '', error ? `${props.id}-error` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="field">
      <label htmlFor={props.id}>{label}</label>
      {revealPassword && (
        <div className="field-input-wrapper-reveal">
          <input
            {...props}
            type={isRevealed ? 'text' : 'password'}
            aria-invalid={Boolean(error)}
            aria-describedby={description || undefined}
          />
          <button
            type="button"
            className="eye-toggle"
            aria-label={isRevealed ? 'Hide password' : 'Show password'}
            onClick={() => setIsRevealed((prev) => !prev)}
          >
            {isRevealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
      )}
      {!revealPassword && (
        <input
          {...props}
          aria-invalid={Boolean(error)}
          aria-describedby={description || undefined}
        />
      )}
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
  const status = typeof children === 'string' ? children : undefined;
  return (
    <span className="status-badge" data-status={status}>
      {children}
    </span>
  );
}
