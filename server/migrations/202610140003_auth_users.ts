import type { Knex } from 'knex';
export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE TYPE user_role AS ENUM ('passenger','driver','owner','admin')");
  await knex.raw("CREATE TYPE user_status AS ENUM ('pending','active','suspended')");
  await knex.raw("CREATE TYPE otp_purpose AS ENUM ('verify_email','reset_password')");
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.specificType('email', 'citext').notNullable().unique();
    t.string('phone', 32).unique().nullable();
    t.text('password_hash').notNullable();
    t.string('full_name', 160).notNullable();
    t.specificType('role', 'user_role').notNullable();
    t.specificType('status', 'user_status').notNullable().defaultTo('pending');
    t.timestamp('email_verified_at', { useTz: true }).nullable();
    t.text('avatar_key').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('deleted_at', { useTz: true }).nullable();
    t.index(['role', 'status']);
    t.index(['deleted_at']);
  });
  await knex.schema.createTable('otp_codes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.specificType('purpose', 'otp_purpose').notNullable();
    t.text('code_hash').notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('consumed_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['user_id', 'purpose', 'consumed_at']);
  });
  await knex.raw(
    'ALTER TABLE otp_codes ADD CONSTRAINT otp_codes_attempts_range CHECK (attempts BETWEEN 0 AND 5)'
  );
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('family_id').notNullable();
    t.text('token_hash').notNullable().unique();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.text('user_agent').nullable();
    t.string('ip', 64).nullable();
    t.uuid('rotated_from_id').nullable().references('id').inTable('refresh_tokens');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['user_id', 'revoked_at', 'expires_at']);
    t.index(['family_id', 'revoked_at']);
  });
  await knex.schema.createTable('password_resets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('token_hash').notNullable().unique();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('consumed_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('auth_login_attempts', (t) => {
    t.string('key_hash', 64).primary();
    t.integer('failures').notNullable().defaultTo(0);
    t.timestamp('window_started_at', { useTz: true }).notNullable();
    t.timestamp('locked_until', { useTz: true }).nullable();
  });
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_login_attempts');
  await knex.schema.dropTableIfExists('password_resets');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('otp_codes');
  await knex.schema.dropTableIfExists('users');
  await knex.raw('DROP TYPE IF EXISTS otp_purpose');
  await knex.raw('DROP TYPE IF EXISTS user_status');
  await knex.raw('DROP TYPE IF EXISTS user_role');
}
