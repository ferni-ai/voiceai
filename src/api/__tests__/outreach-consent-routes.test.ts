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
const fb = { phoneNumber: '+15552017497' as string | undefined };

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

// The panel's channel switches are also saved to messagingPrefs (messaging-prefs-route.test.ts).
const writePrefs = vi.fn(async () => undefined);
vi.mock('../../services/messaging/prefs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/messaging/prefs.js')>()),
  writePrefs,
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({ getFirebaseUser: async () => fb }));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { handleOutreachRoutes } = await import('../outreach.routes.js');
const DISCLOSURE = '2026-10-18';
const how = { disclosureVersion: DISCLOSURE, source: 'web-settings' };

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
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
  fb.phoneNumber = '+15552017497';
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
  it('refuses adding texts or calls for a user without a verified phone, and saves nothing', async () => {
    fb.phoneNumber = undefined;
    for (const channel of ['sms', 'call']) {
      const res = await call('POST', '/preferences', {
        preferences: { allowedChannels: [channel], disclosureVersion: DISCLOSURE },
      });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toMatch(/verify your phone/i);
    }
    expect(writeOutreachConsent).not.toHaveBeenCalled();
    expect(
      (await call('POST', '/preferences', { preferences: { allowedChannels: [] } })).status
    ).toBe(200);
  });

  it('never refuses keeping or dropping channels already on', async () => {
    fb.phoneNumber = undefined;
    readOutreachConsent.mockResolvedValueOnce({ enabled: true, channels: ['sms', 'voice_call'] });
    const res = await call('POST', '/preferences', { preferences: { allowedChannels: ['sms'] } });
    expect(res.status).toBe(200);
    expect(writeOutreachConsent).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ channels: ['sms'] }),
      expect.anything()
    );
  });

  it('accepts texts for a user with a verified phone, passing the disclosure they saw', async () => {
    const res = await call('POST', '/preferences', {
      preferences: { allowedChannels: ['sms'], disclosureVersion: DISCLOSURE },
    });
    expect(res.status).toBe(200);
    expect(writeOutreachConsent).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ channels: ['sms'] }),
      how
    );
    expect(writePrefs).toHaveBeenCalledWith(
      'u1',
      { channels: { sms: true, email: false } },
      'panel'
    );
  });

  it('refuses turning texts on without the current disclosure version, and saves nothing', async () => {
    for (const disclosureVersion of [undefined, '2025-01-01']) {
      const res = await call('POST', '/preferences', {
        preferences: { allowedChannels: ['sms'], disclosureVersion },
      });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toMatch(/refresh the page/i);
    }
    expect(writeOutreachConsent).not.toHaveBeenCalled();
    // Calls alone, and texts already on, don't need it.
    expect(
      (await call('POST', '/preferences', { preferences: { allowedChannels: ['call'] } })).status
    ).toBe(200);
    readOutreachConsent.mockResolvedValueOnce({ enabled: true, channels: ['sms'] });
    expect(
      (await call('POST', '/preferences', { preferences: { allowedChannels: ['sms'] } })).status
    ).toBe(200);
  });

  it('refuses turning texts on without the current disclosure version, and saves nothing', async () => {
    for (const disclosureVersion of [undefined, '2025-01-01']) {
      const res = await call('POST', '/preferences', {
        preferences: { allowedChannels: ['sms'], disclosureVersion },
      });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toMatch(/refresh the page/i);
    }
    expect(writeOutreachConsent).not.toHaveBeenCalled();
    // Calls alone, and texts already on, don't need it.
    expect(
      (await call('POST', '/preferences', { preferences: { allowedChannels: ['call'] } })).status
    ).toBe(200);
    readOutreachConsent.mockResolvedValueOnce({ enabled: true, channels: ['sms'] });
    expect(
      (await call('POST', '/preferences', { preferences: { allowedChannels: ['sms'] } })).status
    ).toBe(200);
  });

  it('saves switching outreach off for the logged-in user', async () => {
    const res = await call('POST', '/preferences', {
      userId: 'someone-else',
      preferences: {
        enabled: false,
        allowedChannels: ['sms', 'call'],
        disclosureVersion: DISCLOSURE,
      },
    });
    expect(res.status).toBe(200);
    expect(writeOutreachConsent).toHaveBeenCalledWith(
      'u1',
      { enabled: false, channels: ['sms', 'voice_call'] },
      how
    );
  });

  it('leaves channels alone when the request does not mention them', async () => {
    await call('POST', '/preferences', { preferences: { timezone: 'America/Denver' } });
    expect(writeOutreachConsent).toHaveBeenCalledWith(
      'u1',
      { enabled: undefined, channels: undefined },
      { disclosureVersion: undefined, source: 'web-settings' }
    );
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
