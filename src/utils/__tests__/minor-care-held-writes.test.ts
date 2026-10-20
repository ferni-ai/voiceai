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
const hooks = vi.hoisted(
  () => new Map<string, { fail: number; failed: number; during?: () => unknown }>()
);

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
          const during = hook?.during;
          const fails = !!hook && hook.fail > 0; // decided at the start: this write's outcome
          if (hook) Object.assign(hook, { during: undefined, fail: hook.fail - +fails });
          if (fails) hook.failed++;
          await during?.();
          for (let i = 0; i < 20; i++) await Promise.resolve(); // still in flight a while
          if (fails) throw new Error('unavailable');
          written.push({ path, data });
          docs.set(path, { ...docs.get(path), ...data });
        },
        delete: async () => void docs.delete(path),
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
import {
  initMonetizationPersistence,
  saveTip,
  saveValueEvent,
} from '../../services/monetization/persistence.js';
import { heldAfter, resetMinorCare, setVerifiedOwnerCheck } from '../minor-care.js';

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

  it('an older failed part never overwrites a newer one written meanwhile', async () => {
    const { s, collection } = prefsStore();
    const userId = caller();
    s.set(userId, { prefs: { optOut: 'old' }, story: 'x' });
    // While the old part's write is in flight (it will fail), a newer opt-out is kept and flushed
    hooks.set(`/${collection}/`, {
      fail: 1,
      failed: 0,
      during: async () => {
        s.set(userId, { prefs: { optOut: 'new' }, story: 'y' });
        await s.flush();
      },
    });
    await tick(1_000);
    for (let i = 0; i < 30; i++) await tick(1_000); // past any backoff
    expect(hooks.get(`/${collection}/`)?.failed).toBe(1);
    expect(docOf(userId, collection)?.prefs).toEqual({ optOut: 'new' });
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
