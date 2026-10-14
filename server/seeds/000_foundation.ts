import type { Knex } from 'knex';
import { hashPassword } from '../src/lib/password';
export async function seed(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Seeds are disabled in production');
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || !password || password.length < 12)
    throw new Error(
      'Set both ADMIN_EMAIL and a 12+ character ADMIN_PASSWORD to seed an admin account'
    );
  const fullName = process.env.ADMIN_FULL_NAME?.trim() || 'DriveHire Administrator';
  const existing = await knex('users').where({ email }).first('id');
  if (existing) return;
  await knex('users').insert({
    email,
    password_hash: await hashPassword(password),
    full_name: fullName,
    role: 'admin',
    status: 'active',
    email_verified_at: knex.fn.now()
  });
}
