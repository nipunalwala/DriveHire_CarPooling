import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api/app';
vi.mock('../src/repositories/healthRepository', () => ({ checkDatabase: vi.fn() }));
vi.mock('../src/services/authService', () => ({
  register: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  login: vi.fn(),
  rotateRefresh: vi.fn(),
  logout: vi.fn(),
  logoutEverywhere: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  currentProfile: vi.fn(),
  editProfile: vi.fn(),
  saveAvatar: vi.fn(),
  readAvatar: vi.fn()
}));
import {
  register,
  login,
  forgotPassword,
  rotateRefresh,
  currentProfile
} from '../src/services/authService';
import { createAccessToken } from '../src/lib/accessToken';
describe('auth routes', () => {
  afterEach(() => vi.clearAllMocks());
  it('registers with a public role and returns only a safe profile', async () => {
    vi.mocked(register).mockResolvedValueOnce({
      user: { id: 'safe-id', email: 'a@example.test', role: 'passenger' },
      verificationRequired: true
    } as never);
    const response = await request(createApp())
      .post('/api/v1/auth/register')
      .send({
        email: 'a@example.test',
        password: 'Strong-passphrase-42',
        fullName: 'A Person',
        role: 'passenger'
      });
    expect(response.status).toBe(201);
    expect(response.body.data.user.password_hash).toBeUndefined();
    expect(register).toHaveBeenCalled();
  });
  it('rejects admin role escalation at registration', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/register')
      .send({
        email: 'a@example.test',
        password: 'Strong-passphrase-42',
        fullName: 'A Person',
        role: 'admin'
      });
    expect(response.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });
  it('returns access token and sets an HttpOnly refresh cookie on login', async () => {
    vi.mocked(login).mockResolvedValueOnce({
      accessToken: 'access',
      refreshToken: 'opaque',
      profile: { id: 'me', email: 'a@example.test', role: 'passenger' },
      refreshId: 'private'
    } as never);
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'a@example.test', password: 'secret' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      accessToken: 'access',
      user: { id: 'me', email: 'a@example.test', role: 'passenger' }
    });
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).not.toContain('private');
  });
  it('keeps forgot-password responses generic', async () => {
    vi.mocked(forgotPassword).mockResolvedValueOnce({ accepted: true });
    const response = await request(createApp())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'missing@example.test' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ accepted: true });
  });
  it('rejects refresh requests from an untrusted Origin', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', 'drivehire_refresh=secret');
    expect(response.status).toBe(403);
    expect(rotateRefresh).not.toHaveBeenCalled();
  });
  it('protects profile access and returns only the caller profile', async () => {
    const app = createApp();
    const denied = await request(app).get('/api/v1/users/me');
    expect(denied.status).toBe(401);
    vi.mocked(currentProfile).mockResolvedValueOnce({
      id: 'me',
      email: 'me@example.test',
      role: 'passenger'
    } as never);
    const token = createAccessToken({ sub: 'me', role: 'passenger', status: 'active' });
    const allowed = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.user.id).toBe('me');
  });
});
