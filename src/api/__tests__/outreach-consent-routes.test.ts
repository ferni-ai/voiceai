/**
 * The settings screen's on/off switch and channel choices must be saved where
 * the daily scheduler reads them. They used to go only to an in-memory engine,
 * so switching outreach off didn't stop the scheduled sends.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const writeOutreachConsent = vi.fn(async () => undefined);
const readOutreachConsent = vi.fn(async () => ({ enabled: true, channels: [] as string[] }));
const requireAuth = vi.fn();

vi.mock('../../services/outreach/outreach-consent.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/outreach-consent.js')>()),
  writeOutreachConsent,
  readOutreachConsent,
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: vi.fn(() => false),
  requireAuth,
}));

const { handleOutreachRoutes } = await import('../outreach.routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((r) => {
    server.listen(0, r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({
    userId: 'u1',
    isAdmin: false,
    isDevMode: false,
    authMethod: 'firebase',
  });
});

const call = (method: string, path: string, body?: unknown) =>
  fetch(`${base}/api/outreach${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('outreach consent routes', () => {
  it('saves switching outreach off for the logged-in user', async () => {
    const res = await call('POST', '/preferences', {
      userId: 'someone-else',
      preferences: { enabled: false, allowedChannels: ['sms', 'call'] },
    });
    expect(res.status).toBe(200);
    expect(writeOutreachConsent).toHaveBeenCalledWith('u1', {
      enabled: false,
      channels: ['sms', 'voice_call'],
    });
  });

  it('leaves channels alone when the request does not mention them', async () => {
    await call('POST', '/preferences', { preferences: { timezone: 'America/Denver' } });
    expect(writeOutreachConsent).toHaveBeenCalledWith('u1', {
      enabled: undefined,
      channels: undefined,
    });
  });

  it('reports a failed save instead of claiming success', async () => {
    writeOutreachConsent.mockRejectedValueOnce(new Error('firestore down'));
    const res = await call('POST', '/preferences', { preferences: { enabled: false } });
    expect(res.status).toBe(500);
  });

  it('pause and resume are saved too', async () => {
    await call('POST', '/pause', {});
    expect(writeOutreachConsent).toHaveBeenLastCalledWith('u1', { enabled: false });
    await call('POST', '/resume', {});
    expect(writeOutreachConsent).toHaveBeenLastCalledWith('u1', { enabled: true });
  });

  it('reports the stored consent: on by default, only chosen channels', async () => {
    readOutreachConsent.mockResolvedValueOnce({ enabled: true, channels: ['voice_call'] });
    const body = (await (await call('GET', '/preferences')).json()) as {
      outreachEnabled: boolean;
      allowedChannels: string[];
    };
    expect(body.outreachEnabled).toBe(true);
    expect(body.allowedChannels).toEqual(['call']);
  });
});
