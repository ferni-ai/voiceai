/**
 * MINOR_CARE: shared moments and the semantic index after a held call.
 *
 * Before: what a held call stored before its hold began (between its start and the age statement)
 * stayed: bogle_users/{uid}/shared_moments/* kept the caller's sentence as origin.whatTheySaid,
 * and deep-relationship read it back into a later call's prompt as an inside joke's origin; the
 * semantic index kept "User said: …" from reading between the lines. The purge had no entry for
 * either, and nothing stopped the index for a held caller.
 *
 * The real purge, the real writer, the real deep-relationship builder and the real index hook run;
 * only Firestore, the vector store and the embedder are faked. Synthetic uids and words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, SENTINEL } from '../../../../tests/helpers/snippet-leak.js';

type Json = Record<string, unknown>;
const fs = vi.hoisted(() => {
  const docs = new Map<string, Json>();
  /** Reads and writes of a path this matches throw, as an unavailable Firestore would. */
  const fail = { match: null as RegExp | null };
  let auto = 0;
  const clone = <T>(v: T): T => {
    try {
      return structuredClone(v);
    } catch {
      return v;
    }
  };
  const matches = (v: unknown, op: string, want: unknown): boolean => {
    if (op === 'in') return (want as unknown[]).includes(v);
    if (op === '==') return v === want;
    if (op !== '>=') return true;
    if (want instanceof Date) return v instanceof Date && v >= want;
    // Firestore ranges never cross types: a string bound matches strings only
    return typeof v === typeof want && (v as string | number) >= (want as string | number);
  };
  const check = (path: string) => {
    if (fail.match?.test(path)) throw new Error('14 UNAVAILABLE: fake outage');
  };
  type Filter = [string, string, unknown];
  const snapOf = (path: string) => {
    const data = docs.get(path);
    return {
      id: path.split('/').pop(),
      ref: ref(path),
      exists: data !== undefined,
      data: () => (data ? clone(data) : undefined),
      get: (field: string) => data?.[field],
    };
  };
  const ref = (path: string, filters: Filter[] = []): Json =>
    new Proxy(
      {
        path,
        id: path.split('/').pop(),
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = `auto${++auto}`) => ref(`${path}/${id}`),
        where: (f: string, op: string, v: unknown) => ref(path, [...filters, [f, op, v]]),
        orderBy: () => ref(path, filters),
        limit: () => ref(path, filters),
        get: async () => {
          check(path);
          if (docs.has(path)) return snapOf(path);
          const rows = [...docs.keys()]
            .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
            .filter((p) => filters.every(([f, op, v]) => matches(docs.get(p)![f], op, v)));
          return { exists: false, empty: !rows.length, size: rows.length, docs: rows.map(snapOf) };
        },
        set: async (d: Json, o?: { merge?: boolean }) => {
          check(path);
          docs.set(path, o?.merge ? { ...(docs.get(path) ?? {}), ...clone(d) } : clone(d));
        },
        update: async (d: Json) => void docs.set(path, { ...(docs.get(path) ?? {}), ...clone(d) }),
        delete: async () => (check(path), void docs.delete(path)),
        add: async (d: Json) => {
          const r = ref(`${path}/auto${++auto}`) as { set: (d: Json) => Promise<void> };
          await r.set(d);
          return r;
        },
      } as Json,
      { get: (t, k) => (k in t ? t[k as string] : k === 'then' ? undefined : () => ref(path)) }
    );
  type R = { get: () => Promise<unknown>; set: (d: Json, o?: unknown) => Promise<void> };
  type W = R & { update: (d: Json) => Promise<void>; delete: () => Promise<void> };
  const ops = {
    set: (r: R, d: Json, o?: unknown) => r.set(d, o),
    update: (r: W, d: Json) => r.update(d),
    delete: (r: W) => r.delete(),
  };
  const db = Object.assign(ref(''), {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: (r: R) => r.get(), ...ops }),
    batch: () => {
      const queued: Array<() => Promise<void>> = [];
      const q =
        (op: (...a: never[]) => Promise<void>) =>
        (...a: never[]) =>
          void queued.push(() => op(...a));
      return {
        set: q(ops.set as never),
        update: q(ops.update as never),
        delete: q(ops.delete as never),
        commit: async () => {
          for (const op of queued) await op();
        },
      };
    },
  });
  return { docs, fail, db };
});
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fs.db }));
vi.mock('@google-cloud/firestore', async (orig) => ({
  ...(await orig<Json>()),
  Firestore: class {
    constructor() {
      return fs.db;
    }
  },
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: () => undefined,
}));

