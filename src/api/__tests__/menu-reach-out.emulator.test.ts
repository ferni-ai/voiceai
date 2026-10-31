/**
 * How I reach you, "Ferni can reach out", and When I'll Check In, "Check-ins by email":
 * what each switch saves is what the panel reads back when it opens.
 *
 * Write→read on the Firestore emulator through the real outreach handler and auth
 * middleware (only Firebase token verification is mocked): POST /api/outreach/pause
 * and /resume, then GET /api/outreach/preferences, whose `outreachEnabled` the reach
 * switch shows (contact-settings-phone.ts); the email switch's off (`emailEnabled:
 * false`) and back on (`allowedChannels` plus email), read back as `allowedChannels`
 * (email-checkins-switch.ts).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the routes read
// and write through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-reach-out';

const id = () => `u-${Math.random().toString(36).slice(2)}`;
const userA = id();
const userB = id();
const tokens: Record<string, string> = { 'tok-A': userA, 'tok-B': userB };
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const uid = tokens[token];
    return uid ? { uid, claims: { admin: false }, isAnonymous: false } : null;
  }),
}));

let server: Server;
let base = '';
beforeAll(async () => {
  if (!emulator) return;
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  // Both start with texts and email on, as consent saved before (outreach-consent.ts)
  for (const uid of [userA, userB]) {
    await getFirestoreDb()!
      .collection('bogle_users')
      .doc(uid)
      .set({ outreachPreferences: { enabled: true, channels: ['sms', 'email'] } });
  }
  const { handleOutreachRoutes } = await import('../outreach.routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/outreach${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const prefs = async (token: string) => (await call(token, 'GET', '/preferences')).body;

describe.skipIf(!emulator)('the reach and email switches round-trip through the server', () => {
  it('pause shows as off when the panel opens, resume as on', async () => {
    expect((await prefs('tok-A')).outreachEnabled).toBe(true);

    expect((await call('tok-A', 'POST', '/pause', {})).status).toBe(200);
    expect((await prefs('tok-A')).outreachEnabled).toBe(false);
    expect((await prefs('tok-A')).allowedChannels).toEqual(['sms', 'email']); // channels untouched

    expect((await call('tok-A', 'POST', '/resume', {})).status).toBe(200);
    expect((await prefs('tok-A')).outreachEnabled).toBe(true);
  });

  it("one person's pause never touches another's", async () => {
    await call('tok-A', 'POST', '/pause', {});
    expect((await prefs('tok-B')).outreachEnabled).toBe(true);
    await call('tok-A', 'POST', '/resume', {});
  });

  it('email off drops only email; back on with the fresh list brings it back', async () => {
    const off = await call('tok-B', 'POST', '/preferences', {
      preferences: { emailEnabled: false },
    });
    expect(off.status).toBe(200);
    expect((await prefs('tok-B')).allowedChannels).toEqual(['sms']);

    const fresh = (await prefs('tok-B')).allowedChannels as string[];
    const on = await call('tok-B', 'POST', '/preferences', {
      preferences: { allowedChannels: [...fresh, 'email'] },
    });
    expect(on.status).toBe(200);
    expect((await prefs('tok-B')).allowedChannels).toEqual(['sms', 'email']);
  });
});
