const common = {
  client: 'pg',
  pool: { min: 1, max: 10, acquireTimeoutMillis: 30000, idleTimeoutMillis: 30000 },
  migrations: { directory: './migrations', extension: 'ts' },
  seeds: { directory: './seeds', extension: 'ts' }
};
module.exports = {
  development: { ...common, connection: process.env.DATABASE_URL || 'postgres://drivehire:drivehire@localhost:5432/drivehire_dev' },
  test: { ...common, connection: process.env.TEST_DATABASE_URL || 'postgres://drivehire:drivehire@localhost:5432/drivehire_test', pool: { min: 1, max: 5 } },
  production: { ...common, connection: process.env.DATABASE_URL, pool: { min: 2, max: 20 } }
};
