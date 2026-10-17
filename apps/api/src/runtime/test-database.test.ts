import { expect, it } from 'vitest';
import { requireTestDatabaseUrl } from './test-database.js';
it('permits only the separate browser-test port with the dedicated test database', () => {
  const e2e = 'postgresql://u:p@127.0.0.1:55434/drivehire_test';
  expect(requireTestDatabaseUrl(e2e)).toBe(e2e);
  expect(() => requireTestDatabaseUrl('postgresql://u:p@127.0.0.1:55434/drivehire_dev')).toThrow();
  expect(() => requireTestDatabaseUrl('postgresql://u:p@127.0.0.1:55435/drivehire_test')).toThrow();
});
it('refuses nonlocal, missing or non-test database targets before integration code connects', () => {
  for (const value of [
    undefined,
    'postgresql://u:p@localhost/drivehire_dev',
    'postgresql://u:p@production.example/drivehire_test',
    'https://localhost/drivehire_test',
    'postgresql://u:p@127.0.0.1:55433/drivehire_test?host=outside.example&port=5432',
    'postgresql://u:p@localhost:5432/drivehire_test',
    'postgresql://u:p@database-test:55433/drivehire_test',
    'postgresql://u:p@127.0.0.1:55433/drivehire_test#ignored',
  ]) {
    expect(() => requireTestDatabaseUrl(value)).toThrow();
  }
  expect(requireTestDatabaseUrl('postgresql://u:p@127.0.0.1:55433/drivehire_test')).toBe(
    'postgresql://u:p@127.0.0.1:55433/drivehire_test',
  );
});
