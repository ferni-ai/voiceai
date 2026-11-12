/**
 * The source writers close an item only while it is still open (compare-and-set
 * in a transaction), with each store's own statuses. A safety item is never
 * closed, and this process's cached copy of a task is only updated when it is
 * the same user's (the cache is keyed by task id alone). Fictional data.
 */
import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../calendar/calendar-bridge.js', () => ({ removeCalendarSyncedItem: vi.fn(async () => undefined) })); // prettier-ignore
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({ ...(await importOriginal<object>()), getFirestoreDb: () => fakeDb() })); // prettier-ignore

const docs = new Map<string, Record<string, unknown>>();
const pick = (data: Record<string, unknown> | undefined, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], data);

function fakeDb(): Firestore {
  const ref = (path: string): Record<string, unknown> => ({
    path,
    collection: (n: string) => ({ doc: (id: string) => ref(`${path}/${n}/${id}`) }),
  });
  return {
    collection: (n: string) => ({ doc: (id: string) => ref(`${n}/${id}`) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (r: { path: string }) => ({
          exists: docs.has(r.path),
          get: (p: string) => pick(docs.get(r.path), p),
        }),
        update: (r: { path: string }, patch: Record<string, unknown>) => {
          const next = { ...docs.get(r.path) };
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'productivityData.tasks') next.productivityData = { tasks: v };
            else next[k] = v;
          }
          docs.set(r.path, next);
        },
      }),
  } as unknown as Firestore;
}

const { firestoreSourceClosers } = await import('../source-closers.js');
const { getProductivityStore } = await import('../productivity-store.js');
type CachedTask = Parameters<ReturnType<typeof getProductivityStore>['setTask']>[1];
const closers = firestoreSourceClosers()!;
const U = 'owner-1';
const task = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 'Book the dentist', status: 'pending', isRecurring: false, updatedAt: '2026-10-10T00:00:00Z', ...over }); // prettier-ignore
const tasks = () => (docs.get(`bogle_users/${U}`)?.productivityData as { tasks: Array<Record<string, unknown>> }).tasks; // prettier-ignore

beforeEach(() => {
  docs.clear();
  docs.set(`bogle_users/${U}/reminders/r1`, { status: 'pending', message: 'Water the ferns' });
  docs.set(`bogle_users/${U}`, { productivityData: { tasks: [task('t1'), task('t2', { isRecurring: true })] } }); // prettier-ignore
});

describe('source closers', () => {
  it('a pending reminder is cancelled; a second close is already', async () => {
    expect(await closers.close(U, { store: 'reminders', ref: 'r1' }, 'done')).toBe('closed');
    expect(docs.get(`bogle_users/${U}/reminders/r1`)?.status).toBe('cancelled');
    expect(await closers.close(U, { store: 'reminders', ref: 'r1' }, 'done')).toBe('already');
  });

  it('a reminder delivered meanwhile is left alone', async () => {
    docs.set(`bogle_users/${U}/reminders/r1`, { status: 'delivered' });
    expect(await closers.close(U, { store: 'reminders', ref: 'r1' }, 'release')).toBe('already');
    expect(docs.get(`bogle_users/${U}/reminders/r1`)?.status).toBe('delivered');
  });

  it('done completes a task with completedAt; let go cancels it; the other task is untouched', async () => {
    expect(await closers.close(U, { store: 'tasks', ref: 't1' }, 'done')).toBe('closed');
    expect(tasks()[0]).toMatchObject({ status: 'completed', completedAt: expect.any(String) });
    expect(tasks()[1].status).toBe('pending');
    docs.set(`bogle_users/${U}`, { productivityData: { tasks: [task('t1')] } });
    expect(await closers.close(U, { store: 'tasks', ref: 't1' }, 'release')).toBe('closed');
    expect(tasks()[0].status).toBe('cancelled');
  });

  it('a repeating task stays open; a missing one is missing', async () => {
    expect(await closers.close(U, { store: 'tasks', ref: 't2' }, 'done')).toBe('already');
    expect(tasks()[1].status).toBe('pending');
    expect(await closers.close(U, { store: 'tasks', ref: 'nope' }, 'done')).toBe('missing');
    expect(await closers.close(U, { store: 'reminders', ref: 'nope' }, 'done')).toBe('missing');
  });

  it('a safety reminder or task is never closed', async () => {
    docs.set(`bogle_users/${U}/reminders/r1`, { status: 'pending', kind: '988-follow-up' });
    docs.set(`bogle_users/${U}`, { productivityData: { tasks: [task('t1', { category: 'crisis-check-in' })] } }); // prettier-ignore
    expect(await closers.close(U, { store: 'reminders', ref: 'r1' }, 'done')).toBe('safety');
    expect(await closers.close(U, { store: 'tasks', ref: 't1' }, 'release')).toBe('safety');
    expect(docs.get(`bogle_users/${U}/reminders/r1`)?.status).toBe('pending');
    expect(tasks()[0].status).toBe('pending');
  });

  it("closing a task never overwrites another user's cached task with the same id", async () => {
    const cache = getProductivityStore();
    vi.spyOn(cache, 'markDirty').mockImplementation(() => undefined); // no debounced save
    const theirs = { ...task('t1'), title: 'Renew the library card' } as unknown as CachedTask;
    cache.setTask('owner-2', theirs);
    expect(await closers.close(U, { store: 'tasks', ref: 't1' }, 'done')).toBe('closed');
    expect(cache.getTask('t1')).toMatchObject({ userId: 'owner-2', status: 'pending', title: 'Renew the library card' }); // prettier-ignore
    // And this user's own cached copy is updated, so its next save doesn't reopen it.
    docs.set(`bogle_users/${U}`, { productivityData: { tasks: [task('t1')] } });
    cache.setTask(U, task('t1') as unknown as CachedTask);
    expect(await closers.close(U, { store: 'tasks', ref: 't1' }, 'done')).toBe('closed');
    expect(cache.getTask('t1')).toMatchObject({ userId: U, status: 'completed' });
  });
});
