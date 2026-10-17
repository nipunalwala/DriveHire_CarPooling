/** Safety boundary used by infrastructure checks before opening a local test connection. */
export function requireTestDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error('TEST_DATABASE_URL is required; no integration checks ran');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid test database target');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', 'database-test'].includes(url.hostname) ||
    url.pathname !== '/drivehire_test' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.hostname === 'database-test' ? url.port !== '5432' : url.port !== '55433')
  ) {
    throw new Error('Refusing database target outside the dedicated local drivehire_test database');
  }
  return value;
}
