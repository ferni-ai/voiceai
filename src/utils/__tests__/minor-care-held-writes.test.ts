/**
 * MINOR_CARE=on, the writes a held caller under 18 (not a verified owner) may still make:
 * - payments (tips, value capture) are stored, but never the words around them;
 * - held fields (consent, opt-outs) never come back after a delete, an older one never overwrites
 *   a newer one, and shutdown or an explicit flush writes them even while they back off.
 * Only Firestore is faked; it keeps each document so the end state can be checked.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as { path: string; data: unknown }[]);
/** The documents as they end up: a set merges top-level fields, a delete removes the doc. */
const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
/** Per path: run `during` inside the next write (still in flight), then fail it or let it land. */
type Hook = { fail: number; failed: number; during?: () => unknown; hang?: Promise<void> };
/** Per path: how many of the next deletes fail. */
const failDeletes = vi.hoisted(() => new Map<string, number>());
/** Deletes that landed, by path. */
const deletes = vi.hoisted(() => [] as string[]);
/** The order of writes and deletes, for the sequence tests. */
const events = vi.hoisted(() => [] as string[]);
const hooks = vi.hoisted(() => new Map<string, Hook>());
/** Writes in flight right now, and the most at once. */
const flight = vi.hoisted(() => ({ now: 0, max: 0 }));

const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => empty,
        set: async (data: Record<string, unknown>) => {
          const hook = [...hooks].find(([p]) => path.includes(p))?.[1];
          const { during, hang } = hook ?? {};
          const fails = !!hook && hook.fail > 0; // decided at the start: this write's outcome
          if (hook) Object.assign(hook, { during: undefined, hang: undefined });
          if (hook && fails) Object.assign(hook, { fail: hook.fail - 1, failed: hook.failed + 1 });
          flight.max = Math.max(flight.max, ++flight.now);
          try {
            await during?.();
            await hang; // a write that hangs until the test releases it
            for (let i = 0; i < 20; i++) await Promise.resolve(); // still in flight a while
          } finally {
            flight.now--;
          }
          if (fails) throw new Error('unavailable');
          written.push({ path, data });
          // A merge set: top-level fields replace; FieldValue.delete() removes the field
          const isDelete = (v: unknown) =>
            (v as { methodName?: string })?.methodName === 'FieldValue.delete';
          const removed = Object.keys(data).filter((k) => isDelete(data[k]));
          events.push(removed.length ? `delete ${removed}` : `set ${JSON.stringify(data.prefs)}`);
          const doc: Record<string, unknown> = { ...docs.get(path), ...data };
          for (const k of removed) delete doc[k];
          docs.set(path, doc);
        },
        delete: async () => {
          const entry = [...failDeletes].find(([p, left]) => path.includes(p) && left > 0);
          if (entry) {
            failDeletes.set(entry[0], entry[1] - 1);
            events.push('remove FAIL');
            throw new Error('unavailable');
          }
          docs.delete(path);
          deletes.push(path);
          events.push('remove ok');
        },
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  const tx = (r: { path: string }, data: Record<string, unknown>) => {
    written.push({ path: r.path, data });
    docs.set(r.path, { ...docs.get(r.path), ...data });
  };
  return Object.assign(ref(''), {
    batch: () => ({ set: tx, update: tx, delete: tx, commit: async () => undefined }),
  });
});
vi.mock('@google-cloud/firestore', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  Firestore: class {
    constructor() {
      return fakeDb;
    }
  },
}));

import { createPersistenceStore } from '../../services/persistence/index.js';
import { heldFields } from '../../services/persistence/held-fields.js';
import {
  initMonetizationPersistence,
  saveTip,
  saveValueEvent,
} from '../../services/monetization/persistence.js';
import { tipJar } from '../../services/monetization/tip-jar.js';
import { valueCapture } from '../../services/monetization/value-capture.js';
import { heldAfter, resetMinorCare, setVerifiedOwnerCheck, userHeld } from '../minor-care.js';

let n = 0;
/** A held caller (said 16, not an owner), or a verified owner. */
function caller(owner = false): string {
  const sessionId = `held-writes-${++n}`;
  const userId = `user-${sessionId}`;
  vi.stubEnv('MINOR_CARE', 'on');
  if (owner) setVerifiedOwnerCheck((s) => s === sessionId);
  heldAfter(sessionId, "I'm 16 years old and kind of bored", { userId });
  return userId;
}

async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
}

