/**
 * MINOR_CARE: a held call's window whose scrub failed never expires before it is scrubbed, and the
 * held-scrub sweep scrubs it for a caller who never calls again.
 *
 * On main a failed scrub was retried only at the user's next session start, while the window doc
 * got expireAt (the TTL) 90 days after the purge and was pruned in code past 90 days or past 50
 * windows. A caller who never called again: the window went, the read filters stopped hiding what
 * the failed scrub left, and the words came back, never deleted.
 *
 * The real held-window, reload-before-save and sweep modules; a store scrub registered the way the
 * purge registers the music one (addHeldScrub). Only Firestore is faked. A "process" is a fresh
 * module registry. Synthetic uids and words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Json = Record<string, unknown>;
const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const failTx = { match: null as RegExp | null };
  const snap = (path: string) => ({
    id: path.split('/').pop()!,
    exists: docs.has(path),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
  });
  const docRef = (path: string): Json => ({
    path,
    collection: (c: string) => coll(`${path}/${c}`),
    get: async () => snap(path),
  });
  type Q = { where?: [string, number]; order?: string; after?: unknown; limit?: number };
  const query = (path: string, q: Q): Json => ({
    where: (f: string, _op: '<=', v: number) => query(path, { ...q, where: [f, v] }),
    orderBy: (f: string) => query(path, { ...q, order: f }),
    startAfter: (a: unknown) => query(path, { ...q, after: a }),
    limit: (n: number) => query(path, { ...q, limit: n }),
    get: async () => {
      const key = (p: string): [number | string, string] => [
        q.order === '__name__' ? '' : (docs.get(p)![q.order!] as number),
        p.split('/').pop()!,
      ];
      let rows = [...docs.keys()].filter(
        (p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')
      );
      if (q.where) {
        const [f, v] = q.where;
        rows = rows.filter(
          (p) => typeof docs.get(p)![f] === 'number' && (docs.get(p)![f] as number) <= v
        );
      }
      const cmp = (a: [number | string, string], b: [number | string, string]) =>
        a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1].localeCompare(b[1]);
      rows.sort((a, b) => cmp(key(a), key(b)));
      if (q.after !== undefined) {
        const at = typeof q.after === 'string' ? (['', q.after] as [string, string]) : q.after;
        const mark = (at as { key?: [number, string] }).key ?? (at as [string, string]);
        rows = rows.filter((p) => cmp(key(p), mark) > 0);
      }
      return { docs: rows.slice(0, q.limit).map((p) => ({ ...snap(p), key: key(p) })) };
    },
  });
  const coll = (path: string): Json => ({
    ...query(path, {}),
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  const set = (path: string, data: Json, merge?: boolean) =>
    void docs.set(path, structuredClone({ ...(merge ? docs.get(path) : {}), ...data }));
  const db = {
    collection: (c: string) => coll(c),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (ref: { path: string }) => {
          if (failTx.match?.test(ref.path)) throw new Error('14 UNAVAILABLE: fake outage');
          return snap(ref.path);
        },
        set: (ref: { path: string }, d: Json, o?: { merge?: boolean }) =>
          void writes.push(() => set(ref.path, d, o?.merge)),
      };
      const out = await fn(tx);
      for (const w of writes) w();
      return out;
    },
  };
  return { docs, failTx, db };
});
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fs.db }));

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-26T12:00:00Z');
let n = 0;
const uid = (tag: string) => `HsSw${tag}${String(++n).padStart(3, '0')}kQ4vX8pLm2RtZ`;
const storePath = (u: string) => `bogle_users/${u}/test_store/doc`;
const hold = (u: string) => fs.docs.get(`minor_care_holds/${u}`);
type Entry = { at: number; text: string };

/** A fresh process: the real modules, plus one store scrub registered as the purge registers its. */
async function proc() {
  vi.resetModules();
  const hw = await import('../held-window.js');
  const rbs = await import('../reload-before-save.js');
  const scrub = vi.fn((u: string) =>
    hw.scrubHeldDoc(u, 'test_store', 'doc', (id, d: { entries: Entry[] }) => {
      const kept = hw.withoutHeld(id, d.entries, (e) => e.at);
      return kept === d.entries ? null : { entries: kept };
    })
  );
  rbs.addHeldScrub(scrub);
  // imported on use, so the expiry tests run against a tree without the sweep
  const sweep = {
    sweepHeldScrubs: async (o?: object) =>
      (await import('../held-scrub-sweep.js')).sweepHeldScrubs(o),
  };
  return { hw, rbs, sweep, scrub };
}

