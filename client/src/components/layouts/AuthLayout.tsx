import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <Link className="brand" to="/">
          <span className="brand-mark">↗</span>
          <span>DriveHire</span>
        </Link>
        <div>{children}</div>
      </section>
      <aside className="auth-visual">
        <p className="eyebrow">Go your way</p>
        <h1>
          Good journeys
          <br />
          begin together.
        </h1>
        <p>Find the ride that fits your day.</p>
      </aside>
    </main>
  );
}
