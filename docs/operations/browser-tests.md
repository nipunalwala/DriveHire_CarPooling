# Isolated authentication browser tests

Use the pinned Node/npm runtime and install locked dependencies with `npm ci`.
Install the browser once with `npx playwright install chromium`.

Start only the browser-owned infrastructure:

```powershell
docker compose -f compose.e2e.yml up -d --wait database-test mailpit-test
npm run test:e2e
```

The `drivehire-e2e` Compose project uses PostgreSQL55434, SMTP11026 and Mailpit18026. It is separate from backend integration services on55433/11025/18025 and development services. The database name remains `drivehire_test`, and the connection guard rejects nonlocal hosts, unexpected ports, non-test databases and URL overrides. The browser server loads local configuration privately, rewrites only the dedicated test ports, migrates/resets only this browser database and creates process-local shared signing/encryption secrets.

Playwright owns API4002, web5174 and the authentication-email delivery loop. It refuses an existing web server and stops its child processes after the suite. Do not run two browser suites concurrently against this fixture. Backend integration tests may run concurrently because they use a different Compose project and database port.

Tests use real API/Prisma writes and Mailpit-delivered OTP/reset credentials. Desktop Chromium and mobile Chromium emulate the supported viewport classes. Retained failure traces/screenshots go to ignored `test-results/`. Layout captures go to ignored `artifacts/auth-desktop.png` and `artifacts/auth-mobile.png`; these are QA evidence, not product imagery. Original editorial assets and provenance remain milestone07.
