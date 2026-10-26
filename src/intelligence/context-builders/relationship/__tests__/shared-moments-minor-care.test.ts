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
  /** A field by its dotted path (metadata.userId). */
  const at = (data: Json | undefined, f: string): unknown =>
    f.split('.').reduce<unknown>((v, k) => (v as Json | undefined)?.[k], data);
  const snapOf = (path: string) => {
    const data = docs.get(path);
    return {
      id: path.split('/').pop(),
      ref: ref(path),
      exists: data !== undefined,
      data: () => (data ? clone(data) : undefined),
      get: (field: string) => at(data, field),
    };
  };
  type Page = { limit?: number; after?: string };
  const ref = (path: string, filters: Filter[] = [], page: Page = {}): Json =>
    new Proxy(
      {
        path,
        id: path.split('/').pop(),
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = `auto${++auto}`) => ref(`${path}/${id}`),
        where: (f: string, op: string, v: unknown) => ref(path, [...filters, [f, op, v]], page),
        orderBy: () => ref(path, filters, page), // rows come in id order
        select: () => ref(path, filters, page),
        limit: (limit: number) => ref(path, filters, { ...page, limit }),
        startAfter: (snap: { id: string }) => ref(path, filters, { ...page, after: snap.id }),
        get: async () => {
          check(path);
          if (docs.has(path)) return snapOf(path);
          const rows = [...docs.keys()]
            .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
            .filter((p) => filters.every(([f, op, v]) => matches(at(docs.get(p), f), op, v)))
            .sort()
            .filter((p) => page.after === undefined || p.split('/').pop()! > page.after)
            .slice(0, page.limit ?? Infinity);
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
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'now' },
  FieldPath: { documentId: () => '__name__' },
}));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fs.db }));
vi.mock('../../../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<Json>()),
  getFirestoreDb: () => fs.db,
}));
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

// The semantic index is the vectors collection of the fake Firestore (/vectors/{id})
vi.mock('../../../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => ({
    list: async () => [],
    removeDocument: async (id: string) => fs.docs.delete(`/vectors/${id}`),
    addDocument: async (d: { id: string; text: string; metadata: Json }) =>
      void fs.docs.set(`/vectors/${d.id}`, { text: d.text, metadata: structuredClone(d.metadata) }),
  }),
}));
/** Runs while a document is being embedded (the window between the hold check and the write). */
const embedding = vi.hoisted(() => ({
  during: null as null | (() => void),
  texts: [] as string[],
}));
vi.mock('../../../../memory/embeddings.js', () => ({
  embed: async (text: string) => (embedding.texts.push(text), embedding.during?.(), [0.1, 0.2]),
}));

import { purgeHeldUser } from '../../../../agents/voice-agent/minor-care-purge.js';
import { buildDeepRelationshipContext, recordSharedMoment } from '../deep-relationship.js';
import {
  loadSharedMoments,
  recordSharedMoment as recordInsideJoke,
} from '../../../../services/superhuman/inside-joke-memory.js';
import { indexReadingBetweenLines } from '../../../../services/data-layer/integrations/trust-integration.js';
import { onStoreChange } from '../../../../services/data-layer/store-hooks.js';
import {
  MAX_PAGES,
  purgeHeldIndexEntries,
} from '../../../../services/data-layer/held-index-purge.js';
import { withoutForgotten } from '../../../../memory/firestore-vector-store/forget-filter.js';
import {
  loadMemories,
  processCollectionInput,
} from '../../../../services/memory-lane/memory-collector.js';
import {
  noteHeldWindow,
  recordedWhileHeld,
} from '../../../../services/trust-systems/held-window.js';
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
const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 30);
  });

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
    // after the window: another process's call for the same account, a minute from now
    seedGag(u, 'after', Date.now() + 60_000, 'the owner, later', 'otter');
    expect(momentsOf(u)).toHaveLength(5);
    call.hold();
    purgeHeldUser(u, call.s, call.startedAt);
    const ids = () => momentsOf(u).map(([p]) => p.split('/').pop());
    await vi.waitFor(() => expect(ids()).toEqual(['older', 'after']));
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

  it("inside-joke-memory's writer stores nothing for a held caller; an adult's as before", async () => {
    const held = uid('JH');
    const adult = uid('JA');
    heldAfter(`call-${held}`, "I'm 15.", { userId: held });
    const joke = (u: string) =>
      recordInsideJoke(u, 'inside_joke', SENTINEL, 'the lake', ['heron'], 'the heron', 0.7);
    expect(await joke(held)).toBeNull();
    expect(momentsOf(held)).toEqual([]);
    expect(await joke(adult)).toEqual(expect.any(String));
    expect(momentsOf(adult)).toHaveLength(1);
  });

  it("inside-joke-memory's reader never returns a held-window moment (epoch-ms createdAt)", async () => {
    const u = uid('JL');
    const joke = (at: number, essence: string) => ({
      type: 'inside_joke',
      essence,
      resonance: 0.9,
      createdAt: at,
    });
    fs.docs.set(`/bogle_users/${u}/shared_moments/a-held`, joke(Date.now() - 300, SENTINEL));
    fs.docs.set(`/bogle_users/${u}/shared_moments/b-older`, joke(Date.now() - DAY, OLDER_WORDS));
    expect(await loadSharedMoments(u)).toHaveLength(2); // control
    noteHeldWindow(u, Date.now() - 1000); // as a purge whose scrub failed leaves it
    const moments = await loadSharedMoments(u);
    expect(moments.map((m) => m.id)).toEqual(['b-older']);
    expect(leakedPieces(moments)).toEqual([]);
  });

  it('a non-held adult: every moment, recent ones included, still comes back', async () => {
    const u = uid('A');
    fs.docs.set(`/bogle_users/${u}`, { totalConversations: 6 });
    seedGag(u, 'a-recent', Date.now() - 500, SENTINEL, 'quokka'); // read first (id order)
    seedGag(u, 'b-older', Date.now() - 3 * DAY, OLDER_WORDS, 'heron');
    expect(heldAfter(`call-${u}`, "I'm 34.", { userId: u })).toBe(false);
    const context = await laterCall(u);
    expect(context).toContain('Dolores');
    expect(context).toContain('2 inside jokes');
  });
});

