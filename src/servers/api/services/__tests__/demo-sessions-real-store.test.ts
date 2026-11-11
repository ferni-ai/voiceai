/**
 * #1759 on the real store: the real routes, the real demo-sessions service and the real
 * persistence store (its updateIfUnchanged and load({ fresh })) over the merge fake
 * Firestore, which enforces the lastUpdateTime precondition. Two UI server instances are
 * two fresh module graphs. demo-sessions-cross-instance.test.ts mocks the store, so it
 * can't see a dropped precondition or a whole document sent through updateIfUnchanged;
 * this file does. Adapted from the independent verify's probe (v3701). Fictional data only.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
vi.mock('../../../../utils/interval-manager.js', () => ({
  registerInterval: vi.fn(),
  clearNamedInterval: vi.fn(),
}));
// Bearer token "tok:<uid>" verifies as <uid>; anything else is invalid.
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: async (t: string) => (t.startsWith('tok:') ? { uid: t.slice(4) } : null),
  isVerifiedToken: (v: unknown) => !!v,
}));

const state: MergeFakeState = newMergeFakeState();
fake.db = createMergeFakeFirestore(state);

interface Inst {
  svc: typeof import('../demo-sessions.js');
  update: typeof import('../../routes/demo-session-update.js');
  claim: typeof import('../../routes/demo-claim.js');
}
async function instance(): Promise<Inst> {
  vi.resetModules();
  const svc = await import('../demo-sessions.js');
  const update = await import('../../routes/demo-session-update.js');
  const claim = await import('../../routes/demo-claim.js');
  return { svc, update, claim };
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
async function call(
  h: Handler,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: Record<string, unknown> }> {
  const emitter = new EventEmitter();
  const req = Object.assign(emitter, {
    method: 'POST',
    headers,
    socket: { remoteAddress: '127.0.0.1' },
    destroy: () => undefined,
  }) as unknown as IncomingMessage;
  const out = { status: 0, raw: '' };
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(code: number) {
      out.status = code;
      res.headersSent = true;
    },
    end(data?: string) {
      out.raw = data ?? '';
      res.writableEnded = true;
    },
  };
  const done = h(req, res as unknown as ServerResponse);
  emitter.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
  emitter.emit('end');
  await done;
  return { status: out.status, json: out.raw ? JSON.parse(out.raw) : {} };
}

const ROOM = 'demo-demo_1793900000000_samriv';
const PATH = `demo_sessions/${ROOM}`;
interface StoredDemo {
  claimed: boolean;
  claimedBy: string | null;
  claimedAt: number | null;
  claimToken: string;
  expiresAt: number;
  owner?: unknown;
  userId?: unknown;
  conversation: { topics: string[]; highlights: string[]; ferniNotes?: string };
}
const doc = (): StoredDemo | undefined => state.docs.get(PATH) as StoredDemo | undefined;
const topicsOf = (r: { json: Record<string, unknown> }): unknown =>
  (r.json.conversation as { topics?: unknown } | undefined)?.topics;
const CONV = { topics: ['gardening'], highlights: ['Sam Rivera likes tomatoes'] };

let A: Inst;
let B: Inst;
let token: string;

const claimVia = (i: Inst, tok: string, uid: string) =>
  call(i.claim.handleDemoClaim, { claim_token: tok }, { authorization: `Bearer tok:${uid}` });
const updateVia = (i: Inst, body: Record<string, unknown>) =>
  call(i.update.handleDemoSessionUpdate, { room_name: ROOM, claim_token: token, ...body });

beforeEach(async () => {
  state.docs.clear();
  state.versions.clear();
  state.writes.length = 0;
  state.beforeRead = undefined;
  state.beforeWrite = undefined;
  A = await instance();
  ({ claimToken: token } = await A.svc.createDemoSession(ROOM, 'demo_1793900000000_samriv'));
  B = await instance();
  await B.svc.getDemoSession(ROOM); // B caches and indexes the demo (unclaimed, empty)
});

describe('who can claim', () => {
  it('room name as token, guessed token, other demo token, expired: refused, no conversation', async () => {
    expect((await updateVia(A, { conversation: CONV })).status).toBe(200);
    // second visitor's demo
    const other = await A.svc.createDemoSession('demo-demo_1793900000001_riley', 'demo_x');
    for (const tok of [ROOM, 'f'.repeat(32), 'deadbeef']) {
      const r = await claimVia(A, tok, 'uid-intruder');
      expect(r.status).toBe(400);
      expect(r.json.conversation).toBeUndefined();
    }
    // other visitor's token claims only their own (empty) demo, never Sam's text
    const r2 = await claimVia(A, other.claimToken, 'uid-intruder');
    expect(JSON.stringify(r2.json)).not.toContain('tomatoes');
    // body firebase_uid mismatch
    const r3 = await call(
      A.claim.handleDemoClaim,
      { claim_token: token, firebase_uid: 'uid-sam' },
      { authorization: 'Bearer tok:uid-intruder' }
    );
    expect(r3.status).toBe(403);
    expect(r3.json.conversation).toBeUndefined();
    // no auth
    const r4 = await call(A.claim.handleDemoClaim, { claim_token: token });
    expect(r4.status).toBe(401);
    expect(doc()?.claimed).toBe(false);
    // expired
    state.docs.set(PATH, { ...doc()!, expiresAt: Date.now() - 1 });
    state.versions.set(PATH, (state.versions.get(PATH) ?? 0) + 1);
    const r5 = await claimVia(B, token, 'uid-sam');
    expect(r5.status).toBe(400);
    expect(r5.json.conversation).toBeUndefined();
  });
});

describe('races between instances', () => {
  it('two accounts racing concurrently: exactly one wins, loser gets nothing', async () => {
    await updateVia(A, { conversation: CONV });
    const [ra, rb] = await Promise.all([
      claimVia(A, token, 'uid-sam'),
      claimVia(B, token, 'uid-riley'),
    ]);
    const wins = [ra, rb].filter((r) => r.status === 200);
    const losers = [ra, rb].filter((r) => r.status !== 200);
    expect(wins).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]!.json.conversation).toBeUndefined();
    const winner = ra.status === 200 ? 'uid-sam' : 'uid-riley';
    expect(doc()).toMatchObject({ claimed: true, claimedBy: winner });
    expect(topicsOf(wins[0]!)).toEqual(['gardening']);
    expect(doc()!.conversation.topics).toEqual(['gardening']);
  });

  it('a claim that lands between the loser snapshot and its update: loser refused (precondition)', async () => {
    await updateVia(A, { conversation: CONV });
    state.beforeWrite = (p) => {
      if (p !== PATH) return;
      state.beforeWrite = undefined;
      state.docs.set(PATH, { ...doc()!, claimed: true, claimedBy: 'uid-riley', claimedAt: 1 });
      state.versions.set(PATH, (state.versions.get(PATH) ?? 0) + 1);
    };
    const r = await claimVia(A, token, 'uid-sam');
    expect(r.status).toBe(400);
    expect(r.json.conversation).toBeUndefined();
    expect(doc()).toMatchObject({ claimed: true, claimedBy: 'uid-riley' });
  });

  it('claim from B stale cache returns and keeps the conversation written on A', async () => {
    await updateVia(A, { conversation: CONV });
    const r = await claimVia(B, token, 'uid-sam');
    expect(r.status).toBe(200);
    expect(topicsOf(r)).toEqual(['gardening']);
    expect(doc()!.conversation.highlights).toEqual(CONV.highlights);
  });

  it('stale-cache conversation write cannot undo a claim made on another instance', async () => {
    await A.svc.getDemoSession(ROOM);
    expect((await claimVia(B, token, 'uid-sam')).status).toBe(200);
    const r = await updateVia(A, { conversation: { topics: ['late write'] } });
    expect(r.status).toBe(409);
    expect(doc()).toMatchObject({ claimed: true, claimedBy: 'uid-sam' });
    expect(doc()!.conversation.topics).toEqual([]);
  });

  it('claim landing between conversation snapshot and update: conversation write refused', async () => {
    state.beforeWrite = (p) => {
      if (p !== PATH) return;
      state.beforeWrite = undefined;
      state.docs.set(PATH, { ...doc()!, claimed: true, claimedBy: 'uid-sam', claimedAt: 1 });
      state.versions.set(PATH, (state.versions.get(PATH) ?? 0) + 1);
    };
    const r = await updateVia(A, { conversation: { topics: ['late write'] } });
    expect(r.status).toBe(409);
    expect(doc()).toMatchObject({ claimed: true, claimedBy: 'uid-sam' });
    expect(doc()!.conversation.topics).toEqual([]);
  });

  it('two conversation writes from two instances: the second merges or is refused, never loses the first', async () => {
    expect((await updateVia(A, { conversation: { topics: ['gardening'] } })).status).toBe(200);
    const r = await updateVia(B, { conversation: { userMood: 'curious' } });
    expect([200, 503]).toContain(r.status);
    expect(doc()!.conversation.topics).toEqual(['gardening']);
  });

  it("a conversation landing between the claim's read and its write comes back in the claim", async () => {
    let reads = 0;
    state.beforeRead = (p) => {
      if (p !== PATH) return;
      reads++;
      if (reads === 2) {
        state.docs.set(PATH, { ...doc()!, conversation: { ...doc()!.conversation, ...CONV } });
        state.versions.set(PATH, (state.versions.get(PATH) ?? 0) + 1);
      }
    };
    const r = await claimVia(B, token, 'uid-sam');
    state.beforeRead = undefined;
    expect(r.status).toBe(200);
    expect(doc()!.conversation.topics).toEqual(['gardening']); // stored intact
    expect(topicsOf(r)).toEqual(doc()!.conversation.topics); // handed to the user to migrate
  });
});

describe('the update route', () => {
  const bad: Array<[string, unknown]> = [
    ['unknown conv field', { ...CONV, extra: 'x' }],
    ['claimedBy in conv', { claimedBy: 'uid-evil' }],
    ['claimed in conv', { claimed: true }],
    ['__proto__ in conv', JSON.parse('{"__proto__": {"claimed": true}}')],
    ['constructor', { constructor: 'x' }],
    ['ferniNotes 4001', { ferniNotes: 'n'.repeat(4001) }],
    ['ferniNotes number', { ferniNotes: 5 }],
    ['topics 51', { topics: Array(51).fill('t') }],
    ['topics item 501', { topics: ['t'.repeat(501)] }],
    ['topics string', { topics: 'gardening' }],
    ['topics numbers', { topics: [1] }],
    ['highlights obj', { highlights: [{}] }],
    ['userMood 65', { userMood: 'm'.repeat(65) }],
    ['userMood number', { userMood: 3 }],
    ['messages 201', { messages: Array(201).fill({ r: 'u' }) }],
    ['message 5KB', { messages: [{ t: 'x'.repeat(5000) }] }],
    ['messages prims', { messages: ['hi'] }],
    ['messages array item', { messages: [[1]] }],
    ['messages obj', { messages: { a: 1 } }],
  ];
  it.each(bad)('400 + nothing written: %s', async (_n, conversation) => {
    const before = JSON.stringify(doc());
    const r = await updateVia(A, { conversation });
    expect(r.status).toBe(400);
    expect(JSON.stringify(doc())).toBe(before);
    expect(JSON.stringify(r.json)).not.toContain('uid-evil');
  });

  it('boundaries accepted', async () => {
    const r = await updateVia(A, {
      conversation: {
        ferniNotes: 'n'.repeat(4000),
        topics: Array(50).fill('t'.repeat(500)),
        highlights: [],
        userMood: null,
        messages: Array(10).fill({ role: 'user', text: 'hello' }),
      },
    });
    expect(r.status).toBe(200);
    expect(doc()!.conversation.ferniNotes).toHaveLength(4000);
  });

  it('top-level body fields never reach claim/owner fields', async () => {
    const r = await updateVia(A, {
      conversation: { topics: ['gardening'] },
      claimed: true,
      claimedBy: 'uid-evil',
      claimedAt: 1,
      owner: 'uid-evil',
      userId: 'uid-evil',
      claimToken: 'f'.repeat(32),
      expiresAt: 9e15,
    });
    const d = doc()!;
    expect(d).toMatchObject({
      claimed: false,
      claimedBy: null,
      claimedAt: null,
      claimToken: token,
    });
    expect(d.owner).toBeUndefined();
    expect(d.userId).toBeUndefined();
    expect(d.expiresAt).toBeLessThan(9e15);
    // record what the route answered for top-level extras
    expect(r.status).toBe(200); // top-level extras ignored, not rejected
    const writes = state.writes.filter((w) => w.op === 'update');
    for (const w of writes) expect(Object.keys(w.data!)).toEqual(['conversation']);
  });

  it('non-object conversation: 400', async () => {
    for (const c of ['x', [1], null, 5])
      expect((await updateVia(A, { conversation: c })).status).toBe(400);
  });

  it('a wrong token is 403 and writes nothing', async () => {
    const before = JSON.stringify(doc());
    const r = await call(A.update.handleDemoSessionUpdate, {
      room_name: ROOM,
      claim_token: 'f'.repeat(32),
      conversation: CONV,
    });
    expect(r.status).toBe(403);
    expect(JSON.stringify(doc())).toBe(before);
  });
});

describe('a claimed demo', () => {
  it('after claim: other account refused w/o text, update route 409 w/o text, owner re-claim gets text', async () => {
    await updateVia(A, { conversation: CONV });
    expect((await claimVia(A, token, 'uid-sam')).status).toBe(200);
    const other = await claimVia(B, token, 'uid-riley');
    expect(other.status).toBe(400);
    expect(JSON.stringify(other.json)).not.toContain('tomatoes');
    const up = await updateVia(B, { conversation: { topics: ['x'] } });
    expect(up.status).toBe(409);
    expect(JSON.stringify(up.json)).not.toContain('tomatoes');
    const again = await claimVia(B, token, 'uid-sam');
    expect(again.status).toBe(200);
    expect(again.json.already_claimed).toBe(true);
    expect(JSON.stringify(again.json)).toContain('tomatoes');
    expect(doc()!.conversation.topics).toEqual(['gardening']); // text stays stored after claim
  });
});

describe("the claim's re-read fails or finds nothing", () => {
  /** On the nth read of the demo doc in the claim (1 fresh, 2 snapshot, 3 re-read), run `act`. */
  const onRead = (n: number, act: () => void): void => {
    let reads = 0;
    state.beforeRead = (p) => {
      if (p === PATH && ++reads === n) act();
    };
  };

  it('the re-read throws: the claimer still gets claimed:true; another account is refused', async () => {
    await updateVia(A, { conversation: CONV });
    onRead(3, () => {
      state.failReads = new Set([PATH]);
    });
    const res = await A.svc.claimDemoSession(token, 'uid-sam');
    state.beforeRead = undefined;
    state.failReads = undefined;
    expect(res.success).toBe(true);
    expect(res.session).toMatchObject({ claimed: true, claimedBy: 'uid-sam', roomName: ROOM });
    expect(res.session?.conversation.topics).toEqual(['gardening']);
    expect(doc()).toMatchObject({ claimed: true, claimedBy: 'uid-sam' });
    const other = await claimVia(B, token, 'uid-riley');
    expect(other.status).toBe(400);
    expect(other.json.conversation).toBeUndefined();
    const sameInstance = await A.svc.claimDemoSession(token, 'uid-riley');
    expect(sameInstance.success).toBe(false);
    expect(sameInstance.session).toBeUndefined();
  });

  it('the doc is gone by the re-read: the claimer still gets claimed:true; another account is refused', async () => {
    await updateVia(A, { conversation: CONV });
    onRead(3, () => {
      state.docs.delete(PATH);
      state.versions.set(PATH, (state.versions.get(PATH) ?? 0) + 1);
    });
    const res = await A.svc.claimDemoSession(token, 'uid-sam');
    state.beforeRead = undefined;
    expect(res.success).toBe(true);
    expect(res.session).toMatchObject({ claimed: true, claimedBy: 'uid-sam', roomName: ROOM });
    expect(doc()).toBeUndefined(); // not written back
    const other = await A.svc.claimDemoSession(token, 'uid-riley');
    expect(other.success).toBe(false);
    expect(other.session).toBeUndefined();
  });
});
