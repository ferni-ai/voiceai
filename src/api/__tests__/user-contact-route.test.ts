/**
 * POST /api/user/contact: a blank field never erases a stored phone or email
 * (only an explicit clear does), phones are stored as E.164, an invalid phone
 * is refused, nothing here can make a number "verified", and clearing the
 * phone turns text/call consent off in the same request. GET returns the
 * account's verified number to its owner.
 *
 * POST /api/outreach/preferences (the real route, real consent store over an
 * in-memory user doc): texts or calls can only be ADDED for a verified number;
 * opting out is never refused.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  body: {} as unknown,
  profile: null as null | Record<string, unknown>,
  saved: [] as Array<Record<string, unknown>>,
  firebasePhone: null as string | null,
  firestoreWrites: [] as unknown[],
  userDoc: undefined as Record<string, unknown> | undefined,
}));

// Texts going on send a confirmation (opt-in-text.ts); not from this route test.
vi.mock('../../services/outreach/opt-in-text.js', () => ({ confirmSmsOptIn: async () => 'sent' }));
vi.mock('../auth-middleware.js', () => ({
  rateLimit: () => false,
  requireAuth: async () => ({ userId: 'user-1', authMethod: 'firebase', isAdmin: false }),
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
  getStore: async () => ({
    getProfile: async () => h.profile,
    getOrCreateProfile: async (id: string) => ({ id }),
    saveProfile: async (p: Record<string, unknown>) => {
      h.saved.push(structuredClone(p));
    },
  }),
}));
vi.mock('../../services/outreach/timing-intelligence.js', async (orig) => ({
  ...(await orig<object>()),
  getTimingProfile: () => ({ preferences: {} }),
  updateTimingPreferences: vi.fn(),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  getFirebaseUser: async () => ({ phoneNumber: h.firebasePhone ?? undefined }),
}));
// bogle_users/{uid}: where linked identifiers live and consent is stored (merge writes).
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: !!h.userDoc, data: () => h.userDoc }),
        set: async (data: Record<string, unknown>) => {
          h.firestoreWrites.push(data);
          const prefs = {
            ...(h.userDoc?.outreachPreferences as object),
            ...(data.outreachPreferences as object),
          };
          h.userDoc = { ...h.userDoc, ...data, outreachPreferences: prefs };
        },
      }),
    }),
  }),
}));

const { handleUserRoutes } = await import('../user-routes.js');
const { handleOutreachRoutes } = await import('../outreach.routes.js');
const { verifiedPhoneFor } = await import('../user-contact.js');
const { toE164 } = await import('../../services/outreach/checkin-replies.js');
const { consentFromPrefs } = await import('../../services/outreach/outreach-consent.js');

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  url: URL
) => Promise<boolean>;

async function hit(
  handler: Handler,
  path: string,
  method: string,
  body?: unknown
): Promise<{ status?: number; json: Record<string, unknown> }> {
  h.body = body;
  let status: number | undefined;
  let raw = '{}';
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: (data: string) => {
      raw = data;
    },
  } as unknown as ServerResponse;
  const req = { method, headers: {} } as IncomingMessage;
  await handler(req, res, path, new URL(`http://x${path}`));
  return { status, json: JSON.parse(raw) as Record<string, unknown> };
}

const call = (method: string, body?: unknown) =>
  hit(handleUserRoutes, '/api/user/contact', method, body);
const setChannels = (allowedChannels: string[]) =>
  hit(handleOutreachRoutes, '/api/outreach/preferences', 'POST', {
    preferences: { allowedChannels, disclosureVersion: '2026-10-18' },
  });
const storedChannels = () => consentFromPrefs(h.userDoc?.outreachPreferences).channels;

const STORED = { phone: '+15552017400', email: 'me@example.com', timezone: 'America/New_York' };

beforeEach(() => {
  h.profile = { id: 'user-1', contactInfo: { ...STORED } };
  h.saved = [];
  h.firebasePhone = null;
  h.userDoc = undefined;
  h.firestoreWrites = [];
});

describe('POST /api/user/contact', () => {
  it('an empty phone or email leaves the stored ones alone', async () => {
    const { status } = await call('POST', { phone: '', email: '  ', preferredName: 'Sam' });
    expect(status).toBe(200);
    expect(h.saved[0]?.contactInfo).toMatchObject({ phone: STORED.phone, email: STORED.email });
  });

  it('only clearPhone / clearEmail blank them', async () => {
    await call('POST', { phone: '', clearPhone: true, email: '', clearEmail: true });
    expect(h.saved[0]?.contactInfo).toMatchObject({ phone: '', email: '' });
  });

  it('stores a formatted US number as E.164', async () => {
    const { status } = await call('POST', { phone: '(555) 201-7497' });
    expect(status).toBe(200);
    expect((h.saved[0]?.contactInfo as { phone?: string }).phone).toBe('+15552017497');
  });

  it('a saved number is not a verified one: texts stay refused until a code checks out', async () => {
    await call('POST', { phone: '5552017497', phoneVerified: true, userId: 'someone-else' });
    const saved = h.saved[0] ?? {};
    expect(saved.id).toBe('user-1'); // the signed-in user, never the body's userId
    expect(saved.contactInfo).not.toHaveProperty('phoneVerified');
    expect(
      await verifiedPhoneFor({ userId: 'user-1', authMethod: 'firebase' } as never)
    ).toBeNull();
    expect((await setChannels(['sms'])).status).toBe(409);
  });

  it('refuses a number that is not one, and saves nothing', async () => {
    const { status, json } = await call('POST', { phone: '12' });
    expect(status).toBe(400);
    expect(json.success).toBe(false);
    expect(h.saved).toHaveLength(0);
  });

  it('clearing a verified phone turns off texts and calls in the same request, keeping email', async () => {
    h.firebasePhone = '+15552017497';
    h.userDoc = { outreachPreferences: { channels: ['sms', 'voice_call', 'email'] } };
    const { status, json } = await call('POST', { phone: '', clearPhone: true });
    expect(status).toBe(200);
    expect(json.phoneChannelsOff).toBe(true);
    expect(storedChannels()).toEqual(['email']);
    expect((h.saved[0]?.contactInfo as { phone?: string }).phone).toBe('');
  });

  it('an ordinary save leaves consent alone', async () => {
    h.userDoc = { outreachPreferences: { channels: ['sms'] } };
    const { json } = await call('POST', { phone: '5552017497' });
    expect(json.phoneChannelsOff).toBe(false);
    expect(h.firestoreWrites).toHaveLength(0);
    expect(storedChannels()).toEqual(['sms']);
  });
});

describe('POST /api/outreach/preferences (real route)', () => {
  it('refuses to turn on texts or calls without a verified phone, and stores nothing', async () => {
    for (const channel of ['sms', 'call']) {
      const { status, json } = await setChannels([channel]);
      expect(status).toBe(409);
      expect(String(json.error)).toMatch(/verify your phone/i);
    }
    expect(h.firestoreWrites).toHaveLength(0);
    expect(storedChannels()).toEqual([]);
  });

  it('turns texts on for a verified phone, as consent the scheduler reads', async () => {
    h.userDoc = { linkedIdentifiers: ['phone:+15552017497'] };
    const { status } = await setChannels(['sms']);
    expect(status).toBe(200);
    expect(consentFromPrefs(h.userDoc?.outreachPreferences)).toEqual({
      enabled: true,
      channels: ['sms'],
    });
    expect(h.userDoc?.outreachPreferences).toMatchObject({
      smsConsent: { disclosureVersion: '2026-10-18', source: 'web-settings', channel: 'sms' },
    });
  });

  it('never refuses opting out, even without a verified phone', async () => {
    h.userDoc = { outreachPreferences: { channels: ['sms', 'voice_call'] } };
    expect((await setChannels(['sms'])).status).toBe(200); // drop calls, keep texts
    expect(storedChannels()).toEqual(['sms']);
    expect((await setChannels([])).status).toBe(200);
    expect(storedChannels()).toEqual([]);
  });
});

describe('GET /api/user/contact', () => {
  it("returns the account's verified number, and null when there is none", async () => {
    h.firebasePhone = '+15552017497';
    expect((await call('GET')).json.contactInfo).toMatchObject({
      verifiedPhone: '+15552017497',
    });
    h.firebasePhone = null;
    expect((await call('GET')).json.contactInfo).toMatchObject({ verifiedPhone: null });
  });
});

describe('verifiedPhoneFor', () => {
  const auth = { userId: 'user-1', authMethod: 'firebase' } as never;

  it('is the Firebase account number, or a phone: linked identifier', async () => {
    h.firebasePhone = '+15552017497';
    expect(await verifiedPhoneFor(auth)).toBe('+15552017497');
    h.firebasePhone = null;
    h.userDoc = { linkedIdentifiers: ['email:a@example.com', 'phone:+15552017400'] };
    expect(await verifiedPhoneFor(auth)).toBe('+15552017400');
  });

  it('ignores contactInfo.phone, which anyone can write', async () => {
    h.userDoc = { contactInfo: { phone: '+15552017497' } };
    expect(await verifiedPhoneFor(auth)).toBeNull();
  });
});

// Same table as apps/web/tests/ui/contact-settings.test.ts: the client's copy must agree.
describe('toE164 (server normalizer the client mirrors)', () => {
  it.each([
    ['5552017497', '+15552017497'],
    ['(555) 201-7497', '+15552017497'],
    ['1-555-201-7497', '+15552017497'],
    ['+44 20 7946 0958', '+442079460958'],
    ['12', null],
    ['555-201-749', null],
    ['call me', null],
    ['', null],
  ])('%s → %s', (raw, want) => {
    expect(toE164(raw)).toBe(want);
  });
});