const vectors = () => [...fs.docs].filter(([p]) => p.startsWith('/vectors/'));
const vectorOf = (id: string) => fs.docs.get(`/vectors/${id}`) as { metadata: Json } | undefined;
const ownersOf = () => vectors().map(([, d]) => (d.metadata as Json).userId);
/** An auto-synced index entry for `userId`, indexed at `ms`. */
function seedVector(id: string, userId: string, ms: number, text = 'User said: "older".') {
  const metadata = { userId, source: 'store_auto_sync', entityType: 'reading_between_lines' };
  fs.docs.set(`/vectors/${id}`, { text, metadata: { ...metadata, indexedAt: iso(ms) } });
}
const iso = (ms: number) => new Date(ms).toISOString();

describe('the semantic index and MINOR_CARE', () => {
  const observe = (u: string, id: string, said = SENTINEL) =>
    indexReadingBetweenLines(u, {
      id,
      observation: 'deflecting',
      whatTheySaid: said,
      whatTheyMeant: 'worried',
    });
  /** Past the index's 2 s debounce, then until its write settles. */
  async function indexed(check: () => void) {
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
    await vi.waitFor(check);
  }

  it('indexes nothing while the caller is held; an adult is indexed as before', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const held = uid('IH');
    const adult = uid('IA');
    heldAfter(`call-${held}`, "I'm 15.", { userId: held });
    heldAfter(`call-${adult}`, "I'm 34.", { userId: adult });
    embedding.texts = [];
    observe(held, 'h1');
    observe(adult, 'a1', 'the adult said something else entirely');
    await indexed(() => expect(ownersOf()).toContain(adult));
    expect(ownersOf()).not.toContain(held);
    // nor sent to the embedder (an external API): the hold is checked before it, too
    expect(embedding.texts).toHaveLength(1);
    expect(leakedPieces(embedding.texts)).toEqual([]);
  });

  it('a hold that begins while the entry is embedded: nothing is written', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const u = uid('IE');
    const other = uid('IF');
    embedding.during = () => void heldAfter(`call-${u}`, "I'm 15.", { userId: u });
    observe(u, 'e1');
    observe(other, 'e2'); // embedded after: the hook still fires, but for someone else
    await indexed(() => expect(ownersOf()).toContain(other));
    embedding.during = null;
    expect(ownersOf()).not.toContain(u);
  });

  it("a caller's metadata can't replace the store's source, indexedAt or owner", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const u = uid('IM');
    const before = Date.now();
    onStoreChange({
      storeType: 'trust',
      changeType: 'create',
      userId: u,
      entityType: 'reading_between_lines',
      entityId: 'm1',
      content: 'Reading between lines: deflecting.',
      metadata: { source: 'forged', indexedAt: '2000-01-01T00:00:00.000Z', userId: 'someone' },
    });
    await indexed(() => expect(vectorOf('trust_reading_between_lines_m1')).toBeDefined());
    const m = vectorOf('trust_reading_between_lines_m1')!.metadata;
    expect(m.source).toBe('store_auto_sync');
    expect(m.userId).toBe(u);
    expect(Date.parse(String(m.indexedAt))).toBeGreaterThanOrEqual(before);
  });

  it('the purge removes what was indexed in the held window; older and other users stay', async () => {
    const u = uid('IP');
    const other = uid('IO');
    const call = await heldCall(u);
    seedVector(`ip-held-${u}`, u, Date.now() - 300, `User said: "${SENTINEL}".`);
    seedVector(`ip-old-${u}`, u, Date.now() - 2 * DAY);
    seedVector(`ip-other-${u}`, other, Date.now() - 300);
    call.hold();
    purgeHeldUser(u, call.s, call.startedAt);
    await vi.waitFor(() => expect(vectorOf(`ip-held-${u}`)).toBeUndefined());
    expect(vectorOf(`ip-old-${u}`)).toBeDefined();
    expect(vectorOf(`ip-other-${u}`)).toBeDefined();
  });

  it('pages past 500 entries: held ones after the first page are removed too', async () => {
    const u = uid('IG');
    const since = Date.now() - 1000;
    noteHeldWindow(u, since);
    for (let i = 0; i < 650; i++) {
      const held = i >= 600; // ids sort after the first 500
      seedVector(`pg-${u}-${String(i).padStart(4, '0')}`, u, held ? since + 10 : since - DAY);
    }
    expect(await purgeHeldIndexEntries(u, (t) => recordedWhileHeld(u, t))).toBe(50);
    expect(vectors().filter(([p]) => p.includes(`pg-${u}`))).toHaveLength(600);
  });

  it('a listing that fails or is cut short counts as a failed purge (-1)', async () => {
    const u = uid('IX');
    for (let i = 0; i < MAX_PAGES * 500 + 1; i++) seedVector(`cx-${u}-${i}`, u, Date.now() - DAY);
    expect(await purgeHeldIndexEntries(u, () => false)).toBe(-1); // more pages than it reads
    for (const [p] of vectors()) if (p.includes(`cx-${u}`)) fs.docs.delete(p);
    fs.fail.match = /^\/vectors$/;
    expect(await purgeHeldIndexEntries(u, () => false)).toBe(-1);
  });

  it('search never returns an entry indexed during a purged held call', async () => {
    const u = uid('IS');
    noteHeldWindow(u, Date.now() - 1000);
    const result = (id: string, ms: number) => ({
      score: 0.9,
      document: {
        id,
        text: 'User said: "something".',
        metadata: { userId: u, indexedAt: iso(ms) },
      },
    });
    const reads = { topics: async () => [], docs: async () => new Map() };
    const found = await withoutForgotten(
      u,
      [result('held', Date.now() - 500), result('older', Date.now() - DAY)],
      reads
    );
    expect(found.map((r) => r.document.id)).toEqual(['older']);
  });
});

