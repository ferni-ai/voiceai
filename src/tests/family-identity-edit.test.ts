/**
 * PUT /api/sponsored-identities/:id: can a sponsor edit a family member from the web?
 *
 * The web's apiPut used to add the caller's `userId` to every JSON body. The
 * sponsored-identity edit accepts only its editable fields (a stray key is a
 * 400 invalid_update, so a sponsor can't forge sponsorUserId or
 * phoneVerifiedAt), so every name, phone or access edit from Family settings
 * failed. The server already knows the caller from the verified token, so the
 * web no longer sends one.
 *
 * Each request is built by the REAL web transport (apiPut from utils/api.ts)
 * with the web's Firebase session mocked, its headers are turned into a caller
 * by the REAL auth middleware, and it is handed to the REAL sponsored-identity
 * route and edit parser. Only Firebase token verification is mocked, and
 * Firestore is off so the identity service's cache is the store.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/identity/firebase-auth.js', () => ({
  claimsFirebaseIssuer: vi.fn(() => false),
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-42' ? { uid: 'uid-42', claims: {}, isAnonymous: false } : null
  ),
}));
vi.mock('../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => {
    throw new Error('no Firestore in this test');
  },
}));

// The web's Firebase session: signed in as uid-42 with ID token tok-42.
vi.mock('../../apps/web/src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => undefined),
  getAuthToken: vi.fn(async () => 'tok-42'),
  getFirebaseUid: vi.fn(() => 'uid-42'),
}));
vi.mock('../../apps/web/src/ui/whisper.ui.js', () => ({ toast: { error: vi.fn() } }));

const { handleSponsoredIdentityRoutes } = await import('../api/sponsored-identity-routes.js');
const { parseScheduleChoice } = await import('../api/family-checkin-schedule-routes.js');
const { clearCaches, createSponsoredIdentity, getSponsoredIdentity } =
  await import('../services/identity/sponsored-identity.js');
const { apiPut } = await import('../../apps/web/src/utils/api.js');
const { appState } = await import('../../apps/web/src/state/app.state.js');

interface Captured {
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
let captured: Captured[] = [];

beforeEach(() => {
  clearCaches();
  captured = [];
  // A signed-in web session: getUserId() answers the Firebase uid.
  appState.update({ firebaseUid: 'uid-42' });
  // A production web build: no dev-mode admin header.
  vi.stubEnv('DEV', false);
  vi.stubGlobal('navigator', { onLine: true });
  // apiPut resolves its path against the page origin, so it needs a real one.
  vi.stubGlobal('window', {
    location: { href: 'https://app.ferni.ai/', origin: 'https://app.ferni.ai' },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { headers?: Record<string, string>; body?: unknown }) => {
      captured.push({
        path: new URL(url).pathname,
        headers: Object.fromEntries(new globalThis.Headers(init.headers).entries()),
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });
      return new globalThis.Response('{}', { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Hand a captured web request to the real sponsored-identity router, as the API server does. */
async function serve(
  request: Captured
): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = Readable.from([JSON.stringify(request.body)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'PUT',
    url: request.path,
    headers: request.headers,
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  let payload = '';
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn((chunk?: string) => {
      payload = chunk ?? '';
    }),
  } as unknown as ServerResponse;
  const handled = await handleSponsoredIdentityRoutes(req, res, request.path);
  expect(handled).toBe(true);
  return { status, body: payload ? (JSON.parse(payload) as Record<string, unknown>) : {} };
}

describe('editing a family member from the web', () => {
  it('saves the edit form (name, relationship, preferred name, notes) as the signed-in sponsor', async () => {
    const mom = await createSponsoredIdentity('uid-42', {
      displayName: 'Mom',
      phoneNumber: '+16175550123',
      relationship: 'mother',
    });

    // The body family-identities.ui.ts's edit form sends through updateIdentity.
    await apiPut(`/api/sponsored-identities/${mom.id}`, {
      displayName: 'Mama',
      relationship: 'mother',
      preferredName: 'Ma',
      notes: 'Prefers mornings',
    });
    const [request] = captured;
    expect(request.headers.authorization).toBe('Bearer tok-42');

    const out = await serve(request);

    expect(out).toMatchObject({ status: 200 });
    // The server acts on the verified caller; the body names no one.
    expect(request.body).not.toHaveProperty('userId');
    expect(out.body.identity).toMatchObject({ displayName: 'Mama', preferredName: 'Ma' });
    const stored = await getSponsoredIdentity(mom.id);
    expect(stored).toMatchObject({
      displayName: 'Mama',
      preferredName: 'Ma',
      notes: 'Prefers mornings',
      sponsorUserId: 'uid-42',
    });
  });

  it('still refuses a body that names a user, so the edit stays editable-fields only', async () => {
    const mom = await createSponsoredIdentity('uid-42', {
      displayName: 'Mom',
      phoneNumber: '+16175550124',
      relationship: 'mother',
    });

    await apiPut(`/api/sponsored-identities/${mom.id}`, { userId: 'uid-42', displayName: 'Mama' });
    const out = await serve(captured[0]);

    expect(out.status).toBe(400);
    expect(out.body.error).toBe('invalid_update');
    expect((await getSponsoredIdentity(mom.id))?.displayName).toBe('Mom');
  });

  it('the check-in schedule body the web sends still parses', async () => {
    // family-checkin-schedule.ui.ts saves its schedule through the same apiPut.
    await apiPut('/api/sponsored-identities/sponsored_1/checkin-schedule', {
      frequency: 'weekly',
      dayOfWeek: 'monday',
      preferredTime: '09:30',
      timezone: 'America/New_York',
    });

    expect(parseScheduleChoice(captured[0].body)).toEqual({
      frequency: 'weekly',
      dayOfWeek: 'monday',
      preferredTime: '09:30',
      timezone: 'America/New_York',
    });
  });
});
