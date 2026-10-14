import { Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { api } from '../lib/api';
import { DesignPage } from './DesignPage';
import { AuthLayout } from '../components/layouts/AuthLayout';
import { DashboardLayout } from '../components/layouts/DashboardLayout';

function usePageMetadata(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} | DriveHire`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', description);
    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute('content', `${title} | DriveHire`);
  }, [title, description]);
}

function PublicLayout({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(localStorage.getItem('drivehire-theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const [cookieNotice, setCookieNotice] = useState(
    !localStorage.getItem('drivehire-cookie-choice')
  );
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('drivehire-theme', next ? 'dark' : 'light');
  };
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          <span>DriveHire</span>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
        <nav className={menuOpen ? 'mobile-open' : ''} aria-label="Main navigation">
          <Link to="/">Home</Link>
          <Link to="/find">Find a ride</Link>
          <Link to="/carpool">Carpool</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <div className="header-actions">
          <button className="theme-toggle" aria-label="Toggle dark theme" onClick={toggle}>
            {dark ? '☀' : '☾'}
          </button>
          <Link className="login-link" to="/login">
            Log in
          </Link>
          <Link className="button primary small" to="/register">
            Sign up
          </Link>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer>
        <div className="footer-inner">
          <Link className="brand" to="/">
            <span className="brand-mark">↗</span>
            <span>DriveHire</span>
          </Link>
          <p>Go your way. Get there together.</p>
          <nav aria-label="Footer navigation">
            <Link to="/about">About</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/contact">Contact</Link>
          </nav>
          <small>© {new Date().getFullYear()} DriveHire. Better journeys start here.</small>
        </div>
      </footer>
      {cookieNotice && (
        <aside className="cookie-notice" aria-label="Cookie notice">
          <p>We use essential cookies to keep your account secure and remember your preferences.</p>
          <button
            className="button secondary small"
            onClick={() => {
              localStorage.setItem('drivehire-cookie-choice', 'essential');
              setCookieNotice(false);
            }}
          >
            Got it
          </button>
        </aside>
      )}
    </>
  );
}

function SearchWidget() {
  const [mode, setMode] = useState<'hire' | 'carpool'>('hire');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const navigate = useNavigate();
  function submit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (date) params.set('departureAt', date);
    navigate(`${mode === 'hire' ? '/find' : '/carpool'}?${params.toString()}`);
  }
  return (
    <form className="search-card" onSubmit={submit}>
      <div className="search-tabs" role="tablist" aria-label="Journey type">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'hire'}
          className={mode === 'hire' ? 'selected' : ''}
          onClick={() => setMode('hire')}
        >
          Hire a vehicle
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'carpool'}
          className={mode === 'carpool' ? 'selected' : ''}
          onClick={() => setMode('carpool')}
        >
          Find a carpool
        </button>
      </div>
      <div className="search-fields">
        <label>
          Where are you going?
          <input
            aria-label="City"
            placeholder="City or destination"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </label>
        <label>
          When?
          <input
            aria-label="Departure date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button className="button primary" type="submit">
          Search rides <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
function Home() {
  usePageMetadata(
    'Travel smarter, together',
    'Find a vehicle for your plans or share a carpool ride.'
  );
  return (
    <PublicLayout>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A smarter way to travel</p>
          <h1>
            Make the journey
            <br />
            <span>part of the adventure.</span>
          </h1>
          <p className="hero-description">
            Find the right vehicle for your plans, or share the road with people heading your way.
            Clear choices, easy booking, better journeys.
          </p>
          <div className="trust">
            <span>✓ Transparent pricing</span>
            <span>✓ Verified community</span>
            <span>✓ Local journeys</span>
          </div>
        </div>
        <SearchWidget />
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-circle">
            <span className="orbit-pin">⌖</span>
            <span className="orbit-route">····················</span>
            <span className="orbit-car">🚙</span>
          </div>
        </div>
      </section>
      <section className="section steps">
        <div className="section-heading">
          <p className="eyebrow">Simple from the start</p>
          <h2>Three steps to a better trip</h2>
        </div>
        <div className="feature-grid">
          {(
            [
              ['01', 'Choose your ride', 'Browse options that fit your route, group and budget.'],
              [
                '02',
                'Book with confidence',
                'See clear details and know what to expect before you go.'
              ],
              ['03', 'Enjoy the journey', 'Keep your plans together and focus on the road ahead.']
            ] as const
          ).map(([n, t, d]) => (
            <article className="feature-card" key={n}>
              <div className="number-icon">{n}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="trust-strip">
        <span>Made for everyday journeys</span>
        <b>Mumbai</b>
        <b>Pune</b>
        <b>Bengaluru</b>
        <b>Goa</b>
      </section>
      <section className="section split-section">
        <div>
          <p className="eyebrow">Two ways to get there</p>
          <h2>Your journey, your choice.</h2>
          <p className="muted">
            Need the freedom of your own wheels? Or prefer to split the road with good company?
            Start with what works for you.
          </p>
          <div className="choice-row">
            <Link to="/find" className="choice-card">
              <span>01 / DriveHire</span>
              <strong>Find a vehicle</strong>
              <small>Space for plans, people and detours.</small>Explore vehicles →
            </Link>
            <Link to="/carpool" className="choice-card">
              <span>02 / Carpool</span>
              <strong>Share a ride</strong>
              <small>Meet your way there, together.</small>Find a carpool →
            </Link>
          </div>
        </div>
        <div className="quote-card">
          <span className="quote-mark">“</span>
          <p>
            It was easy to find a car for our weekend outside the city. The price was clear from the
            beginning.
          </p>
          <div className="quote-person">
            <span className="avatar">AS</span>
            <span>
              <b>Ananya S.</b>
              <small>Weekend traveler</small>
            </span>
            <span className="stars">★★★★★</span>
          </div>
        </div>
      </section>
      <section className="cta-band">
        <div>
          <p className="eyebrow">Have a seat to spare?</p>
          <h2>Put your next journey to work.</h2>
          <p>Share your car or offer your driving skills to people going your way.</p>
        </div>
        <div className="actions">
          <Link className="button white-button" to="/register?role=driver">
            Become a driver
          </Link>
          <Link className="button outline-button" to="/register?role=owner">
            List your vehicle
          </Link>
        </div>
      </section>
      <section className="section faq-section">
        <div className="section-heading">
          <p className="eyebrow">Good to know</p>
          <h2>A few quick answers</h2>
        </div>
        <details>
          <summary>How does booking work?</summary>
          <p>
            Choose a vehicle, share your trip details and send a request. The owner confirms the
            booking before your plans are final.
          </p>
        </details>
        <details>
          <summary>Are prices shown upfront?</summary>
          <p>
            Yes. You can review the estimated price breakdown before you send a booking request.
          </p>
        </details>
        <details>
          <summary>Can I join a carpool instead?</summary>
          <p>
            Absolutely. Search by destination and departure date to find a ride with available
            seats.
          </p>
        </details>
        <p className="faq-link">
          <Link to="/faq">Visit the help center →</Link>
        </p>
      </section>
    </PublicLayout>
  );
}

function InfoPage({ title, description }: { title: string; description: string }) {
  usePageMetadata(title, description);
  return (
    <PublicLayout>
      <section className="simple">
        <p className="eyebrow">DriveHire</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {title === 'Contact' && <ContactForm />}
      </section>
    </PublicLayout>
  );
}
function ContactForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/contact', {
        name: form.get('name'),
        email: form.get('email'),
        message: form.get('message')
      });
      setSent(true);
    } catch {
      setError('We couldn’t send your message. Please try again; your details are still here.');
    } finally {
      setPending(false);
    }
  }
  return sent ? (
    <p className="success-message" role="status">
      Thanks for reaching out. We’ll be in touch soon.
    </p>
  ) : (
    <form className="contact-form" onSubmit={submit}>
      <label>
        Your name
        <input name="name" required minLength={2} autoComplete="name" />
      </label>
      <label>
        Email address
        <input name="email" required type="email" autoComplete="email" />
      </label>
      <label>
        How can we help?
        <textarea name="message" required minLength={10} rows={5} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
function Placeholder({ title, description }: { title: string; description?: string }) {
  const [params] = useSearchParams();
  usePageMetadata(title, description ?? 'Explore DriveHire rides and vehicle hire.');
  return (
    <PublicLayout>
      <section className="simple">
        <p className="eyebrow">DriveHire</p>
        <h1>{title}</h1>
        <p>
          {description ??
            `We’re getting ${title.toLowerCase()} ready for you. Start with a city or destination and check back soon.`}
        </p>
        {params.size > 0 && <p className="query-note">Your search: {params.toString()}</p>}
        <Link to="/" className="button primary">
          Back to home
        </Link>
      </section>
    </PublicLayout>
  );
}
function AuthPlaceholder({ title, description }: { title: string; description: string }) {
  usePageMetadata(title, description);
  return (
    <AuthLayout>
      <p className="eyebrow">Your next journey starts here</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <Link to="/register" className="button primary">
        Create your account
      </Link>
      <p>
        <Link to="/">Back to DriveHire</Link>
      </p>
    </AuthLayout>
  );
}
function DashboardPreview() {
  usePageMetadata('Dashboard', 'Your journeys and bookings in one place.');
  return (
    <DashboardLayout>
      <p className="eyebrow">Passenger dashboard</p>
      <h1>Your journeys, together.</h1>
      <p className="muted">Bookings and shared rides will appear here.</p>
    </DashboardLayout>
  );
}
const info: Record<string, string> = {
  about:
    'We make everyday journeys easier to plan. DriveHire brings vehicle hire and shared rides together in one thoughtful place.',
  'how-it-works':
    'Search for a vehicle or carpool, compare the details, then send a request. Your trip information stays easy to find from booking to arrival.',
  faq: 'Find a ride that fits your route, group and schedule. Bookings are confirmed by the vehicle owner, and carpool seats are managed by the ride host.',
  terms:
    'Use DriveHire respectfully and provide accurate trip information. Bookings are estimates and do not collect payment. Hosts and renters are responsible for agreed travel arrangements.',
  privacy:
    'We use the information you share to operate your account and coordinate travel. We do not display private account details on public profiles.'
};
export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/find" element={<Placeholder title="Find a vehicle" />} />
        <Route path="/carpool" element={<Placeholder title="Find a carpool" />} />
        <Route
          path="/about"
          element={<InfoPage title="Travel should feel simpler" description={info.about ?? ''} />}
        />
        <Route
          path="/how-it-works"
          element={
            <InfoPage title="A smoother way to go" description={info['how-it-works'] ?? ''} />
          }
        />
        <Route
          path="/contact"
          element={
            <InfoPage
              title="We’re here to help"
              description="Tell us what you need and our team will get back to you."
            />
          }
        />
        <Route
          path="/faq"
          element={<InfoPage title="Frequently asked questions" description={info.faq ?? ''} />}
        />
        <Route
          path="/terms"
          element={<InfoPage title="Terms of use" description={info.terms ?? ''} />}
        />
        <Route
          path="/privacy"
          element={<InfoPage title="Privacy, in plain language" description={info.privacy ?? ''} />}
        />
        <Route
          path="/login"
          element={
            <AuthPlaceholder
              title="Welcome back"
              description="Sign-in forms are part of account setup."
            />
          }
        />
        <Route
          path="/register"
          element={
            <AuthPlaceholder
              title="Create your account"
              description="Join people making everyday travel simpler."
            />
          }
        />
        <Route path="/dashboard" element={<DashboardPreview />} />
        <Route
          path="/design"
          element={import.meta.env.DEV ? <DesignPage /> : <Placeholder title="Page not found" />}
        />
        <Route
          path="*"
          element={
            <Placeholder
              title="Page not found"
              description="We can’t find that page. Let’s get you back on track."
            />
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
