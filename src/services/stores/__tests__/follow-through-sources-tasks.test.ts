import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from './fake-firestore.js';

// Tasks join the follow-up record (FOLLOW_THROUGH_TASKS, plan 2026-11-16 Task 1). The real
// sources, store and importer run on the fake; only the reads the sources make through their
// own modules (commitments, call summaries, the forget list) are replaced.
const h = vi.hoisted(() => ({ forgotten: [] as string[] | null }));
vi.mock('../../superhuman/commitment-follow-up.js', async (orig) => ({
  ...(await orig<typeof import('../../superhuman/commitment-follow-up.js')>()),
  firestoreCommitmentStore: { active: async () => [], markFollowedUp: async () => undefined },
}));
vi.mock('../../../memory/storage/call-summaries.js', () => ({
  readCallSummaries: async () => ({ docs: [] }),
}));
vi.mock('../../../memory/recall/forget.js', () => ({
  forgottenTopicsOrNull: async () => h.forgotten,
}));

const { createFollowUpSources } = await import('../follow-through-sources.js');
const { createFollowUpStore, followUpId } = await import('../follow-through-store.js');
const { importFollowUps } = await import('../../follow-through/index.js');
const { importFollowUpsAfterCall } = await import('../../../agents/follow-through-import.js');
const { isCallersOwn } = await import('../../follow-through/askable.js');
const { toHeldItem } = await import('../../follow-through/holding.js');
const { followUpKind } = await import('../../../intelligence/person-model/util.js');
const { FOLLOW_UP_PERSONA, HOLDING } = await import('../../on-it/on-it-copy.js');

const NOW = new Date('2026-11-24T15:00:00.000Z');
const UID = 'owner-1';

function withTasks(tasks: Array<Record<string, unknown>>) {
  const fake = fakeFirestore();
  fake.docs.set(`bogle_users/${UID}`, { productivityData: { tasks } });
  return fake;
}

const TASKS = [
  { id: 't1', title: 'Send the spare keys', status: 'pending', dueDate: '2026-11-25T17:00:00Z' },
  { id: 't2', title: 'Book the dentist', status: 'completed' },
  { id: 't3', title: 'Return the library books', status: 'in_progress' },
  { id: 't4', title: 'Old idea', status: 'cancelled' },
  { id: 't5', title: '   ', status: 'pending' },
  { id: 7, title: 'Water the plants', status: 'pending', dueDate: 'not a date' },
];

beforeEach(() => {
  h.forgotten = [];
});

