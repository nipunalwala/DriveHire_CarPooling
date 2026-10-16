import { Link, Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header>
        <Link to="/" aria-label="DriveHire home">
          DriveHire
        </Link>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <h1>DriveHire &amp; CarPooling</h1>
                <p>The application workspace is ready for the next implementation phase.</p>
                <p>
                  Booking, provider, and carpool workflows will be added through the approved
                  roadmap.
                </p>
              </>
            }
          />
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <p>This route is not available.</p>
                <Link to="/">Return home</Link>
              </>
            }
          />
        </Routes>
      </main>
    </>
  );
}
