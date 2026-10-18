/**
 * WAITLIST_GATE on the voice token route, through the real admission rules and
 * the real Firestore-backed store over an in-memory database. Gate off must
 * change nothing (and read nothing); gate on refuses anyone not admitted.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../token/livekit.js', () => ({
  createToken: vi.fn(async () => 'jwt-token'),
  createRoomWithAgent: vi.fn(async () => ({ roomReady: true, agentDispatched: true })),
  getLiveKitUrl: () => 'wss://example.livekit.cloud',
  getRoomService: () => ({ listRooms: async () => [] }),
}));
vi.mock('../token-room-claim.js', () => ({ claimRoom: async () => 'mine' }));
vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
const { verifyFirebaseToken, getFirebaseUserOrThrow } = vi.hoisted(() => ({
  verifyFirebaseToken: vi.fn(),
  getFirebaseUserOrThrow: vi.fn(),
}));
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken,
  getFirebaseUserOrThrow,
  isVerifiedToken: () => true,
}));
vi.mock('../../../../services/identity/geo-detection.js', () => ({
  detectGeoFromRequest: vi.fn(async () => ({ primaryLanguage: 'en-US', languages: ['en-US'], accent: 'american', source: 'test' })), // prettier-ignore
}));
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => null }),
  isAgentProfilePersistenceOn: () => false,
}));
vi.mock('../../../../services/llm-dynamic-content.js', () => ({ prewarmContent: vi.fn(async () => undefined) })); // prettier-ignore
vi.mock('../user-data-prefetch.js', () => ({ prefetchUserData: vi.fn() }));
vi.mock('../../../../marketplace/registry.js', () => ({ getAgentAsync: vi.fn(async () => null) }));
vi.mock('../../services/demo-sessions.js', () => ({ shutdown: vi.fn() }));
vi.mock('../../../token/demo-rate-limit.js', () => ({
  DEMO_CONFIG: { sessionDurationMinutes: 5 },
  checkDemoAllowed: vi.fn(),
  recordDemoSession: vi.fn(),
  startRateLimitCleanup: vi.fn(),
  stopRateLimitCleanup: vi.fn(),
}));

// In-memory Firestore: collection -> doc id -> data. `reads` counts every get().
const { docs, db } = vi.hoisted(() => {
  const docs = new Map<string, Map<string, Record<string, unknown>>>();
  const state = { reads: 0, broken: false };
  const coll = (n: string) => docs.get(n) ?? docs.set(n, new Map()).get(n)!;
  const read = () => {
    state.reads++;
    if (state.broken) throw new Error('firestore down');
  };
  const db = {
    state,
    collection: (n: string) => ({
      doc: (id: string) => ({
        get: async () => (read(), { exists: coll(n).has(id), data: () => coll(n).get(id) }),
      }),
      where: (field: string, op: string, value: unknown) => {
        const match = (d: Record<string, unknown>) => op === 'array-contains' ? Array.isArray(d[field]) && d[field].includes(value) : d[field] === value; // prettier-ignore
        const get = async () => (read(), { docs: [...coll(n)].filter(([, d]) => match(d)).map(([id, d]) => ({ id, data: () => d })) }); // prettier-ignore
        return { get, limit: () => ({ get }) };
      },
    }),
  };
  return { docs, db };
});
vi.mock('../../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

const { handleTokenRoutes } = await import('../token.js');
const { forgetAdmissionCache } = await import('../../../../api/admission.js');

const EMAIL = 'pat@example.test';
const docId = (e: string) => Buffer.from(e).toString('base64').replace(/[/+=]/g, '_');
const put = (c: string, id: string, data: Record<string, unknown>) =>
  (docs.get(c) ?? docs.set(c, new Map()).get(c)!).set(id, data);

async function requestToken(): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL('http://localhost/token?room=voice-1&username=Pat');
  const req = { method: 'GET', headers: { authorization: 'Bearer t' }, socket: { remoteAddress: '127.0.0.1' } }; // prettier-ignore
  let status = 0;
  let body = '{}';
  const res = { writeHead: (c: number) => void (status = c), end: (b?: string) => void (body = b ?? '{}') }; // prettier-ignore
  await handleTokenRoutes(req as unknown as IncomingMessage, res as unknown as ServerResponse, '/token', url); // prettier-ignore
  return { status, body: JSON.parse(body) as Record<string, unknown> };
}

function signIn(over: Record<string, unknown> = {}): void {
  verifyFirebaseToken.mockResolvedValue({ uid: 'uid-pat', email: EMAIL, emailVerified: true, claims: {}, ...over }); // prettier-ignore
}

beforeEach(() => {
  docs.clear();
  db.state.reads = 0;
  db.state.broken = false;
  forgetAdmissionCache();
  getFirebaseUserOrThrow.mockResolvedValue({ metadata: { creationTime: '2026-10-20T00:00:00Z' } });
  signIn();
});
afterEach(() => vi.unstubAllEnvs());

describe('gate off (prod today)', () => {
  it('lets a stranger in and reads nothing for admission', async () => {
    expect((await requestToken()).status).toBe(200);
    expect(db.state.reads).toBe(0);
    expect(getFirebaseUserOrThrow).not.toHaveBeenCalled();
  });
});

describe('gate on', () => {
  beforeEach(() => vi.stubEnv('WAITLIST_GATE', 'on'));

  it('refuses someone not admitted with a friendly "on the list" payload', async () => {
    put('waitlist', docId(EMAIL), { email: EMAIL, status: 'pending' });
    const { status, body } = await requestToken();
    expect(status).toBe(403);
    expect(body).toMatchObject({ error: 'not_admitted', status: 'pending', waitlisted: true });
    expect(body.message).toMatch(/on the list/);
  });

  it('admits an approved waitlist entry', async () => {
    put('waitlist', docId(EMAIL), { email: EMAIL, status: 'approved' });
    expect((await requestToken()).status).toBe(200);
  });

  it('does not trust an unverified email for an approved entry', async () => {
    put('waitlist', docId(EMAIL), { email: EMAIL, status: 'approved' });
    signIn({ emailVerified: false });
    expect((await requestToken()).status).toBe(403);
  });

  it('admits an existing account with an active subscription', async () => {
    put('user_profiles', docId(EMAIL), { subscription: { status: 'active', tier: 'free' } });
    expect((await requestToken()).status).toBe(200);
  });

  it('admits an account created before WAITLIST_GATE_SINCE, not one created after', async () => {
    vi.stubEnv('WAITLIST_GATE_SINCE', '2026-10-25');
    expect((await requestToken()).status).toBe(200);
    forgetAdmissionCache();
    vi.stubEnv('WAITLIST_GATE_SINCE', '2026-10-15');
    expect((await requestToken()).status).toBe(403);
  });

  it('admits a friends-and-family member (wave 0) with no email at all', async () => {
    put('feature_cohorts', 'friends-and-family', { members: ['uid-pat'] });
    signIn({ email: undefined, emailVerified: false });
    expect((await requestToken()).status).toBe(200);
  });

  it('a disabled friends-and-family cohort admits no one (disable is the fast kill)', async () => {
    put('feature_cohorts', 'friends-and-family', { members: ['uid-pat'], enabled: false });
    expect((await requestToken()).status).toBe(403);
  });

  it('lets an admin claim through', async () => {
    signIn({ claims: { admin: true } });
    expect((await requestToken()).status).toBe(200);
  });

  it('fails closed when the lookup breaks, and does not cache that', async () => {
    db.state.broken = true;
    const { status, body } = await requestToken();
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: 'admission_unavailable', retryable: true });
    db.state.broken = false;
    put('waitlist', docId(EMAIL), { email: EMAIL, status: 'approved' });
    expect((await requestToken()).status).toBe(200);
  });
});
