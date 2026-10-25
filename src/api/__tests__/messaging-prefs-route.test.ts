/**
 * The settings panels save to messagingPrefs and read it back (M3b). The real
 * routes (/api/user/preferences, /api/outreach/preferences) over an in-memory
 * bogle_users doc with Firestore's merge semantics.
 *
 * Before: quiet hours went to an in-memory timing profile only (lost on the
 * next instance) and the SMS/email switches sent `disabledChannels`, which
 * the server ignored (menu re-audit 2026-10-18).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeUserDocs } from '../../services/messaging/__tests__/fake-user-docs.js';

const h = vi.hoisted(() => ({
  body: {} as unknown,
  db: null as unknown,
  firebasePhone: null as string | null,
  timing: [] as unknown[],
}));

vi.mock('../auth-middleware.js', () => ({
  rateLimit: () => false,
  requireAuth: async () => ({ userId: 'seth', authMethod: 'firebase', isAdmin: false }),
}));
vi.mock('../helpers.js', () => ({
  handleCorsPreflightIfNeeded: () => false,
  parseBody: async () => h.body,
  parseRequestBody: async () => h.body,
  sendJsonResponse: (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  },
}));
vi.mock('../../memory/store-factory.js', () => ({
  getStore: async () => ({ getProfile: async () => null, saveProfile: async () => undefined }),
}));
vi.mock('../../services/outreach/timing-intelligence.js', async (orig) => ({
  ...(await orig<object>()),
  updateTimingPreferences: (_u: string, p: unknown) => h.timing.push(p),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  getFirebaseUser: async () => ({ phoneNumber: h.firebasePhone ?? undefined }),
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => h.db }));

const { handleUserRoutes } = await import('../user-routes.js');
const { handleOutreachRoutes } = await import('../outreach.routes.js');

type Handler = typeof handleUserRoutes;
async function hit(handler: Handler, path: string, method: string, body?: unknown) {
  h.body = body;
  let status: number | undefined;
  let raw = '{}';
  const res = {
    writeHead: (code: number) => (status = code),
    end: (data: string) => (raw = data),
  } as unknown as ServerResponse;
  await handler({ method, headers: {} } as IncomingMessage, res, path, new URL(`http://x${path}`));
  return { status, json: JSON.parse(raw) as Record<string, any> };
}
const prefs = (method: string, body?: unknown) =>
  hit(handleUserRoutes, '/api/user/preferences', method, body);
const outreach = (method: string, preferences?: unknown) =>
  hit(handleOutreachRoutes, '/api/outreach/preferences', method, { preferences });

let store: ReturnType<typeof fakeUserDocs>;
const seth = () => store.docs.get('seth') as Record<string, any>;

beforeEach(() => {
  // Seth opted into texts and email in "How I reach you"; nothing saved for quiet hours.
  store = fakeUserDocs({
    seth: { outreachPreferences: { enabled: true, channels: ['sms', 'email'] } },
  });
  h.db = store.db;
  h.firebasePhone = '+15552017400';
  h.timing = [];
});

describe('"When I\'ll Check In": save, reload, same values', () => {
  it('quiet hours 22:30-07:00 and SMS off survive a reload (a fresh read of the stored doc)', async () => {
    const tz = 'America/New_York';
    const saved = await prefs('POST', {
      timezone: tz,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:00',
    });
    expect(saved.status).toBe(200);
    expect((await outreach('POST', { smsEnabled: false })).status).toBe(200);

    const back = await prefs('GET');
    expect(back.json.preferences).toEqual({
      timezone: tz,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:00',
      channels: { sms: false, email: true, push: true },
    });
    // Switching texts off also withdrew their consent, so it holds today, flag or not.
    expect((await outreach('GET')).json.allowedChannels).toEqual(['email']);
    expect(seth().messagingPrefs).toMatchObject({ quietStart: '22:30', updatedBy: 'panel' });
    // The old in-memory profile still hears about it, for its old readers.
    expect(h.timing).toContainEqual({
      timezone: tz,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:00',
    });
  });

  it('the field the server used to ignore, disabledChannels, is now honoured', async () => {
    await outreach('POST', { disabledChannels: ['email'] });
    expect(seth().messagingPrefs.channels).toMatchObject({ email: false, sms: true });
    expect(seth().outreachPreferences.channels).toEqual(['sms']);
  });

  it('switching texts back on here saves the preference but never adds consent', async () => {
    store.docs.set('seth', { outreachPreferences: { enabled: true, channels: [] } });
    expect((await outreach('POST', { smsEnabled: true })).status).toBe(200);
    expect(seth().messagingPrefs.channels.sms).toBe(true);
    expect(seth().outreachPreferences.channels).toEqual([]);
  });

  it('with nothing saved, the panel reads the defaults: 21:00-08:00', async () => {
    store.docs.delete('seth');
    const { json } = await prefs('GET');
    expect(json.preferences).toMatchObject({ quietHoursStart: '21:00', quietHoursEnd: '08:00' });
  });

  it('refuses an invalid time and saves nothing', async () => {
    const { status, json } = await prefs('POST', {
      quietHoursStart: '7pm',
      quietHoursEnd: '07:00',
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/HH:MM/);
    expect(seth().messagingPrefs).toBeUndefined();
  });

  it('answers 500, not a false "saved", when it cannot store', async () => {
    h.db = null;
    expect((await prefs('POST', { quietHoursStart: '22:00', quietHoursEnd: '07:00' })).status).toBe(
      500
    );
  });
});

describe('"How I reach you": the channel list sets prefs too', () => {
  it('turning texts on (verified number) and email off saves both stores the same way', async () => {
    store.docs.set('seth', { outreachPreferences: { enabled: true, channels: ['email'] } });
    // Texts go on only with the disclosure the screen showed (#2059).
    const on = { allowedChannels: ['sms'], disclosureVersion: '2026-10-18' };
    expect((await outreach('POST', on)).status).toBe(200);
    expect(seth().outreachPreferences.channels).toEqual(['sms']);
    expect(seth().outreachPreferences.smsConsent).toMatchObject({ source: 'web-settings' });
    expect(seth().messagingPrefs.channels).toMatchObject({ sms: true, email: false });
  });

  it('without a verified number, texts are refused and nothing is saved', async () => {
    store.docs.set('seth', { outreachPreferences: { enabled: true, channels: [] } });
    h.firebasePhone = null;
    expect((await outreach('POST', { allowedChannels: ['sms'] })).status).toBe(409);
    expect(seth().messagingPrefs).toBeUndefined();
  });
});
