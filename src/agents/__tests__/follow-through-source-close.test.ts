import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../../services/stores/__tests__/fake-firestore.js';

// The caller's answer closes the follow-up's item too (FOLLOW_THROUGH_SOURCE_CLOSE, plan
// 2026-11-16 Task 2), and this worker's own copies take the close. Fictional rows only.
const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof fakeFirestore>,
  profile: null as Record<string, unknown> | null,
  saved: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../memory/profile-store.js', async (orig) => ({
  ...(await orig<typeof import('../../memory/profile-store.js')>()),
  getProfileStore: async () => ({
    initialize: async () => undefined,
    getProfile: async () => h.profile,
    getProfileStrict: async () => h.profile,
    saveProfile: async (p: Record<string, unknown>) => void h.saved.push(structuredClone(p)),
  }),
}));
vi.mock('../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => h.fake.db,
}));
vi.mock('../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../services/superhuman/firestore-utils.js')>()),
  getFirestoreDb: () => null,
}));
vi.mock('../../services/calendar/calendar-bridge.js', async (orig) => ({
  ...(await orig<typeof import('../../services/calendar/calendar-bridge.js')>()),
  removeCalendarSyncedItem: async () => undefined,
}));

const { closeSourceAfterReply } = await import('../follow-through-source-close.js');
const { getProductivityStore } = await import('../../services/stores/productivity-store.js');
const tasksTool = await import('../../tools/domains/productivity/tasks.js');
const reminders = await import('../../services/scheduling/reminder-scheduler.js');

const NOW = new Date('2026-11-24T15:00:00.000Z');
const ON = { FOLLOW_THROUGH_SOURCE_CLOSE: 'on' };
const noCohorts = { cohortsFor: async () => [], overridesFor: async () => ({}) };
const followUp = (store: string, ref: string) => ({
  userId: 'owner-1',
  kind: 'commitment' as const,
  source: { store, ref },
});

beforeEach(() => {
  h.saved = [];
  h.fake = fakeFirestore();
});
afterEach(async () => {
  await getProductivityStore().flushAll();
});

