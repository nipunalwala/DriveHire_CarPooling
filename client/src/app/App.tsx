import { Link, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link className="brand" to="/">
          ◈ <span>DriveHire</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/">Home</Link>
          <Link to="/find">Find a ride</Link>
          <Link to="/carpool">Carpool</Link>
          <Link to="/login">Log in</Link>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer>DriveHire & Carpool · Travel together, arrive with ease.</footer>
    </>
  );
}
function Home() {
  return (
    <Layout>
      <section className="hero">
        <p className="eyebrow">A better way to get there</p>
        <h1>
          More ways to move.
          <br />
          <span>One less thing to worry about.</span>
        </h1>
        <p>Hire a vehicle for your plans or share a ride with people going your way.</p>
        <div className="actions">
          <Link className="button primary" to="/find">
            Find a vehicle
          </Link>
          <Link className="button secondary" to="/carpool">
            Explore carpools
          </Link>
        </div>
        <div className="trust">
          <span>✓ Clear pricing</span>
          <span>✓ Verified profiles</span>
          <span>✓ Local journeys</span>
        </div>
      </section>
      <section className="feature-grid">
        <article>
          <div className="icon">01</div>
          <h2>Choose your journey</h2>
          <p>Find the vehicle or carpool that fits your plans.</p>
        </article>
        <article>
          <div className="icon">02</div>
          <h2>Connect with confidence</h2>
          <p>See clear details and communicate with your host.</p>
        </article>
        <article>
          <div className="icon">03</div>
          <h2>Enjoy the ride</h2>
          <p>Keep your plans in one place from start to finish.</p>
        </article>
      </section>
    </Layout>
  );
}
function Placeholder({ title }: { title: string }) {
  return (
    <Layout>
      <section className="simple">
        <h1>{title}</h1>
        <p>This page will be available in a later project phase.</p>
      </section>
    </Layout>
  );
}
export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/find" element={<Placeholder title="Find a vehicle" />} />
        <Route path="/carpool" element={<Placeholder title="Find a carpool" />} />
        <Route path="/login" element={<Placeholder title="Log in" />} />
        <Route path="*" element={<Placeholder title="Page not found" />} />
      </Routes>
    </ErrorBoundary>
  );
}
