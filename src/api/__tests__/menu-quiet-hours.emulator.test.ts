/**
 * "When I'll Check In" and "How I reach you", panel → senders: the quiet hours the panel
 * saves through POST /api/user/preferences (its exact payload) are what the call-hours
 * guard and the call schedulers read, in the person's zone (QUIET_HOURS_FROM_PREFS).
 * Before, they were saved to messagingPrefs and every sender read outreachPreferences,
 * so a person who set quiet hours still got called in them.
 * 2026-10-20 is CDT (UTC-5); the window crosses midnight and sits inside call hours.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the route and
// the senders read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);
vi.mock('../../memory/storage/store-factory.js', async () => {
  const { getFirestoreStore } = await import('../../memory/storage/firestore-store.js');
  return { getStore: async () => getFirestoreStore() };
});
// x-test-uid signs a request in as that user; anything else goes through the real requireAuth.
vi.mock('../auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth-middleware.js')>();
  return {
    ...actual,
    requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      const uid = req.headers['x-test-uid'];
      if (typeof uid !== 'string') return actual.requireAuth(req, res);
      return { userId: uid, isAdmin: false, isDevMode: false, authMethod: 'firebase' as const };
    }),
  };
});

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-quiet-hours';

let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleUserRoutes } = await import('../user-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleUserRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());
afterEach(() => vi.unstubAllEnvs());

/** What notification-settings.ui.ts saveServerQuietHours and contact-settings.ui.ts post. */
async function panelSave(uid: string, start: string, end: string): Promise<number> {
  const res = await fetch(`${base}/api/user/preferences`, {
    method: 'POST',
    headers: { 'x-test-uid': uid, 'content-type': 'application/json' },
    body: JSON.stringify({ timezone: CHI, quietHoursStart: start, quietHoursEnd: end }),
  });
  return res.status;
}

const CHI = 'America/Chicago';
const CHICAGO_PHONE = '+13125550100';
const at = (iso: string) => new Date(iso);
const IN_WINDOW = at('2026-10-21T01:15:00Z'); // Tue 20:15 Chicago: inside 20:00 to 09:30
const WINDOW_END = at('2026-10-21T14:30:00Z'); // Wed 09:30 Chicago
const OUTSIDE = at('2026-10-20T20:00:00Z'); // Tue 15:00 Chicago

async function guard(uid: string, now: Date) {
  const { checkCallHours } = await import('../../services/outreach/call-hours-guard.js');
  return checkCallHours({ now, recipientUserId: uid, recipientPhone: CHICAGO_PHONE });
}
async function scheduler(uid: string, now: Date) {
  const { callQuietHours } = await import('../../services/outreach/quiet-hours.js');
  return callQuietHours(uid, now);
}

describe.skipIf(!emulator)('menu quiet hours reach the senders (Firestore emulator)', () => {
  it('a call inside the saved window is refused until it ends; outside, it goes', async () => {
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
    const uid = newUser();
    expect(await panelSave(uid, '20:00', '09:30')).toBe(200);

    const inside = await guard(uid, IN_WINDOW);
    expect(inside).toMatchObject({ allowed: false, timezone: CHI });
    expect(inside.at).toEqual(WINDOW_END);
    expect(inside.at.getTime()).toBeGreaterThan(IN_WINDOW.getTime());
    expect(await guard(uid, OUTSIDE)).toMatchObject({ allowed: true, at: OUTSIDE });

    // The call schedulers (proactive-call-scheduler, conversational-calls) wait the same way.
    expect(await scheduler(uid, IN_WINDOW)).toEqual({ quiet: true, until: WINDOW_END });
    expect(await scheduler(uid, OUTSIDE)).toEqual({ quiet: false, until: OUTSIDE });
  });

  it('flag off: the saved window changes nothing, the same as a person who saved none', async () => {
    const uid = newUser();
    const none = newUser();
    expect(await panelSave(uid, '20:00', '09:30')).toBe(200);
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'off');

    expect(await guard(uid, IN_WINDOW)).toEqual(await guard(none, IN_WINDOW));
    expect(await guard(uid, IN_WINDOW)).toMatchObject({ allowed: true, at: IN_WINDOW });
    expect(await scheduler(uid, IN_WINDOW)).toEqual({ quiet: false, until: IN_WINDOW });
  });

  it('by voice: setQuietHours saves what the panel shows and the senders read', async () => {
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
    const uid = newUser();
    expect(await panelSave(uid, '12:00', '14:00')).toBe(200); // the zone, set once in the panel
    const { installQuietHoursWriter } =
      await import('../../services/messaging/voice-quiet-hours.js');
    installQuietHoursWriter(); // what live-call-behaviors.ts does for every call
    const { getToolDefinitions } = await import('../../tools/domains/ambient-mode/index.js');
    const def = (await getToolDefinitions()).find((d) => d.id === 'setQuietHours');
    const ctx = { userId: uid, sessionId: 's-quiet', agentId: 'ferni', agentDisplayName: 'Ferni' };
    if (!def) throw new Error('setQuietHours is not in ambient-mode');
    const tool = def.create(ctx) as unknown as {
      execute: (args: object, opts: object) => Promise<string>;
    };
    const said = await tool.execute({ startTime: '20:00', endTime: '09:30' }, {});
    expect(said).toMatch(/^Got it!/);
    const res = await fetch(`${base}/api/user/preferences`, { headers: { 'x-test-uid': uid } });
    expect(await res.json()).toMatchObject({
      preferences: { quietHoursStart: '20:00', quietHoursEnd: '09:30', timezone: CHI },
    });
    expect(await guard(uid, IN_WINDOW)).toMatchObject({ allowed: false, at: WINDOW_END });
  });

  it('a new save replaces the old window', async () => {
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
    const uid = newUser();
    await panelSave(uid, '20:00', '09:30');
    expect(await panelSave(uid, '12:00', '14:00')).toBe(200);
    expect((await guard(uid, IN_WINDOW)).allowed).toBe(true);
    const lunch = await guard(uid, at('2026-10-20T17:30:00Z')); // 12:30 Chicago
    expect(lunch).toMatchObject({ allowed: false, at: at('2026-10-20T19:00:00Z') });
  });
});
