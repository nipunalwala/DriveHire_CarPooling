import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const passwords = Array.from({ length: 4 }, () => randomBytes(24).toString('hex'));
let template = await readFile('.env.example', 'utf8');
const replacements = {
  STORAGE_PRIVATE_ROOT: resolve('private-storage').replaceAll('\\', '/'),
  POSTGRES_PASSWORD: passwords[0],
  RUNTIME_DB_PASSWORD: passwords[1],
  TEST_POSTGRES_PASSWORD: passwords[2],
  TEST_RUNTIME_DB_PASSWORD: passwords[3],
  DATABASE_URL: `postgresql://drivehire_runtime:${passwords[1]}@127.0.0.1:5432/drivehire_dev`,
  MIGRATION_DATABASE_URL: `postgresql://drivehire_migrator:${passwords[0]}@127.0.0.1:5432/drivehire_dev`,
  TEST_DATABASE_URL: `postgresql://drivehire_test_runtime:${passwords[3]}@127.0.0.1:55433/drivehire_test`,
  TEST_MIGRATION_DATABASE_URL: `postgresql://drivehire_test_migrator:${passwords[2]}@127.0.0.1:55433/drivehire_test`,
};
for (const [name, value] of Object.entries(replacements))
  template = template.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${value}`);
await writeFile('.env', template, { flag: 'wx', mode: 0o600 });
console.log(
  'Created ignored .env with random local-only passwords. Existing files are never overwritten.',
);
