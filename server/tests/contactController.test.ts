import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createContactMessage } from '../src/controllers/contactController';
import { sendContactMessage } from '../src/services/contactService';
vi.mock('../src/services/contactService', () => ({ sendContactMessage: vi.fn() }));
function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
describe('contact endpoint controller', () => {
  beforeEach(() => vi.clearAllMocks());
  it('stores valid messages and returns an acknowledgement', async () => {
    const res = response();
    const next = vi.fn();
    await createContactMessage(
      {
        body: {
          name: 'Riya Shah',
          email: 'riya@example.test',
          message: 'Please tell me about vehicle hire.'
        }
      } as Request,
      res as unknown as Response,
      next
    );
    expect(sendContactMessage).toHaveBeenCalledWith({
      name: 'Riya Shah',
      email: 'riya@example.test',
      message: 'Please tell me about vehicle hire.'
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
  it('rejects malformed messages before storage', async () => {
    const res = response();
    const next = vi.fn();
    await createContactMessage(
      { body: { name: 'x', email: 'bad', message: 'short' } } as Request,
      res as unknown as Response,
      next
    );
    expect(sendContactMessage).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});
