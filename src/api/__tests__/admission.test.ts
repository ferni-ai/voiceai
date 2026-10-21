/**
 * The admission rules (admission.ts) on their own: the cache, the gate date,
 * and text chat refusing the same people the voice token route refuses.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { PassThrough } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const members = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (name: string) => ({
      doc: () => ({ get: async () => ({ exists: name === 'feature_cohorts', data: () => (name === 'feature_cohorts' ? { members: members.list } : undefined) }) }), // prettier-ignore
      where: (field: string, _op: string, uid: string) => ({
        get: async () => ({ docs: name === 'feature_cohorts' && field === 'members' && members.list.includes(uid) ? [{ id: 'friends-and-family', data: () => ({ members: members.list }) }] : [] }), // prettier-ignore
        limit: () => ({ get: async () => ({ docs: [] }) }),
      }),
    }),
  }),
}));
vi.mock('../auth-middleware.js', () => ({
  rateLimit: () => false,
  requireAuth: async (req: IncomingMessage) => {
    const [method, uid] = (req.headers.authorization ?? '').split(' ');
    return { userId: uid, isAdmin: false, authMethod: method === 'Key' ? 'api_key' : 'firebase', email: 'x@example.test', emailVerified: true }; // prettier-ignore
  },
}));

const { forgetAdmissionCache, gateSince, isAdmitted } = await import('../admission.js');
const { handleChatRoutes } = await import('../chat-routes.js');
import type { AdmissionStore } from '../admission.js';

const ON = { WAITLIST_GATE: 'on' } as NodeJS.ProcessEnv;

function store(over: Partial<AdmissionStore> = {}): AdmissionStore & { calls: number } {
  const s: AdmissionStore & { calls: number } = {
    calls: 0,
    waitlistStatus: async (): Promise<string | undefined> => (s.calls++, undefined),
    hasActiveSubscription: async () => false,
    accountCreatedAt: async () => null,
    inCohort: async () => false,
    ...over,
  };
  return s;
}

beforeEach(() => {
  forgetAdmissionCache();
  members.list = [];
});

describe('isAdmitted', () => {
  it('gate off: admitted without reading anything', async () => {
    const s = store();
    expect(await isAdmitted({ uid: 'u', email: 'a@b.test' }, { env: {}, store: s })).toEqual({ admitted: true, reason: 'gate-off' }); // prettier-ignore
    expect(s.calls).toBe(0);
  });

  it('caches an answer for 60 s, then asks again', async () => {
    const s = store();
    let now = 1_000;
    const opts = { env: ON, store: s, now: () => now };
    expect((await isAdmitted({ uid: 'u', email: 'a@b.test' }, opts)).admitted).toBe(false);
    now += 59_000;
    await isAdmitted({ uid: 'u', email: 'a@b.test' }, opts);
    expect(s.calls).toBe(1);
    now += 2_000;
    await isAdmitted({ uid: 'u', email: 'a@b.test' }, opts);
    expect(s.calls).toBe(2);
  });

  it('one passing rule admits even when another lookup fails', async () => {
    const s = store({ waitlistStatus: async () => { throw new Error('down'); }, inCohort: async () => true }); // prettier-ignore
    expect(await isAdmitted({ uid: 'u', email: 'a@b.test' }, { env: ON, store: s })).toEqual({ admitted: true, reason: 'friends-and-family' }); // prettier-ignore
  });

  it('the gate date: unset or garbage grandfathers no one', () => {
    expect(gateSince({})).toBeNull();
    expect(gateSince({ WAITLIST_GATE_SINCE: 'soon' })).toBeNull();
    expect(gateSince({ WAITLIST_GATE_SINCE: '2026-10-25' })?.toISOString()).toBe('2026-10-25T00:00:00.000Z'); // prettier-ignore
  });
});

async function chatTools(auth: string): Promise<number> {
  const req = Object.assign(new PassThrough(), { method: 'GET', url: '/api/chat/tools', headers: { authorization: auth } }); // prettier-ignore
  req.end();
  let status = 200;
  const res = { setHeader: vi.fn(), writeHead: (s: number) => void (status = s), end: vi.fn() };
  await handleChatRoutes(req as unknown as IncomingMessage, res as unknown as ServerResponse, '/api/chat/tools'); // prettier-ignore
  return status;
}

describe('text chat follows the same gate', () => {
  it('gate off: a signed-in stranger is served', async () => {
    vi.stubEnv('WAITLIST_GATE', 'off');
    expect(await chatTools('Bearer uid-new')).not.toBe(403);
  });

  it('gate on: refused unless admitted; service keys are not gated here', async () => {
    vi.stubEnv('WAITLIST_GATE', 'on');
    expect(await chatTools('Bearer uid-new')).toBe(403);
    members.list = ['uid-friend'];
    expect(await chatTools('Bearer uid-friend')).not.toBe(403);
    expect(await chatTools('Key uid-new')).not.toBe(403);
    vi.unstubAllEnvs();
  });
});