/** The semantic index: doc id -> its metadata (the text is the embedded content). */
const index = vi.hoisted(() => new Map<string, { text: string; metadata: Json }>());
vi.mock('../../../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => ({
    list: async ({ userId }: { userId: string }) =>
      [...index]
        .filter(([, d]) => d.metadata.userId === userId)
        .map(([id, d]) => ({ id, ...structuredClone(d) })),
    removeDocument: async (id: string) => index.delete(id),
    addDocument: async (d: { id: string; text: string; metadata: Json }) =>
      void index.set(d.id, { text: d.text, metadata: d.metadata }),
  }),
}));
vi.mock('../../../../memory/embeddings.js', () => ({ embed: async () => [0.1, 0.2] }));

import { purgeHeldUser } from '../../../../agents/voice-agent/minor-care-purge.js';
import { buildDeepRelationshipContext, recordSharedMoment } from '../deep-relationship.js';
import { indexReadingBetweenLines } from '../../../../services/data-layer/integrations/trust-integration.js';
import { bindSessionUser, heldAfter, resetMinorCare } from '../../../../utils/minor-care.js';
import type { ContextBuilderInput } from '../../index.js';

let n = 0;
const uid = (tag: string) => `ShMp${tag}${String(++n).padStart(3, '0')}wR6tY3nBq8Lz`;
const DAY = 24 * 60 * 60 * 1000;
const OLDER_WORDS = 'the heron at the lake that would not stop staring at us';
const momentsOf = (u: string) =>
  [...fs.docs].filter(([p]) => p.startsWith(`/bogle_users/${u}/shared_moments/`));
/** A running gag stored at `at`, its origin the caller's words. */
function seedGag(u: string, id: string, at: number | string, said: string, trigger: string) {
  fs.docs.set(`/bogle_users/${u}/shared_moments/${id}`, {
    id,
    type: 'running_gag',
    content: `the ${trigger} thing`,
    origin: { whatTheySaid: said },
    triggers: [trigger],
    callbackCount: 0,
    callbackReception: 'positive',
    createdAt: typeof at === 'number' ? new Date(at).toISOString() : at,
  });
}
/** A later call's deep-relationship context, for text that triggers both gags. */
async function laterCall(u: string) {
  const input = {
    userText: 'ha, remember the quokka and the heron?',
    userData: { turnCount: 5 },
    services: { userId: u },
  } as unknown as ContextBuilderInput;
  return JSON.stringify(await buildDeepRelationshipContext(input));
}
/** A call that started 1 s ago, said something stored, then said they're 15. */
async function heldCall(u: string) {
  const s = `call-${u}`;
  const startedAt = Date.now() - 1000;
  bindSessionUser(s, u);
  fs.docs.set(`/bogle_users/${u}`, { totalConversations: 6 });
  // read in this order, so the held one is the callback a later call would pick first
  seedGag(u, 'held', Date.now() - 500, SENTINEL, 'quokka'); // before the age statement
  seedGag(u, 'older', Date.now() - 3 * DAY, OLDER_WORDS, 'heron'); // an earlier, ordinary call
  return { s, startedAt, hold: () => expect(heldAfter(s, "I'm 15.", { userId: u })).toBe(true) };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  fs.fail.match = null;
  resetMinorCare();
  vi.stubEnv('MINOR_CARE', 'on');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the purge and shared moments', () => {
  it('removes the moments made in the held window, of either writer, and keeps older ones', async () => {
    const u = uid('P');
    const call = await heldCall(u);
    // the real writer, before the age statement (an ISO createdAt), and an epoch-ms one
    await recordSharedMoment(u, {
      type: 'callback_moment',
      content: 'sad',
      whatTheySaid: SENTINEL,
      sessionId: call.s,
    });
    fs.docs.set(`/bogle_users/${u}/shared_moments/epoch`, {
      type: 'inside_joke',
      essence: SENTINEL,
      createdAt: Date.now() - 200,
    });
    expect(momentsOf(u)).toHaveLength(4);
    call.hold();
    purgeHeldUser(u, call.s, call.startedAt);
    const ids = () => momentsOf(u).map(([p]) => p.split('/').pop());
    await vi.waitFor(() => expect(ids()).toEqual(['older']));
    expect(leakedPieces(momentsOf(u))).toEqual([]);
  });

  it('a later call never surfaces a held-window moment, even when the scrub failed', async () => {
    const u = uid('R');
    const call = await heldCall(u);
    expect(await laterCall(u)).toContain('Dolores'); // before the purge, it would (control)
    call.hold();
    fs.fail.match = /shared_moments/; // the scrub can't reach Firestore
    purgeHeldUser(u, call.s, call.startedAt);
    await settle();
    fs.fail.match = null;
    expect(momentsOf(u)).toHaveLength(2); // still stored: only the read keeps it out
    resetMinorCare(); // the hold lapsed: the next call is ordinary
    const context = await laterCall(u);
    expect(leakedPieces(context)).toEqual([]);
    expect(context).toContain(OLDER_WORDS); // older moments still come back
    expect(context).toContain('1 inside jokes');
  });

  it("the history read during the held call isn't served from cache to a later call", async () => {
    const u = uid('C');
    const call = await heldCall(u);
    await laterCall(u); // a turn of the held call reads (and caches) both moments
    call.hold();
    purgeHeldUser(u, call.s, call.startedAt);
    await vi.waitFor(() => expect(momentsOf(u)).toHaveLength(1));
    resetMinorCare();
    const context = await laterCall(u);
    expect(leakedPieces(context)).toEqual([]);
    expect(context).toContain(OLDER_WORDS);
  });

  it('a non-held adult: every moment, recent ones included, still comes back', async () => {
    const u = uid('A');
    fs.docs.set(`/bogle_users/${u}`, { totalConversations: 6 });
    seedGag(u, 'recent', Date.now() - 500, SENTINEL, 'quokka');
    seedGag(u, 'older', Date.now() - 3 * DAY, OLDER_WORDS, 'heron');
    expect(heldAfter(`call-${u}`, "I'm 34.", { userId: u })).toBe(false);
    const context = await laterCall(u);
    expect(context).toContain('Dolores');
    expect(context).toContain('2 inside jokes');
  });
});

