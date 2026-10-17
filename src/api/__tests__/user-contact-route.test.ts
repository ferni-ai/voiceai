/**
 * POST /api/user/contact: a blank field never erases a stored phone or email
 * (only an explicit clear does), phones are stored as E.164, and an invalid
 * phone is refused. GET returns the account's verified number to its owner.
 * Also pins what the contact screen's check-in control saves: the body it
 * posts to /api/outreach/preferences becomes consent the scheduler reads.
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
  attachVerifiedPhone: vi.fn(),
}));

vi.mock('../auth-middleware.js', () => ({
  rateLimit: () => false,
  requireAuth: async () => ({ userId: 'user-1', authMethod: 'firebase', isAdmin: false }),
}));
vi.mock('../helpers.js', () => ({
  handleCorsPreflightIfNeeded: () => false,
  parseBody: async () => h.body,
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
vi.mock('../../services/outreach/timing-intelligence.js', () => ({
  getTimingProfile: () => ({ preferences: {} }),
  updateTimingPreferences: vi.fn(),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  getFirebaseUser: async () =>
    h.firebasePhone ? { phoneNumber: h.firebasePhone } : { phoneNumber: undefined },
  attachVerifiedPhone: h.attachVerifiedPhone,
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        set: async (data: unknown) => {
          h.firestoreWrites.push(data);
        },
        get: async () => ({ exists: !!h.userDoc, data: () => h.userDoc }),
      }),
    }),
  }),
}));

const { handleUserRoutes } = await import('../user-routes.js');
const { verifiedPhoneFor } = await import('../user-contact.js');
const { toE164 } = await import('../../services/outreach/checkin-replies.js');
const { consentFromPrefs, consentPatchFrom, writeOutreachConsent } =
  await import('../../services/outreach/outreach-consent.js');

async function call(
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
  await handleUserRoutes(req, res, '/api/user/contact', new URL('http://x/api/user/contact'));
  return { status, json: JSON.parse(raw) as Record<string, unknown> };
}

const STORED = { phone: '+15552017400', email: 'me@example.com', timezone: 'America/New_York' };

describe('POST /api/user/contact', () => {
  beforeEach(() => {
    h.profile = { id: 'user-1', contactInfo: { ...STORED } };
    h.saved = [];
    h.firebasePhone = null;
  });

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

  it('never marks a number verified or attaches it to the account: only a texted code does', async () => {
    h.userDoc = undefined;
    h.firestoreWrites = [];
    await call('POST', { phone: '5552017497', phoneVerified: true, userId: 'someone-else' });
    const saved = h.saved[0] ?? {};
    expect(saved.id).toBe('user-1'); // the signed-in user, never the body's userId
    expect(saved.contactInfo).not.toHaveProperty('phoneVerified');
    expect(saved).not.toHaveProperty('linkedIdentifiers');
    expect(h.attachVerifiedPhone).not.toHaveBeenCalled();
    expect(h.firestoreWrites).toHaveLength(0);
    // ...so the number it stored does not count as verified.
    expect(
      await verifiedPhoneFor({ userId: 'user-1', authMethod: 'firebase' } as never)
    ).toBeNull();
  });

  it('refuses a number that is not one, and saves nothing', async () => {
    const { status, json } = await call('POST', { phone: '12' });
    expect(status).toBe(400);
    expect(json.success).toBe(false);
    expect(h.saved).toHaveLength(0);
  });
});

describe('GET /api/user/contact', () => {
  beforeEach(() => {
    h.profile = { id: 'user-1', contactInfo: { ...STORED } };
  });

  it("returns the account's verified number, and null when there is none", async () => {
    h.firebasePhone = '+15552017497';
    expect((await call('GET')).json.contactInfo).toMatchObject({
      verifiedPhone: '+15552017497',
      phone: '***',
    });
    h.firebasePhone = null;
    expect((await call('GET')).json.contactInfo).toMatchObject({ verifiedPhone: null });
  });
});

describe('verifiedPhoneFor', () => {
  const auth = { userId: 'user-1', authMethod: 'firebase' } as never;
  beforeEach(() => {
    h.firebasePhone = null;
    h.userDoc = undefined;
  });

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

describe('check-in channels from the contact screen', () => {
  it('turning on Texts saves consent the scheduler reads as sms enabled', async () => {
    h.firestoreWrites = [];
    // Exactly what contact-settings.ui.ts posts to /api/outreach/preferences.
    const body = { preferences: { allowedChannels: ['sms'] } };
    await writeOutreachConsent('user-1', consentPatchFrom(body.preferences));
    const stored = (h.firestoreWrites[0] as { outreachPreferences: unknown }).outreachPreferences;
    expect(consentFromPrefs(stored)).toEqual({ enabled: true, channels: ['sms'] });
    expect(consentFromPrefs(undefined).channels).toEqual([]);
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
