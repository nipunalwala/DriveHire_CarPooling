import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS citext');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await knex.raw(`CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $$ LANGUAGE plpgsql`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at()');
  // Shared extensions may be used by later migrations and are intentionally retained.
}