type Prefs = { prefs: { optOut: string }; story: string };
let stores = 0;
/** A store whose held users keep only `prefs`, as outreach and notifications do. */
function prefsStore() {
  const collection = `held_writes_${++stores}`;
  const s = createPersistenceStore<Prefs>({
    collection,
    syncIntervalMs: 1_000,
    whenHeld: (d: Prefs) => ({ prefs: d.prefs }),
  });
  return { s, collection };
}
const docOf = (userId: string, collection: string) =>
  [...docs].find(([p]) => p.includes(userId) && p.includes(`/${collection}/`))?.[1];
const writesTo = (userId: string, collection: string) =>
  written.filter((w) => w.path.includes(userId) && w.path.includes(`/${collection}/`));

beforeAll(async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'Date'],
  });
  const warm = createPersistenceStore<{ x: number }>({ collection: 'warm', syncIntervalMs: 1_000 });
  warm.set('warm-up', { x: 1 }); // the layer's first Firestore init, before any race
  await tick(1_000);
  initMonetizationPersistence();
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  written.length = 0;
  hooks.clear();
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('payments from a held caller: the record, never their words', () => {
  const record = (status: 'detected' | 'contributed') => ({
    id: `v-${++n}`,
    type: 'career_win_from_what_they_said',
    estimatedValueCents: 5000,
    contributionCents: status === 'contributed' ? 500 : undefined,
    status,
    createdAt: new Date().toISOString(),
  });

  it('value capture, checked at write time: a detected value is never stored', async () => {
    const userId = caller();
    await saveValueEvent(userId, record('detected'));
    await tick(3_000);
    expect(writesTo(userId, 'monetization_value_capture')).toEqual([]);
  });

  it('value capture: a contribution is stored without what it was for', async () => {
    const userId = caller();
    await saveValueEvent(userId, record('contributed'));
    await tick(3_000);
    const text = JSON.stringify(writesTo(userId, 'monetization_value_capture'));
    expect(text).toContain('"contributionCents":500');
    expect(text).not.toContain('career_win');
    expect(text).not.toContain('estimatedValueCents');
  });

  it.each([
    [false, false],
    [true, true],
  ])('tips: owner %s, the note they typed stored = %s', async (owner, kept) => {
    const userId = caller(owner);
    await saveTip(userId, {
      id: `t-${++n}`,
      amountCents: 300,
      message: 'for helping with my homework',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    await tick(3_000);
    const text = JSON.stringify(writesTo(userId, 'monetization_tips'));
    expect(text).toContain('"amountCents":300');
    expect(text.includes('my homework')).toBe(kept);
  });
});

describe('decided at capture: a record made while held stays redacted after the hold lapses', () => {
  const lapse = async (userId: string) => {
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000); // past the 6 h hold
    expect(userHeld(userId)).toBe(false);
    written.length = 0;
  };

  it('a tip: completed after the hold, still stored without the note', async () => {
    const userId = caller();
    const tip = await tipJar.create({ userId, amountCents: 500, message: 'for my homework' });
    await lapse(userId);
    await tipJar.complete(tip.id, 'pi_paid');
    await tick(3_000);
    const text = JSON.stringify(writesTo(userId, 'monetization_tips'));
    expect(text).toContain('pi_paid');
    expect(text).toContain('"held":true');
    expect(text).not.toContain('homework');
  });

  it('persistence honours the flag: a held record saved later never gets its note back', async () => {
    const userId = caller();
    await lapse(userId);
    const tip = { id: 't-flag', amountCents: 500, status: 'pending' as const, held: true };
    await saveTip(userId, {
      ...tip,
      message: 'restored note',
      createdAt: new Date().toISOString(),
    });
    await tick(3_000);
    expect(JSON.stringify(writesTo(userId, 'monetization_tips'))).not.toContain('restored note');
  });

  it('a value event: contributed after the hold, stored without its type or estimate', async () => {
    vi.stubEnv('PAYWALL', 'on');
    const userId = caller();
    const event = await valueCapture.detect({
      userId,
      message: 'I negotiated $9000 more at my summer job',
      conversationId: 'c1',
    });
    expect(event?.held).toBe(true);
    await lapse(userId);
    await valueCapture.recordContribution({ eventId: event!.id, amountCents: 200 });
    await tick(3_000);
    const text = JSON.stringify(writesTo(userId, 'monetization_value_capture'));
    expect(text).toContain('"contributionCents":200');
    expect(text).not.toContain('negotiat');
    expect(text).not.toContain('estimatedValueCents');
  });
});

describe('held fields: never resurrected, never stale, written at shutdown', () => {
  it('a delete during a held write that succeeds: the document ends deleted', async () => {
    const { s, collection } = prefsStore();
    const userId = caller();
    s.set(userId, { prefs: { optOut: 'texts' }, story: 'their school' });
    let deleting: Promise<void> | undefined;
    hooks.set(`/${collection}/`, {
      fail: 0,
      failed: 0,
      during: () => void (deleting = s.delete(userId)),
    });
    await tick(1_000);
    await deleting;
    expect(writesTo(userId, collection).length).toBe(1); // the write landed...
    expect(docOf(userId, collection)).toBeUndefined(); // ...and the delete came after it
  });

  it('one flush at a time: a flush during a write waits for it, and the newer opt-out wins', async () => {
    const { s, collection } = prefsStore();
    const userId = caller();
    s.set(userId, { prefs: { optOut: 'old' }, story: 'x' });
    flight.max = 0;
    let flushed: Promise<void> | undefined;
    // While the old part's write is in flight (it will fail), a newer opt-out is kept and flushed
    hooks.set(`/${collection}/`, {
      fail: 1,
      failed: 0,
      during: () => {
        s.set(userId, { prefs: { optOut: 'new' }, story: 'y' });
        flushed = s.flush(); // not awaited: it waits for the running flush
      },
    });
    await tick(1_000);
    await flushed;
    for (let i = 0; i < 30; i++) await tick(1_000); // past any backoff
    expect(flight.max).toBe(1); // never two writes for the store at once
    expect(docOf(userId, collection)?.prefs).toEqual({ optOut: 'new' });
  });

  it('case B: the older fails while the newer waits behind it; the older retries; newer wins', async () => {
    const parts = heldFields<Prefs>((d: Prefs) => ({ prefs: d.prefs }), 1_000);
    const sets: string[] = [];
    let failOld!: (e: Error) => void;
    const dirty = new Set<string>();
    parts.keep('u', { prefs: { optOut: 'old' }, story: 'x' });
    const first = parts.write((_u, p) => {
      sets.push(JSON.stringify(p));
      return new Promise((_, reject) => {
        failOld = reject;
      });
    }, dirty);
    await Promise.resolve();
    parts.keep('u', { prefs: { optOut: 'new' }, story: 'y' });
    await parts.write(async (_u, p) => void sets.push(JSON.stringify(p)), dirty); // waits: in flight
    expect(sets).toHaveLength(1);
    failOld(new Error('unavailable')); // the older fails; the newer was kept meanwhile
    await first;
    await parts.write(async (_u, p) => void sets.push(JSON.stringify(p)), dirty, true); // retry
    expect(sets.slice(1)).toEqual(['{"prefs":{"optOut":"new"}}']); // nothing older after it
  });

  it('a compensating delete that fails is retried on the next flush: the doc ends deleted', async () => {
    const { s, collection } = prefsStore();
    const userId = caller();
    s.set(userId, { prefs: { optOut: 'texts' }, story: 'x' });
    let release!: () => void;
    hooks.set(`/${collection}/`, {
      fail: 0,
      failed: 0,
      hang: new Promise((r) => {
        release = r;
      }),
    });
    await tick(1_000); // the write starts, and hangs
    const deleting = s.delete(userId);
    await vi.advanceTimersByTimeAsync(10_100);
    await deleting; // the delete gave up waiting and ran
    failDeletes.set(`/${collection}/`, 1); // the first compensating delete fails
    release(); // the hung write lands after the delete
    await tick(0);
    expect(docOf(userId, collection)).toBeDefined(); // resurrected, for now
    await tick(1_000); // the next flush retries the compensating delete
    expect(docOf(userId, collection)).toBeUndefined();
  });

  it('a new opt-out kept while a compensating delete is pending is written after it: only it remains', async () => {
    const { s, collection } = prefsStore();
    const userId = caller();
    s.set(userId, { prefs: { optOut: 'old' }, story: 'x' });
    let release!: () => void;
    hooks.set(`/${collection}/`, {
      fail: 0,
      failed: 0,
      hang: new Promise((r) => {
        release = r;
      }),
    });
    await tick(1_000); // the old write starts, and hangs
    const deleting = s.delete(userId);
    await vi.advanceTimersByTimeAsync(10_100);
    await deleting;
    failDeletes.set(`/${collection}/`, 2); // the compensating delete and its first retry fail
    release(); // the old write lands after the delete
    await tick(0);
    s.set(userId, { prefs: { optOut: 'new' }, story: 'y' }); // a new opt-out is kept
    await tick(1_000); // the retry fails again: the new opt-out waits behind it
    await tick(1_000); // the delete lands, then the new opt-out is written
    expect(docOf(userId, collection)?.prefs).toEqual({ optOut: 'new' });
    expect(JSON.stringify(docOf(userId, collection))).not.toContain('old');
  });

  /** A held write that hangs, then the user's delete (it stops waiting after 10 s). */
  async function lateWriteAfterDelete(failingDeletes: number) {
    const { s, collection } = prefsStore();
    const userId = caller();
    s.set(userId, { prefs: { optOut: 'old' }, story: 'x' });
    let release!: () => void;
    hooks.set(`/${collection}/`, {
      fail: 0,
      failed: 0,
      hang: new Promise((r) => {
        release = r;
      }),
    });
    await tick(1_000); // the old write starts, and hangs
    const deleting = s.delete(userId);
    await vi.advanceTimersByTimeAsync(10_100);
    await deleting;
    failDeletes.set(`/${collection}/`, failingDeletes);
    events.length = 0;
    release(); // the old write lands after the delete
    await tick(0);
    return { s, collection, userId };
  }

  it('verifier sequence: set old, remove FAIL, remove FAIL, set recreated: the recreated user stays', async () => {
    const { s, collection, userId } = await lateWriteAfterDelete(2);
    await tick(1_000); // the retry fails again
    s.set(userId, { prefs: { optOut: 'recreated' }, story: 'y' }); // the user is recreated
    await tick(1_000);
    await tick(1_000);
    expect(events).toEqual([
      'set {"optOut":"old"}',
      'remove FAIL',
      'remove FAIL',
      'delete prefs', // only the stale write's fields, deleted per field
      'set {"optOut":"recreated"}',
    ]);
    expect(docOf(userId, collection)?.prefs).toEqual({ optOut: 'recreated' });
  });

  it('a pending compensating delete survives clearCache and runs on the next flush', async () => {
    const { s, collection, userId } = await lateWriteAfterDelete(1);
    expect(docOf(userId, collection)).toBeDefined(); // resurrected, for now
    s.clearCache(userId);
    await tick(1_000);
    expect(docOf(userId, collection)).toBeUndefined();
  });

  it('a hung held write holds up neither the sync nor shutdown past 10 s', async () => {
    const { s, collection } = prefsStore();
    const stuck = caller();
    const other = caller();
    s.set(stuck, { prefs: { optOut: 'calls' }, story: 'x' });
    hooks.set(`/${collection}/`, { fail: 0, failed: 0, hang: new Promise<void>(() => {}) }); // never settles
    await tick(1_000); // the stuck user's write starts, and never settles
    s.set(other, { prefs: { optOut: 'texts' }, story: 'y' });
    await vi.advanceTimersByTimeAsync(12_000);
    await tick(1_000);
    expect(docOf(other, collection)?.prefs).toEqual({ optOut: 'texts' }); // the sync went on
    let down = false;
    const shutting = s.shutdown().then(() => void (down = true));
    await vi.advanceTimersByTimeAsync(10_100);
    await shutting;
    expect(down).toBe(true);
  });

  it('shutdown waits at most 10 s even when a running flush has several hung writes', async () => {
    const { s, collection } = prefsStore();
    const [a, b] = [caller(), caller()];
    for (const userId of [a, b]) {
      s.set(userId, { prefs: { optOut: 'calls' }, story: 'x' });
      hooks.set(`${userId}/${collection}/`, {
        fail: 0,
        failed: 0,
        hang: new Promise<void>(() => {}),
      });
    }
    await tick(1_000); // the flush starts: a's write hangs, then b's would (10 s each)
    let down = false;
    const shutting = s.shutdown().then(() => void (down = true));
    await vi.advanceTimersByTimeAsync(10_100);
    expect(down).toBe(true); // not 20 s
    await vi.advanceTimersByTimeAsync(20_000);
    await shutting;
  });

  it('a delete waits at most 10 s for a hung held write; a late landing is deleted again', async () => {
    const { s, collection } = prefsStore();
    const userId = caller();
    s.set(userId, { prefs: { optOut: 'texts' }, story: 'x' });
    let release!: () => void;
    hooks.set(`/${collection}/`, {
      fail: 0,
      failed: 0,
      hang: new Promise((r) => {
        release = r;
      }),
    });
    await tick(1_000); // the write starts, and hangs
    let done = false;
    const deleting = s.delete(userId).then(() => void (done = true));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_100);
    await deleting;
    expect(done).toBe(true);
    release(); // the hung write finally lands, after the delete
    await tick(0);
    expect(writesTo(userId, collection).length).toBe(1);
    expect(docOf(userId, collection)).toBeUndefined(); // deleted again
  });

  it.each(['shutdown', 'flush'] as const)('a part in backoff is written on %s', async (how) => {
    const { s, collection } = prefsStore();
    const userId = caller();
    s.set(userId, { prefs: { optOut: 'calls' }, story: 'x' });
    hooks.set(`/${collection}/`, { fail: 1, failed: 0 });
    await tick(1_000); // fails; the next try is 2 s away
    expect(writesTo(userId, collection)).toEqual([]);
    await s[how]();
    expect(docOf(userId, collection)?.prefs).toEqual({ optOut: 'calls' });
  });
});