describe('the semantic index and MINOR_CARE', () => {
  const observe = (u: string, id: string) =>
    indexReadingBetweenLines(u, {
      id,
      observation: 'deflecting',
      whatTheySaid: SENTINEL,
      whatTheyMeant: 'worried',
    });

  it('indexes nothing while the caller is held; an adult is indexed as before', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const held = uid('IH');
    const adult = uid('IA');
    heldAfter(`call-${held}`, "I'm 15.", { userId: held });
    heldAfter(`call-${adult}`, "I'm 34.", { userId: adult });
    observe(held, 'h1');
    observe(adult, 'a1');
    await vi.advanceTimersByTimeAsync(2500); // the index's debounce
    vi.useRealTimers();
    const ownersNow = () => [...index.values()].map((d) => d.metadata.userId);
    await vi.waitFor(() => expect(ownersNow()).toContain(adult));
    const owners = [...index.values()].map((d) => d.metadata.userId);
    expect(owners).toContain(adult);
    expect(owners).not.toContain(held);
  });

  it('the purge removes what was indexed in the held window; older and other users stay', async () => {
    const u = uid('IP');
    const other = uid('IO');
    const call = await heldCall(u);
    const at = (ms: number) => new Date(ms).toISOString();
    const entry = (userId: string, indexedAt: string, text: string) => ({
      text,
      metadata: {
        userId,
        source: 'store_auto_sync',
        entityType: 'reading_between_lines',
        indexedAt,
      },
    });
    index.set(`ip-held-${u}`, entry(u, at(Date.now() - 300), `User said: "${SENTINEL}".`));
    index.set(`ip-old-${u}`, entry(u, at(Date.now() - 2 * DAY), 'User said: "older".'));
    index.set(`ip-other-${u}`, entry(other, at(Date.now() - 300), 'User said: "theirs".'));
    call.hold();
    purgeHeldUser(u, call.s, call.startedAt);
    await vi.waitFor(() => expect(index.has(`ip-held-${u}`)).toBe(false));
    expect(index.has(`ip-old-${u}`)).toBe(true);
    expect(index.has(`ip-other-${u}`)).toBe(true);
    expect(leakedPieces([...index.values()].filter((d) => d.metadata.userId === u))).toEqual([]);
  });
});
