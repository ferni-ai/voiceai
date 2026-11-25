import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it, vi } from 'vitest';
import { firestoreSourceCloser, type ClosedItem } from '../source-closer.js';
import { sourceCloserOf } from '../../follow-through/close-source.js';
import { fakeFirestore } from './fake-firestore.js';
import type { CloseOutcome } from '../../superhuman/commitment-store.js';

// Closes travel from a follow-up to its item (plan 2026-11-16, Task 2). Fictional rows only.
const NOW = new Date('2026-11-24T15:00:00.000Z');
const UID = 'owner-1';
const USER = `bogle_users/${UID}`;
const task = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `task ${id}`,
  status: 'pending',
  isRecurring: false,
  updatedAt: '2026-11-20T10:00:00.000Z',
  ...over,
});

function seeded(tasks: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  const fake = fakeFirestore();
  fake.docs.set(USER, { name: 'Sam Rivers', productivityData: { tasks, bills: [] }, ...extra });
  return fake;
}
const tasksOf = (docs: Map<string, Record<string, unknown>>) =>
  (docs.get(USER)?.productivityData as { tasks: Array<Record<string, unknown>> }).tasks;

function closer(
  db: Firestore,
  closeCommitment = vi.fn(async (): Promise<CloseOutcome> => 'closed')
) {
  const heard: ClosedItem[] = [];
  const c = firestoreSourceCloser({ closed: (i) => heard.push(i), closeCommitment }, db)!;
  return { c, heard, closeCommitment };
}

describe('tasks: one task closes in a transaction', () => {
  it('done completes only that task, and the rest of the doc is left as it was', async () => {
    const { db, docs } = seeded([task('t1'), task('t2')]);
    const { c, heard } = closer(db);
    expect(await c.close(UID, { store: 'tasks', ref: 't1' }, 'done', NOW)).toBe(true);
    expect(tasksOf(docs)).toEqual([
      task('t1', {
        status: 'completed',
        completedAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }),
      task('t2'),
    ]);
    expect(docs.get(USER)).toMatchObject({ name: 'Sam Rivers', productivityData: { bills: [] } });
    expect(heard).toEqual([
      { userId: UID, store: 'tasks', ref: 't1', status: 'completed', at: NOW },
    ]);
  });

  it('release cancels it, with no completedAt', async () => {
    const { db, docs } = seeded([task('t1', { status: 'in_progress' })]);
    const { c } = closer(db);
    expect(await c.close(UID, { store: 'tasks', ref: 't1' }, 'release', NOW)).toBe(true);
    expect(tasksOf(docs)[0]).toEqual(
      task('t1', { status: 'cancelled', updatedAt: NOW.toISOString() })
    );
  });

  it('a numeric task id matches its string ref', async () => {
    const { db, docs } = seeded([task('x'), { ...task('x'), id: 7 }]);
    const { c } = closer(db);
    expect(await c.close(UID, { store: 'tasks', ref: '7' }, 'done', NOW)).toBe(true);
    expect(tasksOf(docs).map((t) => t.status)).toEqual(['pending', 'completed']);
  });

  it('stale write race: another task changed after the close read is kept, not overwritten', async () => {
    const fake = seeded([task('t1'), task('t2')]);
    let raced = false;
    // The web app renames t2 after the closer read the list and before its write commits
    type Tx = { update: (ref: unknown, fields: Record<string, unknown>) => void };
    const db = {
      collection: (n: string) => fake.db.collection(n),
      runTransaction: <T>(fn: (tx: unknown) => Promise<T>) =>
        fake.db.runTransaction((tx) =>
          fn({
            ...(tx as object),
            update: (ref: unknown, fields: Record<string, unknown>) => {
              if (!raced) {
                raced = true;
                const now = fake.docs.get(USER)!;
                const pd = now.productivityData as { tasks: Array<Record<string, unknown>> };
                fake.docs.set(USER, {
                  ...now,
                  productivityData: {
                    ...pd,
                    tasks: [pd.tasks[0], { ...pd.tasks[1], title: 'renamed in the app' }],
                  },
                });
              }
              (tx as Tx).update(ref, fields);
            },
          })
        ),
    } as unknown as Firestore;
    const { c } = closer(db);
    expect(await c.close(UID, { store: 'tasks', ref: 't1' }, 'done', NOW)).toBe(true);
    expect(raced).toBe(true);
    expect(tasksOf(fake.docs).map((t) => [t.id, t.status, t.title])).toEqual([
      ['t1', 'completed', 'task t1'],
      ['t2', 'pending', 'renamed in the app'],
    ]);
  });

  it.each([
    ['already completed', [task('t1', { status: 'completed' })]],
    ['already cancelled', [task('t1', { status: 'cancelled' })]],
    ['gone from the list', [task('t2')]],
    ['recurring (the task tool makes its next one)', [task('t1', { isRecurring: true })]],
  ])('a task %s closes nothing and writes nothing', async (_why, tasks) => {
    const { db, docs, stats } = seeded(tasks);
    const before = structuredClone(docs.get(USER));
    const { c, heard } = closer(db);
    expect(await c.close(UID, { store: 'tasks', ref: 't1' }, 'done', NOW)).toBe(false);
    expect(stats.writes).toBe(0);
    expect(docs.get(USER)).toEqual(before);
    expect(heard).toEqual([]);
  });

  it('a user with no task list closes nothing', async () => {
    const fake = fakeFirestore();
    const { c } = closer(fake.db);
    expect(await c.close(UID, { store: 'tasks', ref: 't1' }, 'done', NOW)).toBe(false);
    expect(fake.stats.writes).toBe(0);
  });
});

