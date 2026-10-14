import type { ReactNode } from 'react';
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-label="Loading" role="status" />;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="state-card">
      <span className="state-icon" aria-hidden="true">
        ⌖
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="state-card" role="alert">
      <h2>We couldn’t load this yet</h2>
      <p>Your information is safe. Try again in a moment.</p>
      <button className="button secondary" onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}
