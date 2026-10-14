import type { Knex } from 'knex';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('contact_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 120).notNullable();
    table.string('email', 254).notNullable();
    table.text('message').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['created_at']);
  });
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('contact_messages');
}
