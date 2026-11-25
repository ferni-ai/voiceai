import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../../../../services/stores/__tests__/fake-firestore.js';

// Completing a task with the task tool closes its follow-up (FOLLOW_THROUGH_SOURCE_CLOSE,
// plan 2026-11-16 Task 2). Real task tool, real follow-up store on the Firestore fake.
const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => h.db,
}));
vi.mock('../../../../memory/profile-store.js', async (orig) => ({
  ...(await orig<typeof import('../../../../memory/profile-store.js')>()),
  getProfileStore: async () => ({
    initialize: async () => undefined,
    getProfile: async () => null,
    getProfileStrict: async () => null,
    saveProfile: async () => undefined,
  }),
}));
vi.mock('../../../../services/calendar/calendar-bridge.js', async (orig) => ({
  ...(await orig<typeof import('../../../../services/calendar/calendar-bridge.js')>()),
  removeCalendarSyncedItem: async () => undefined,
}));

const { createTask, completeTask } = await import('../tasks.js');
const { closeTaskFollowUp, setTaskFollowUpStore } = await import('../task-follow-up-close.js');
const { createFollowUpStore, followUpId } =
  await import('../../../../services/stores/follow-through-store.js');
const { getProductivityStore } = await import('../../../../services/stores/productivity-store.js');

const UID = 'owner-1';
let docs: Map<string, Record<string, unknown>>;

/** An open follow-up made from this task (the kind doesn't matter: closes go by source). */
async function followUpFor(taskId: string) {
  const f = await createFollowUpStore(h.db as never).open(
    {
      userId: UID,
      kind: 'commitment',
      text: 'send the spare keys',
      dueAt: null,
      zone: 'America/New_York',
      repeat: null,
      source: { store: 'tasks', ref: taskId },
    },
    new Date('2026-11-20T10:00:00.000Z')
  );
  return `bogle_users/${UID}/follow_through/${followUpId(f.source)}`;
}

beforeEach(() => {
  const fake = fakeFirestore();
  h.db = fake.db;
  docs = fake.docs;
  // As the live call installs it (agents/follow-through-source-close.ts)
  setTaskFollowUpStore(() => createFollowUpStore(h.db as never));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await getProductivityStore().flushAll();
});

describe('completing a task closes its follow-up', () => {
  it('as done, with the flag on', async () => {
    vi.stubEnv('FOLLOW_THROUGH_SOURCE_CLOSE', 'on');
    const task = await createTask({ userId: UID, title: 'Send the spare keys' });
    const path = await followUpFor(task.id);
    const result = await completeTask(task.id);
    expect(result?.task.status).toBe('completed');
    expect(docs.get(path)).toMatchObject({ status: 'done' });
  });

  it('flag off: the follow-up stays open, as on main', async () => {
    const task = await createTask({ userId: UID, title: 'Send the spare keys' });
    const path = await followUpFor(task.id);
    await completeTask(task.id);
    expect(docs.get(path)).toMatchObject({ status: 'open' });
  });

  it('no store installed (no live call in this process): nothing is closed', async () => {
    vi.stubEnv('FOLLOW_THROUGH_SOURCE_CLOSE', 'on');
    setTaskFollowUpStore(undefined);
    const task = await createTask({ userId: UID, title: 'Send the spare keys' });
    const path = await followUpFor(task.id);
    expect((await completeTask(task.id))?.task.status).toBe('completed');
    expect(docs.get(path)).toMatchObject({ status: 'open' });
  });

  it("another task's follow-up stays open", async () => {
    vi.stubEnv('FOLLOW_THROUGH_SOURCE_CLOSE', 'on');
    const task = await createTask({ userId: UID, title: 'Send the spare keys' });
    const other = await followUpFor('some-other-task');
    await completeTask(task.id);
    expect(docs.get(other)).toMatchObject({ status: 'open' });
  });

  it('a follow-up store that fails never fails the completion', async () => {
    const store = {
      live: async () => Promise.reject(new Error('down')),
      save: async () => true,
    } as never;
    expect(
      await closeTaskFollowUp(UID, 't1', new Date(), {
        env: { FOLLOW_THROUGH_SOURCE_CLOSE: 'on' },
        store,
      })
    ).toBe(0);
    vi.stubEnv('FOLLOW_THROUGH_SOURCE_CLOSE', 'on');
    h.db = {
      collection: () => {
        throw new Error('down');
      },
    };
    const task = await createTask({ userId: UID, title: 'Water the plants' });
    expect((await completeTask(task.id))?.task.status).toBe('completed');
  });
});
