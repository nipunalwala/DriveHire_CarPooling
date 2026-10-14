import { getDb } from '../config/db';
export async function checkDatabase(): Promise<void> {
  await getDb().raw('SELECT 1');
}
