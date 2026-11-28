/**
 * Concurrent team-insight writes from one process don't abort each other
 * (TEAM_INSIGHT_WRITE_QUEUE, #4420).
 *
 * The fake commits optimistically, as a Firestore transaction does: a commit
 * whose read document changed after the read is ABORTED (code 10). It doesn't
 * retry, so an aborted write is a lost write here, and the count of aborted
 * commits is what prod logs as FIRESTORE_ERROR ABORTED.
 */
import type { Firestore } from '@google-cloud/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeStoredInsights, insightChanges } from '../insight-store.js';
import type { CrossPersonaInsight } from '../cross-persona-insights.js';

const USER = 'user_sam_test';
const DOC = `bogle_users/${USER}/team_insights/data`;

interface Ref {
  path: string;
}
interface Snap {
  exists: boolean;
  data: () => unknown;
}

/** Lets other transactions run between this one's read and its commit. */
const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

function contendedDb() {
  const docs = new Map<string, { data: unknown; version: number }>([
    [`bogle_users/${USER}`, { data: { displayName: 'Sam' }, version: 1 }],
  ]);
  const stats = { aborted: 0, committed: 0 };
  const ref = (path: string) => ({
    path,
    collection: (c: string) => ({ doc: (d: string) => ref(`${path}/${c}/${d}`) }),
  });
  const db = {
    collection: (c: string) => ({ doc: (d: string) => ref(`${c}/${d}`) }),
    runTransaction: async <T>(fn: (tx: object) => Promise<T>): Promise<T> => {
      const readAt = new Map<string, number>();
      const writes: Array<[string, unknown]> = [];
      const result = await fn({
        get: async (r: Ref): Promise<Snap> => {
          const entry = docs.get(r.path);
          readAt.set(r.path, entry?.version ?? 0);
          await tick();
          return { exists: entry !== undefined, data: () => entry?.data };
        },
        set: (r: Ref, data: unknown) => void writes.push([r.path, data]),
      });
      await tick();
      for (const [path, version] of readAt) {
        if ((docs.get(path)?.version ?? 0) !== version) {
          stats.aborted += 1;
          throw Object.assign(new Error('transaction aborted'), { code: 10 });
        }
      }
      for (const [path, data] of writes) {
        docs.set(path, { data, version: (docs.get(path)?.version ?? 0) + 1 });
      }
      stats.committed += 1;
      return result;
    },
  };
  const storedIds = (): string[] =>
    ((docs.get(DOC)?.data as { insights?: CrossPersonaInsight[] })?.insights ?? []).map(
      (i) => i.id
    );
  return { db: db as unknown as Firestore, stats, storedIds };
}

/** Distinct categories and an old createdAt, so no note is a recent duplicate of another. */
const note = (n: number): CrossPersonaInsight => ({
  id: `insight_${n}`,
  source: 'peter',
  target: 'maya',
  priority: 'low',
  content: `Note ${n} about the weekly budget`,
  category: `category-${n}`,
  createdAt: Date.now() - 2 * 60 * 60 * 1000,
  expiresAt: Date.now() + 60 * 60 * 1000,
  proactive: false,
  oneTime: false,
});

const add = (db: Firestore, n: number): Promise<void> =>
  changeStoredInsights(db, USER, insightChanges.add(note(n)));

afterEach(() => vi.unstubAllEnvs());

describe('team insight writes from one process (TEAM_INSIGHT_WRITE_QUEUE)', () => {
  it('on: two concurrent writes both land and neither commit aborts', async () => {
    vi.stubEnv('TEAM_INSIGHT_WRITE_QUEUE', 'on');
    const { db, stats, storedIds } = contendedDb();

    await Promise.all([add(db, 1), add(db, 2)]);

    expect(storedIds()).toEqual(['insight_1', 'insight_2']);
    expect(stats).toEqual({ aborted: 0, committed: 2 });
  });

  it("on: a scan's burst of adds all land, with no aborted commit", async () => {
    vi.stubEnv('TEAM_INSIGHT_WRITE_QUEUE', 'on');
    const { db, stats, storedIds } = contendedDb();

    await Promise.all([1, 2, 3, 4, 5, 6].map((n) => add(db, n)));

    expect(storedIds()).toHaveLength(6);
    expect(stats.aborted).toBe(0);
  });

  it('off (main): the same two concurrent writes abort one, and its note is lost', async () => {
    const { db, stats, storedIds } = contendedDb();

    const results = await Promise.allSettled([add(db, 1), add(db, 2)]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(stats.aborted).toBe(1);
    expect(storedIds()).toHaveLength(1);
  });

  it('on: a write that fails does not stop the next write for that user', async () => {
    vi.stubEnv('TEAM_INSIGHT_WRITE_QUEUE', 'on');
    const { db, storedIds } = contendedDb();
    const broken = (): CrossPersonaInsight[] => {
      throw new Error('change failed');
    };

    const results = await Promise.allSettled([changeStoredInsights(db, USER, broken), add(db, 7)]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
    expect(storedIds()).toEqual(['insight_7']);
  });
});
