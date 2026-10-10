/**
 * What's Ahead intentions save where they're read back from. The fake Firestore keeps
 * documents by path and records each write, so every test can say which document changed
 * and how. (That the writes really persist is covered by the signed-in e2e walk.)
 */
import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import {
  IntentionNotFoundError,
  isDoneToday,
  markStartersDoneToday,
  setIntentionCompleted,
} from '../practice-intentions.js';

const NOW = new Date('2026-10-07T15:00:00Z');
const YESTERDAY = '2026-10-06T09:00:00.000Z';

type Write = { path: string; kind: 'set' | 'update'; data: Record<string, unknown>; options?: unknown };

function fakeDb(docs: Record<string, Record<string, unknown>> = {}) {
  const writes: Write[] = [];
  const ref = (path: string) => ({
    path,
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    get: async () => ({ exists: path in docs, data: () => docs[path] }),
    set: async (data: Record<string, unknown>, options?: unknown) => {
      writes.push({ path, kind: 'set', data, options });
    },
    update: async (data: Record<string, unknown>) => {
      writes.push({ path, kind: 'update', data });
    },
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: (r: ReturnType<typeof ref>) => r.get(),
        update: (r: ReturnType<typeof ref>, data: Record<string, unknown>) =>
          writes.push({ path: r.path, kind: 'update', data }),
      }),
  };
  return { db: db as unknown as Firestore, writes };
}

/** FieldValue sentinels only compare with isEqual */
function expectSentinel(actual: unknown, expected: FieldValue) {
  expect((actual as FieldValue).isEqual(expected)).toBe(true);
}

describe('starter intentions', () => {
  it("checking one adds it to today's list, and unchecking takes it out", async () => {
    const { db, writes } = fakeDb();
    await setIntentionCompleted(db, 'u1', 'default_2', true, NOW);
    await setIntentionCompleted(db, 'u1', 'default_2', false, NOW);

    expect(writes.map((w) => [w.path, w.kind, w.options])).toEqual([
      ['bogle_users/u1/intentionDays/2026-10-07', 'set', { merge: true }],
      ['bogle_users/u1/intentionDays/2026-10-07', 'set', { merge: true }],
    ]);
    expectSentinel(writes[0].data.completed, FieldValue.arrayUnion('default_2'));
    expectSentinel(writes[1].data.completed, FieldValue.arrayRemove('default_2'));
  });

  it("are shown done only if they're on today's list", async () => {
    const intentions = () => [1, 2, 3].map((n) => ({ id: `default_${n}`, completed: false }));

    const none = intentions();
    await markStartersDoneToday(fakeDb().db, 'u1', none, NOW);
    expect(none.map((i) => i.completed)).toEqual([false, false, false]);

    const today = intentions();
    const { db } = fakeDb({ 'bogle_users/u1/intentionDays/2026-10-07': { completed: ['default_2'] } });
    await markStartersDoneToday(db, 'u1', today, NOW);
    expect(today.map((i) => i.completed)).toEqual([false, true, false]);

    // Yesterday's list doesn't carry over: each day starts fresh
    const tomorrow = intentions();
    await markStartersDoneToday(db, 'u1', tomorrow, new Date('2026-10-08T10:00:00Z'));
    expect(tomorrow.map((i) => i.completed)).toEqual([false, false, false]);
  });

  it("an id that isn't one of the three is not found, and nothing is written", async () => {
    const { db, writes } = fakeDb();
    await expect(setIntentionCompleted(db, 'u1', 'default_9', true, NOW)).rejects.toBeInstanceOf(
      IntentionNotFoundError
    );
    expect(writes).toEqual([]);
  });
});

describe('practices', () => {
  const path = 'users/u1/practices/p1';

  it('doing one adds to the streak and remembers the last session', async () => {
    const { db, writes } = fakeDb({ [path]: { name: 'Breathe', lastCompletedAt: YESTERDAY, streak: 3 } });
    await setIntentionCompleted(db, 'u1', 'practice_p1', true, NOW);

    expect(writes).toHaveLength(1);
    const { data } = writes[0];
    expect(writes[0].path).toBe(path);
    expect(data).toMatchObject({
      completedToday: true,
      previousCompletedAt: YESTERDAY,
      lastCompletedAt: NOW.toISOString(),
    });
    expectSentinel(data.streak, FieldValue.increment(1));
  });

  it('doing it again the same day counts once', async () => {
    const { db, writes } = fakeDb({ [path]: { lastCompletedAt: NOW.toISOString(), streak: 4 } });
    await setIntentionCompleted(db, 'u1', 'practice_p1', true, NOW);
    expect(writes).toEqual([]);
  });

  it('undoing it takes back the streak and puts back the last session', async () => {
    const { db, writes } = fakeDb({
      [path]: { lastCompletedAt: NOW.toISOString(), previousCompletedAt: YESTERDAY, streak: 4 },
    });
    await setIntentionCompleted(db, 'u1', 'practice_p1', false, NOW);

    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({ completedToday: false, lastCompletedAt: YESTERDAY });
    expectSentinel(writes[0].data.streak, FieldValue.increment(-1));
    expectSentinel(writes[0].data.previousCompletedAt, FieldValue.delete());
  });

  it('a practice done yesterday is not done today, whatever its old flag says', () => {
    expect(isDoneToday({ completedToday: true, lastCompletedAt: YESTERDAY } as never, NOW)).toBe(false);
    expect(isDoneToday({ lastCompletedAt: NOW.toISOString() }, NOW)).toBe(true);
    expect(isDoneToday({}, NOW)).toBe(false);
  });

  it('a practice that is gone is not found', async () => {
    const { db, writes } = fakeDb();
    await expect(setIntentionCompleted(db, 'u1', 'practice_gone', true, NOW)).rejects.toBeInstanceOf(
      IntentionNotFoundError
    );
    expect(writes).toEqual([]);
  });
});

describe('tasks', () => {
  it('checking a task completes it, and unchecking reopens it', async () => {
    const { db, writes } = fakeDb({ 'bogle_users/u1/tasks/t1': { title: 'Call Mom', completed: false } });
    await setIntentionCompleted(db, 'u1', 't1', true, NOW);
    await setIntentionCompleted(db, 'u1', 't1', false, NOW);

    expect(writes[0]).toEqual({
      path: 'bogle_users/u1/tasks/t1',
      kind: 'update',
      data: { completed: true, completedAt: NOW.toISOString() },
    });
    expect(writes[1].data.completed).toBe(false);
    expectSentinel(writes[1].data.completedAt, FieldValue.delete());
  });

  it('a task that is gone is not found', async () => {
    const { db } = fakeDb();
    await expect(setIntentionCompleted(db, 'u1', 'nope', true, NOW)).rejects.toBeInstanceOf(
      IntentionNotFoundError
    );
  });
});
