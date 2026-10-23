/**
 * FORGET_EVERY_READER off is main, read for read: the call-start recall
 * snapshot (loadRecallSnapshot over the real Firestore store) makes exactly
 * main's Firestore calls, never the extra dynamic_entities read for the
 * caller's names, so a slow or hung names read can't slow or hang it. On,
 * that read is never waited on past CALLER_NAMES_HANG_MS: then no names,
 * which only ever hides more (#2644 round 1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ calls: [] as string[], entitiesHang: false }));

vi.mock('../../../utils/firestore-utils.js', async (original) => {
  const real = await original<typeof import('../../../utils/firestore-utils.js')>();
  const docs = (path: string) =>
    path.endsWith('dynamic_entities')
      ? [{ data: () => ({ name: 'Biscuit', type: 'pet' }) }]
      : [
          {
            data: () => ({
              entityName: 'user',
              key: 'hobby',
              value: 'tomatoes',
              extractedAt: '2026-10-01',
            }),
          },
        ];
  const query = (path: string, ops: string[]): Record<string, unknown> => ({
    collection: (name: string) => query(`${path}/${name}`, ops),
    doc: (id: string) => query(`${path}/${id}`, ops),
    where: (...a: unknown[]) => query(path, [...ops, `where(${a.join(',')})`]),
    orderBy: (...a: unknown[]) => query(path, [...ops, `orderBy(${a.join(',')})`]),
    limit: (n: number) => query(path, [...ops, `limit(${n})`]),
    get: () => {
      fs.calls.push([path, ...ops, 'get'].join(' '));
      if (fs.entitiesHang && path.endsWith('dynamic_entities')) return new Promise(() => undefined);
      return Promise.resolve({ docs: docs(path), empty: false, exists: true, data: () => ({}) });
    },
  });
  return { ...real, getFirestoreDb: () => query('', []) };
});

const { firestoreRecallStore } = await import('../recall-firestore-store.js');
const { loadRecallSnapshot } = await import('../../../memory/recall/session-recall.js');
const { resetForgetTopicsSource, knownNames } =
  await import('../../../memory/recall/forget-topics-source.js');

const USER = 'member-recall-store';
/** What main's store reads for one snapshot (recall-firestore-store.ts and forget.ts on main). */
const MAIN_READS = [
  '/bogle_users/member-recall-store/dynamic_facts orderBy(extractedAt,desc) limit(300) get',
  '/bogle_users/member-recall-store/summaries orderBy(timestamp,desc) limit(5) get',
  '/bogle_users/member-recall-store/memory_state/forgotten get',
];

beforeEach(() => {
  fs.calls = [];
  fs.entitiesHang = false;
  resetForgetTopicsSource();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});


describe('the recall snapshot with FORGET_EVERY_READER off', () => {
  it("makes exactly main's reads: no names read", async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    await loadRecallSnapshot(firestoreRecallStore, USER);
    expect([...fs.calls].sort()).toEqual([...MAIN_READS].sort());
  });

  it('a hung names read cannot hang it', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    fs.entitiesHang = true;
    const snapshot = await loadRecallSnapshot(firestoreRecallStore, USER);
    expect(snapshot.facts.length).toBeGreaterThan(0);
  });
});

describe('the recall snapshot with FORGET_EVERY_READER on', () => {
  it('learns the caller names beside the facts', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    await firestoreRecallStore.facts(USER);
    expect(fs.calls.some((c) => c.includes('dynamic_entities'))).toBe(true);
    expect([...knownNames(USER)]).toEqual(['biscuit']);
  });

  it('a hung names read gives up after CALLER_NAMES_HANG_MS: facts come back, no names', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    vi.useFakeTimers();
    fs.entitiesHang = true;
    const { CALLER_NAMES_HANG_MS } = await import('../../../memory/recall/forget-every-reader.js');
    const facts = firestoreRecallStore.facts(USER);
    await vi.advanceTimersByTimeAsync(CALLER_NAMES_HANG_MS + 10);
    expect((await facts).length).toBe(1);
    expect([...knownNames(USER)]).toEqual([]);
  });
});