describe('open tasks as follow-up sources', () => {
  it('imports pending and in_progress tasks, one follow-up each, keyed as the brief keys them', async () => {
    const { db } = withTasks(TASKS);
    const items = await createFollowUpSources(db, { withTasks: true }).itemsFor(UID, NOW);
    expect(items.filter((i) => i.source.store === 'tasks')).toEqual([
      {
        kind: 'task',
        text: 'Send the spare keys',
        dueAt: '2026-11-25T17:00:00.000Z',
        repeat: null,
        source: { store: 'tasks', ref: 't1' },
      },
      {
        kind: 'task',
        text: 'Return the library books',
        dueAt: null,
        repeat: null,
        source: { store: 'tasks', ref: 't3' },
      },
      // A numeric id is the brief's String(id) ref too; an unreadable due date is no due date
      {
        kind: 'task',
        text: 'Water the plants',
        dueAt: null,
        repeat: null,
        source: { store: 'tasks', ref: '7' },
      },
    ]);
  });

  it('flag off imports no tasks, as on main', async () => {
    const { db } = withTasks(TASKS);
    const off = await createFollowUpSources(db).itemsFor(UID, NOW);
    const explicit = await createFollowUpSources(db, { withTasks: false }).itemsFor(UID, NOW);
    expect(off.some((i) => i.source.store === 'tasks')).toBe(false);
    expect(explicit.some((i) => i.source.store === 'tasks')).toBe(false);
  });

  it('leaves out a task about a forgotten topic, and every task when that list cannot be read', async () => {
    const { db } = withTasks(TASKS);
    h.forgotten = ['library'];
    const kept = await createFollowUpSources(db, { withTasks: true }).itemsFor(UID, NOW);
    expect(kept.filter((i) => i.source.store === 'tasks').map((i) => i.source.ref)).toEqual([
      't1',
      '7',
    ]);
    h.forgotten = null;
    const unreadable = await createFollowUpSources(db, { withTasks: true }).itemsFor(UID, NOW);
    expect(unreadable.some((i) => i.source.store === 'tasks')).toBe(false);
  });

  it('a user doc with no tasks imports none and does not throw', async () => {
    const fake = fakeFirestore();
    fake.docs.set(`bogle_users/${UID}`, { productivityData: { tasks: 'garbage' } });
    const items = await createFollowUpSources(fake.db, { withTasks: true }).itemsFor(UID, NOW);
    expect(items).toEqual([]);
  });

  it('opens a stored task follow-up, and import never reopens a released one', async () => {
    const { db, docs } = withTasks(TASKS);
    const store = createFollowUpStore(db);
    const sources = createFollowUpSources(db, { withTasks: true });
    const path = `bogle_users/${UID}/follow_through/${followUpId({ store: 'tasks', ref: 't1' })}`;

    const first = await importFollowUps(UID, 'America/New_York', sources, store, NOW);
    expect(first.opened).toBe(3);
    expect(docs.get(path)).toMatchObject({ kind: 'task', status: 'open' });
    // The stored doc reads back as a follow-up (the store's kind list knows 'task')
    expect((await store.live(UID)).map((f) => f.source.ref).sort()).toEqual(['7', 't1', 't3']);

    docs.set(path, { ...docs.get(path), status: 'released', closedAt: NOW.toISOString() });
    const later = new Date(NOW.getTime() + 86_400_000);
    const again = await importFollowUps(UID, 'America/New_York', sources, store, later);
    expect(again.opened).toBe(0);
    expect(docs.get(path)).toMatchObject({ status: 'released' });
  });

  it('a task follow-up is the caller’s own to be asked about, held as a task, read as one', async () => {
    const { db } = withTasks(TASKS);
    const store = createFollowUpStore(db);
    await importFollowUps(
      UID,
      'America/New_York',
      createFollowUpSources(db, { withTasks: true }),
      store,
      NOW
    );
    const task = (await store.live(UID)).find((f) => f.source.ref === 't1');
    expect(task && isCallersOwn(task)).toBe(true);
    expect(task && toHeldItem(task, NOW).kind).toBe('task');
    expect(followUpKind('task')).toBe('task');
    // Todos are Alex's (chief of staff), as commitments are, with the same holding line
    expect([FOLLOW_UP_PERSONA.task, HOLDING.task]).toEqual(['alex-chen', HOLDING.commitment]);
  });
});

describe('the after-call import passes FOLLOW_THROUGH_TASKS to the sources', () => {
  const cohorts = { cohortsFor: async () => [], overridesFor: async () => ({}) };
  const call = { userId: UID, sessionId: 's1', timezone: 'America/New_York' };

  it.each([
    ['on', true],
    ['off', false],
    [undefined, false],
  ])('FOLLOW_THROUGH_TASKS=%s asks for tasks: %s', async (flag, expected) => {
    const asked: boolean[] = [];
    const env = { FOLLOW_THROUGH_IMPORT: 'on', ...(flag ? { FOLLOW_THROUGH_TASKS: flag } : {}) };
    const r = await importFollowUpsAfterCall(call, {
      env,
      cohorts,
      verifiedOwner: () => true,
      now: () => NOW,
      stores: (tasks) => {
        asked.push(tasks);
        const { db } = withTasks(TASKS);
        return {
          store: createFollowUpStore(db),
          sources: createFollowUpSources(db, { withTasks: tasks }),
        };
      },
    });
    expect(asked).toEqual([expected]);
    expect(r).toMatchObject({ imported: true, result: { opened: expected ? 3 : 0 } });
  });
});