describe('Memory Lane and MINOR_CARE', () => {
  const highlightsOf = (u: string) =>
    [...fs.docs].filter(([p]) => p.startsWith(`/bogle_users/${u}/memory_highlights/`));
  const capture = (u: string, jokeId: string) =>
    processCollectionInput({
      userId: u,
      sourceType: 'inside_joke',
      sourceId: jokeId,
      rawContent: SENTINEL,
      occurredAt: new Date(),
    } as never);
  function seedHighlight(u: string, id: string, ms: number, content: string) {
    fs.docs.set(`/bogle_users/${u}/memory_highlights/${id}`, {
      id,
      userId: u,
      content,
      type: 'inside_joke',
      sourceType: 'inside_joke',
      sourceId: id,
      occurredAt: iso(ms),
      createdAt: iso(ms),
      updatedAt: iso(ms),
    });
  }

  it('a held caller gets no capture; an adult still does', async () => {
    const held = uid('MH');
    const adult = uid('MA');
    heldAfter(`call-${held}`, "I'm 15.", { userId: held });
    expect((await capture(held, 'j1')).success).toBe(false);
    expect(highlightsOf(held)).toEqual([]);
    expect((await capture(adult, 'j2')).success).toBe(true);
    expect(highlightsOf(adult)).toHaveLength(1);
  });

  it('the purge deletes captures from the held window and keeps older ones', async () => {
    const u = uid('MP');
    const call = await heldCall(u);
    seedHighlight(u, 'held', Date.now() - 400, SENTINEL);
    seedHighlight(u, 'older', Date.now() - 30 * DAY, OLDER_WORDS);
    call.hold();
    purgeHeldUser(u, call.s, call.startedAt);
    const ids = () => highlightsOf(u).map(([p]) => p.split('/').pop());
    await vi.waitFor(() => expect(ids()).toEqual(['older']));
  });

  it('a later read never returns a held-window capture, even when the scrub failed', async () => {
    const u = uid('MR');
    const call = await heldCall(u);
    seedHighlight(u, 'held', Date.now() - 400, SENTINEL);
    seedHighlight(u, 'older', Date.now() - 30 * DAY, OLDER_WORDS);
    expect((await loadMemories(u)).map((m) => m.id).sort()).toEqual(['held', 'older']); // control
    call.hold();
    fs.fail.match = /memory_highlights$/; // the scrub's queries fail
    purgeHeldUser(u, call.s, call.startedAt);
    await settle();
    fs.fail.match = null;
    expect(highlightsOf(u)).toHaveLength(2);
    resetMinorCare();
    const memories = await loadMemories(u);
    expect(memories.map((m) => m.id)).toEqual(['older']);
    expect(leakedPieces(memories)).toEqual([]);
  });
});
