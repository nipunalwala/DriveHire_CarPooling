import { defineConfig, env } from 'prisma/config';

// Migration identity only. Runtime code never applies DDL; it connects
// with the restricted DATABASE_URL through pg.Pool / Prisma adapter.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('MIGRATION_DATABASE_URL'),
  },
});
