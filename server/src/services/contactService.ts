import { insertContactMessage } from '../repositories/contactRepository';
export async function sendContactMessage(input: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  await insertContactMessage(input);
}
