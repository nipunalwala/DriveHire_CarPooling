import { getDb } from '../config/db';
export async function insertContactMessage(data: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  await getDb()('contact_messages').insert(data);
}
