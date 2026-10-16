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
  it('rejects server imports from the shared contract package too', async () => {
    expect(
      await checkBoundaries(
        await fixture('packages/contracts/src/index.ts', "import 'node:crypto'"),
      ),
    ).toHaveLength(1);
  });
});