describe('reminders: a real done, and only a pending one moves', () => {
  const path = `${USER}/reminders/r1`;
  const withReminder = (status: string) => {
    const fake = fakeFirestore();
    fake.docs.set(path, { status, message: 'call the vet', scheduledFor: NOW.toISOString() });
    return fake;
  };

  it('done marks it completed, so the scheduler never sends it; release cancels it', async () => {
    const done = withReminder('pending');
    expect(await closer(done.db).c.close(UID, { store: 'reminders', ref: 'r1' }, 'done', NOW)).toBe(
      true
    );
    expect(done.docs.get(path)).toMatchObject({ status: 'completed', message: 'call the vet' });

    const release = withReminder('pending');
    const r = closer(release.db);
    expect(await r.c.close(UID, { store: 'reminders', ref: 'r1' }, 'release', NOW)).toBe(true);
    expect(release.docs.get(path)).toMatchObject({ status: 'cancelled' });
    expect(r.heard).toEqual([
      { userId: UID, store: 'reminders', ref: 'r1', status: 'cancelled', at: NOW },
    ]);
  });

  it.each(['delivered', 'cancelled', 'completed', 'sending'])(
    'a reminder already %s stays as it is',
    async (status) => {
      const fake = withReminder(status);
      const { c, heard } = closer(fake.db);
      expect(await c.close(UID, { store: 'reminders', ref: 'r1' }, 'done', NOW)).toBe(false);
      expect(fake.docs.get(path)).toMatchObject({ status });
      expect(fake.stats.writes).toBe(0);
      expect(heard).toEqual([]);
    }
  );

  it('a missing reminder closes nothing', async () => {
    const fake = fakeFirestore();
    expect(await closer(fake.db).c.close(UID, { store: 'reminders', ref: 'r9' }, 'done', NOW)).toBe(
      false
    );
    expect(fake.stats.writes).toBe(0);
  });
});

describe('commitments: through the commitment store, from a call', () => {
  it.each([
    ['done', 'completed'],
    ['release', 'dismissed'],
  ] as const)('%s closes it as %s, marked as closed on a call', async (how, status) => {
    const { c, heard, closeCommitment } = closer(fakeFirestore().db);
    expect(await c.close(UID, { store: 'commitments', ref: 'c1' }, how, NOW)).toBe(true);
    expect(closeCommitment).toHaveBeenCalledWith(UID, 'c1', status, NOW.getTime(), 'call');
    expect(heard).toEqual([{ userId: UID, store: 'commitments', ref: 'c1', status, at: NOW }]);
  });

  it.each(['already', 'missing'] as const)(
    'a close that comes back %s is not a close',
    async (o) => {
      const { c, heard } = closer(
        fakeFirestore().db,
        vi.fn(async () => o)
      );
      expect(await c.close(UID, { store: 'commitments', ref: 'c1' }, 'done', NOW)).toBe(false);
      expect(heard).toEqual([]);
    }
  );
});

describe('the port', () => {
  it('an unknown store closes nothing and returns false', async () => {
    const fake = seeded([task('t1')]);
    const { c, heard } = closer(fake.db);
    for (const store of ['summaries', 'outreach_confirm', 'constructor', '__proto__'])
      expect(await c.close(UID, { store, ref: 't1' }, 'done', NOW)).toBe(false);
    expect(fake.stats.writes).toBe(0);
    expect(heard).toEqual([]);
  });

  it('dispatches by the source store, with the ref, how and time', async () => {
    const tasks = vi.fn(async () => true);
    const c = sourceCloserOf({ tasks });
    expect(await c.close(UID, { store: 'tasks', ref: 't1' }, 'release', NOW)).toBe(true);
    expect(tasks).toHaveBeenCalledWith(UID, 't1', 'release', NOW);
  });

  it('no Firestore, no closer', () => {
    expect(firestoreSourceCloser({}, null)).toBeNull();
  });
});
