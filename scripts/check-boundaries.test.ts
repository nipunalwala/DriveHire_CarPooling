import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBoundaries } from './check-boundaries.mjs';

const roots: string[] = [];
async function fixture(file: string, source: string) {
  const root = await mkdtemp(join(tmpdir(), 'drivehire-boundary-'));
  roots.push(root);
  await mkdir(join(root, 'apps/web/src'), { recursive: true });
  await mkdir(join(root, 'packages/contracts/src'), { recursive: true });
  await writeFile(join(root, file), source);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe('browser/server dependency boundary', () => {
  it.each([
    "import { Pool } from 'pg'",
    "export type { Secret } from '../../api/src/config/env.js'",
    "const value = import('node:fs')",
    "import '@prisma/client'",
  ])('rejects a server dependency: %s', async (source) => {
    const issues = await checkBoundaries(await fixture('apps/web/src/entry.ts', source));
    expect(issues).toHaveLength(1);
  });
  it('permits browser-safe shared contracts', async () => {
    expect(
      await checkBoundaries(
        await fixture(
          'apps/web/src/entry.ts',
          "import { UserRoleSchema } from '@drivehire/contracts'",
        ),
      ),
    ).toEqual([]);
  });
  it.each(['apps/web/src/entry.ts', 'packages/contracts/src/index.ts'])(
    'rejects alternate and unresolved dependency forms in %s',
    async (file) => {
      for (const source of [
        'void import(`../../api/src/config/env.js`)',
        'void import("pg/lib/client.js")',
        'void import("prisma/build/index.js")',
        'void import("C:/server/private.js")',
        'void import("/src/server/private.js")',
        'void import("file:///server/private.js")',
        'void import("/@fs/C:/server/private.js")',
        'void import(target)',
        'require(`pg/${target}`)',
      ]) {
        expect(await checkBoundaries(await fixture(file, source)), source).toHaveLength(1);
      }
    },
  );
  it('rejects server imports from the shared contract package too', async () => {
    expect(
      await checkBoundaries(
        await fixture('packages/contracts/src/index.ts', "import 'node:crypto'"),
      ),
    ).toHaveLength(1);
  });
});