/** A held call from `start` to `end` whose purge scrub failed: the caller's words still stored. */
async function failedPurge(u: string, start: number, end: number) {
  fs.docs.set(storePath(u), {
    entries: [
      { at: start - DAY, text: 'OLD adult line' },
      { at: start + 1000, text: 'HELD synthetic minor line' },
    ],
  });
  const p = await proc();
  vi.setSystemTime(end);
  p.hw.noteHeldWindow(u, start, end);
  fs.failTx.match = new RegExp(`^${storePath(u)}$`);
  await p.rbs.storeAndScrubHeldWindow(u, [start, end]);
  fs.failTx.match = null;
  expect(JSON.stringify(fs.docs.get(storePath(u))), 'precondition: scrub failed').toContain('HELD');
  expect(hold(u)?.windows).toEqual([{ start, end, scrubbed: false }]);
}

beforeEach(() => fs.docs.clear());
afterEach(() => {
  fs.failTx.match = null;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const clock = () => vi.useFakeTimers({ toFake: ['Date'], now: NOW });

describe('MINOR_CARE: an unscrubbed held window never expires', () => {
  it('gets no expireAt while unscrubbed, and is kept past 90 days (91+ days old)', async () => {
    clock();
    const u = uid('E');
    const end = NOW - 91 * DAY;
    await failedPurge(u, end - HOUR, end);
    expect(hold(u)?.expireAt, 'no TTL while unscrubbed').toBeNull();
    expect(hold(u)?.keepUntil).toBeNull();
    expect(hold(u)?.unscrubbedSince).toBe(end);
    vi.setSystemTime(NOW);
    const p = await proc();
    await p.hw.storeHeldWindow(u, [NOW - HOUR, NOW]); // a later held call: a write prunes
    const list = hold(u)?.windows as Array<{ end: number; scrubbed: boolean }>;
    expect(list.map((w) => [w.end, w.scrubbed])).toEqual([
      [end, false],
      [NOW, false],
    ]);
    expect(hold(u)?.expireAt).toBeNull();
    vi.stubEnv('MINOR_CARE', 'on');
    expect(await p.hw.loadHeldWindows(u)).toEqual({ unscrubbed: true }); // a read keeps it too
    expect(p.hw.recordedWhileHeld(u, end - HOUR + 1000)).toBe(true);
  });

  it('the 50-window cap drops the oldest scrubbed windows, never an unscrubbed one', async () => {
    clock();
    const u = uid('C');
    const old = { start: NOW - 10 * DAY - HOUR, end: NOW - 10 * DAY, scrubbed: false };
    const scrubbed = Array.from({ length: 50 }, (_, i) => ({
      start: NOW - 9 * DAY + i * HOUR,
      end: NOW - 9 * DAY + i * HOUR + 60_000,
      scrubbed: true,
    }));
    fs.docs.set(`minor_care_holds/${u}`, { windows: [old, ...scrubbed] });
    const p = await proc();
    await p.hw.storeHeldWindow(u, [NOW - HOUR, NOW]);
    const list = hold(u)?.windows as Array<{ end: number; scrubbed: boolean }>;
    expect(list).toHaveLength(50);
    expect(list[0]).toEqual(old);
    expect(list.filter((w) => w.scrubbed)).toHaveLength(48);
  });
});

describe('the held-scrub sweep', () => {
  it('scrubs a failed window for a caller who never calls again, marks it, and only then sets expireAt', async () => {
    clock();
    const u = uid('S');
    const end = NOW - 2 * DAY;
    await failedPurge(u, end - HOUR, end);
    vi.setSystemTime(NOW);
    const p = await proc(); // another process: it never saw the purge
    const report = await p.sweep.sweepHeldScrubs();
    expect(report).toMatchObject({ read: 1, retried: 1, scrubbed: 1, failed: 0 });
    const store = JSON.stringify(fs.docs.get(storePath(u)));
    expect(store).not.toContain('HELD');
    expect(store).toContain('OLD adult line');
    expect(hold(u)?.windows).toEqual([{ start: end - HOUR, end, scrubbed: true }]);
    expect(hold(u)?.keepUntil).toBe(end + 90 * DAY);
    expect((hold(u)?.expireAt as Date).getTime()).toBe(end + 90 * DAY);
    expect(hold(u)?.unscrubbedSince).toBeNull();
    expect((await p.sweep.sweepHeldScrubs()).read, 'not found again').toBe(0);
  });

  it('leaves an already-scrubbed window alone', async () => {
    clock();
    const u = uid('A');
    const w = { start: NOW - 3 * DAY, end: NOW - 3 * DAY + HOUR, scrubbed: true };
    const doc = { windows: [w], keepUntil: w.end + 90 * DAY, expireAt: new Date(w.end + 90 * DAY) };
    fs.docs.set(`minor_care_holds/${u}`, structuredClone(doc));
    fs.docs.set(storePath(u), { entries: [{ at: w.start + 1, text: 'left as is' }] });
    const p = await proc();
    expect(await p.sweep.sweepHeldScrubs()).toMatchObject({ read: 0, retried: 0 });
    expect(await p.sweep.sweepHeldScrubs({ scanAll: true })).toMatchObject({ retried: 0 });
    expect(p.scrub).not.toHaveBeenCalled();
    expect(hold(u)).toEqual(doc);
    expect(JSON.stringify(fs.docs.get(storePath(u)))).toContain('left as is');
  });

  it('a retry that fails again leaves the window unscrubbed and non-expiring, a pre-sweep doc too', async () => {
    clock();
    const u = uid('F');
    const end = NOW - 2 * DAY;
    await failedPurge(u, end - HOUR, end);
    // written before this change: a TTL date and no unscrubbedSince, so only scan=all finds it
    const legacy: Record<string, unknown> = {
      ...hold(u),
      keepUntil: end + 90 * DAY,
      expireAt: new Date(end + 90 * DAY),
    };
    delete legacy.unscrubbedSince;
    fs.docs.set(`minor_care_holds/${u}`, legacy);
    vi.setSystemTime(NOW);
    const p = await proc();
    expect((await p.sweep.sweepHeldScrubs()).read, 'the index query misses it').toBe(0);
    fs.failTx.match = new RegExp(`^${storePath(u)}$`);
    const report = await p.sweep.sweepHeldScrubs({ scanAll: true });
    expect(report).toMatchObject({ retried: 1, scrubbed: 0, failed: 1 });
    expect(hold(u)?.windows).toEqual([{ start: end - HOUR, end, scrubbed: false }]);
    expect(hold(u)?.expireAt, 'its TTL date is gone').toBeNull();
    expect(hold(u)?.unscrubbedSince).toBe(end);
    expect(JSON.stringify(fs.docs.get(storePath(u)))).toContain('HELD');
    fs.failTx.match = null;
    expect(await p.sweep.sweepHeldScrubs()).toMatchObject({ retried: 1, scrubbed: 1 }); // next run
    expect(JSON.stringify(fs.docs.get(storePath(u)))).not.toContain('HELD');
  });

  it('a window younger than an hour is left to its purge', async () => {
    clock();
    const u = uid('Y');
    await failedPurge(u, NOW - 2 * HOUR, NOW - 30 * 60_000);
    vi.setSystemTime(NOW);
    const p = await proc();
    expect(await p.sweep.sweepHeldScrubs({ scanAll: true })).toMatchObject({ retried: 0 });
    expect(p.scrub).not.toHaveBeenCalled();
  });

  it('adults (no hold doc) are untouched', async () => {
    clock();
    const u = uid('D');
    fs.docs.set(storePath(u), { entries: [{ at: NOW - DAY, text: 'adult synthetic line' }] });
    fs.docs.set('minor_care_holds/phoneHashOnly', { heldUntil: NOW - DAY, v: 1 }); // no windows
    const before = JSON.stringify([...fs.docs]);
    const p = await proc();
    await p.sweep.sweepHeldScrubs();
    const scan = await p.sweep.sweepHeldScrubs({ scanAll: true });
    expect(scan.retried).toBe(0);
    expect(p.scrub).not.toHaveBeenCalled();
    expect(JSON.stringify([...fs.docs])).toBe(before);
    expect(fs.docs.has(`minor_care_holds/${u}`)).toBe(false);
  });

  it('is bounded: max docs a run, in pages, and scan=all answers where to go on', async () => {
    clock();
    for (let i = 0; i < 5; i++) await failedPurge(uid('B'), NOW - 3 * DAY, NOW - 3 * DAY + HOUR);
    vi.setSystemTime(NOW);
    const p = await proc();
    const first = await p.sweep.sweepHeldScrubs({ scanAll: true, page: 2, max: 3 });
    expect(first.read).toBe(3);
    expect(first.next).toBeDefined();
    const rest = await p.sweep.sweepHeldScrubs({ scanAll: true, after: first.next, page: 2 });
    expect([first.scrubbed, rest.read, rest.scrubbed, rest.next]).toEqual([3, 2, 2, undefined]);
    expect((await p.sweep.sweepHeldScrubs()).read).toBe(0);
  });
});