describe('closeSourceAfterReply', () => {
  it.each([
    ['done', 'done'],
    ['release', 'release'],
  ] as const)('%s closes the item it was made from, as %s', async (verdict, how) => {
    const close = vi.fn(async () => true);
    const f = followUp('reminders', 'r1');
    const closed = await closeSourceAfterReply(f, verdict, NOW, {
      env: ON,
      cohorts: noCohorts,
      closer: { close },
    });
    expect(closed).toBe(true);
    expect(close).toHaveBeenCalledWith('owner-1', { store: 'reminders', ref: 'r1' }, how, NOW);
  });

  it('"not yet" (replan) closes nothing', async () => {
    const close = vi.fn(async () => true);
    const opts = { env: ON, cohorts: noCohorts, closer: { close } };
    expect(await closeSourceAfterReply(followUp('tasks', 't1'), 'replan', NOW, opts)).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it.each([{}, { FOLLOW_THROUGH_SOURCE_CLOSE: 'off' }])(
    'flag off (%o) closes nothing, as on main',
    async (env) => {
      const close = vi.fn(async () => true);
      const opts = { env, cohorts: noCohorts, closer: { close } };
      expect(await closeSourceAfterReply(followUp('tasks', 't1'), 'done', NOW, opts)).toBe(false);
      expect(close).not.toHaveBeenCalled();
    }
  );

  it('a closer that throws, or no Firestore, is not a close and does not throw', async () => {
    const boom = { close: vi.fn(async () => Promise.reject(new Error('down'))) };
    const f = followUp('tasks', 't1');
    expect(
      await closeSourceAfterReply(f, 'done', NOW, { env: ON, cohorts: noCohorts, closer: boom })
    ).toBe(false);
    expect(
      await closeSourceAfterReply(f, 'done', NOW, { env: ON, cohorts: noCohorts, closer: null })
    ).toBe(false);
    // The default closer is Firestore's, and it has no such task
    expect(await closeSourceAfterReply(f, 'done', NOW, { env: ON, cohorts: noCohorts })).toBe(
      false
    );
  });
});

describe("this worker's copies take the close, so its next save doesn't undo it", () => {
  // The real Firestore closer on the fake, with this process's task and reminder caches
  async function workerWithTasks(userId: string) {
    h.profile = { userId, productivityData: { tasks: [] } };
    const store = getProductivityStore();
    await store.initialize();
    const keys = await tasksTool.createTask({ userId, title: 'Send the spare keys' });
    const other = await tasksTool.createTask({ userId, title: 'Water the plants' });
    await store.flushAll();
    h.saved = [];
    const stored = [keys, other].map((t) => ({ id: t.id, title: t.title, status: 'pending' }));
    h.fake.docs.set(`bogle_users/${userId}`, { productivityData: { tasks: stored } });
    return { store, keys, other };
  }
  const savedTasks = () =>
    (h.saved.at(-1)?.productivityData as { tasks: Array<Record<string, unknown>> }).tasks;
  const close = (userId: string, store: string, ref: string, verdict: 'done' | 'release') =>
    closeSourceAfterReply({ userId, kind: 'commitment', source: { store, ref } }, verdict, NOW, {
      env: ON,
      cohorts: noCohorts,
    });

  it('a closed task is completed in the task tool and in the next whole-list save', async () => {
    const { store, keys, other } = await workerWithTasks('owner-sync-1');
    expect(await close('owner-sync-1', 'tasks', keys.id, 'done')).toBe(true);

    const cached = tasksTool.getUserTasks('owner-sync-1');
    expect(cached.find((t) => t.id === keys.id)).toMatchObject({
      status: 'completed',
      completedAt: NOW,
    });
    expect(cached.find((t) => t.id === other.id)?.status).toBe('pending');

    // Anything else the call changes saves the whole list from memory
    store.markDirty('owner-sync-1');
    await store.flushAll();
    expect(savedTasks().map((t) => [t.id, t.status])).toEqual(
      expect.arrayContaining([
        [keys.id, 'completed'],
        [other.id, 'pending'],
      ])
    );
    expect(savedTasks().find((t) => t.id === keys.id)).toMatchObject({
      completedAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it("a cancelled task is cancelled, and another user's task with that id is untouched", async () => {
    const { keys } = await workerWithTasks('owner-sync-2');
    h.fake.docs.set('bogle_users/someone-else', {
      productivityData: { tasks: [{ id: keys.id, title: 'theirs', status: 'pending' }] },
    });
    expect(await close('someone-else', 'tasks', keys.id, 'release')).toBe(true);
    expect(getProductivityStore().getTask(keys.id)?.status).toBe('pending');
    expect(await close('owner-sync-2', 'tasks', keys.id, 'release')).toBe(true);
    expect(getProductivityStore().getTask(keys.id)).toMatchObject({ status: 'cancelled' });
    expect(getProductivityStore().getTask(keys.id)?.completedAt).toBeUndefined();
  });

  it('a done reminder leaves the scheduler queue, so it is never sent', async () => {
    const r = await reminders.createReminder({
      userId: 'owner-sync-3',
      message: 'call the vet',
      scheduledFor: new Date(Date.now() - 60_000),
      deliveryMethod: 'in_app',
      deliveryAddress: 'app',
    });
    h.fake.docs.set(`bogle_users/owner-sync-3/reminders/${r.id}`, { status: 'pending' });
    expect(reminders.getDueReminders().map((x) => x.id)).toContain(r.id);
    expect(await close('owner-sync-3', 'reminders', r.id, 'done')).toBe(true);
    expect(reminders.getDueReminders().map((x) => x.id)).not.toContain(r.id);
    expect(reminders.getPendingReminders('owner-sync-3')).toEqual([]);
  });
});
