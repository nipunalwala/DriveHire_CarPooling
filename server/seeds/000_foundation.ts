import type { Knex } from 'knex';
export async function seed(_knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Seeds are disabled in production');
}
