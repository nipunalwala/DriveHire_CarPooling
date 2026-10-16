import { expect, it } from 'vitest';
import { requireTestDatabaseUrl } from './test-database.js';
it('refuses nonlocal, missing or non-test database targets before integration code connects', () => {
  for (const value of [
    undefined,
    'postgresql://u:p@localhost/drivehire_dev',
    'postgresql://u:p@production.example/drivehire_test',
    'https://localhost/drivehire_test',
  ]) {
    expect(() => requireTestDatabaseUrl(value)).toThrow();
  }
  expect(requireTestDatabaseUrl('postgresql://u:p@127.0.0.1:55433/drivehire_test')).toBe(
    'postgresql://u:p@127.0.0.1:55433/drivehire_test',
  );
});
