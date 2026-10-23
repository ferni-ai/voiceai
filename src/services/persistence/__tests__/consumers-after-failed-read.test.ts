/**
 * A consumer that remembers which users it loaded must not remember a failed load.
 *
 * calendar-reminders, goal-outreach and the rest marked a user loaded even when the load failed.
 * With set() refusing writes after a failed load, that was a dead end: they never loaded again,
 * the mark never cleared, and every later write was dropped. Reproduced on calendar reminders:
 * one failed load, recovery, then "dentist-tuesday" sent 0 writes and was gone on restart.
 * Without the refusal (main) the same path wrote [new] over the stored list instead.
 *
 * Now they load with strict: 'read' and count only a good load, so the next call reads again
 * and the write lands next to what was stored. Real consumers and the real store on the
 * Firestore merge fake; assertions read the stored docs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const state: MergeFakeState = newMergeFakeState();
const failed = new Set<string>();
state.failReads = failed;
/** The merge fake plus the batch API the store's flush uses. */
function fakeDb(s: MergeFakeState) {
  const db = createMergeFakeFirestore(s);
  type Ref = ReturnType<typeof db.doc>;
  const batch = () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (r: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void ops.push(() => r.set(data, opts)),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  };
  return { ...db, batch };
}
fake.db = fakeDb(state);

const calendar = await import('../../scheduling/calendar-reminders.js');
const goals = await import('../../goal-outreach-integration.js');

const writesTo = (path: string) => state.writes.filter((w) => w.path === path);
const idsAt = (path: string, field: string) =>
  ((state.docs.get(path)?.[field] ?? []) as Array<{ id: string }>).map((x) => x.id);
const ISO = '2026-10-27T15:00:00.000Z';

beforeEach(() => {
  state.docs.clear();
  state.writes.length = 0;
  failed.clear();
});

describe('calendar reminders after a failed load', () => {
  const USER = 'u-cal';
  const PATH = `bogle_users/${USER}/calendar_reminders/data`;
  const event = (id: string) => ({
    id,
    userId: USER,
    title: id,
    startTime: new Date(ISO),
    endTime: new Date(ISO),
    isAllDay: false,
    reminders: [{ id: `${id}-r`, minutesBefore: 30, type: 'push' as const, sent: false }],
    source: 'manual' as const,
  });

  it('after recovery the next event saves next to the stored ones', async () => {
    const stored = { ...event('old-standup'), startTime: ISO, endTime: ISO };
    state.docs.set(PATH, { events: [stored], remindersSent: [] });
    failed.add(PATH);
    await calendar.upsertEvent(event('during-outage') as never);
    await calendar.flushCalendarPersistence();
    expect(writesTo(PATH)).toEqual([]); // nothing written over the unread list

    failed.clear(); // Firestore recovers
    await calendar.upsertEvent(event('dentist-tuesday') as never);
    await calendar.flushCalendarPersistence();

    expect(writesTo(PATH).length).toBeGreaterThan(0);
    expect(idsAt(PATH, 'events')).toEqual(['old-standup', 'dentist-tuesday']);
  });
});

describe('goal outreach after a failed load', () => {
  const USER = 'u-goal';
  const GOALS = `bogle_users/${USER}/goals_outreach/goals`;
  const STREAKS = `bogle_users/${USER}/goals_outreach/streaks`;

  it('after recovery the next goal saves next to the stored ones', async () => {
    const stored = {
      id: 'old-goal',
      userId: USER,
      title: 'Run a 5k',
      progress: 40,
      status: 'active',
      milestones: [],
      createdAt: ISO,
      updatedAt: ISO,
    };
    state.docs.set(GOALS, { goals: [stored] });
    state.docs.set(STREAKS, { streaks: [] });
    failed.add(GOALS);
    await goals.createGoal({ userId: USER, title: 'during the outage' });
    await goals.flushGoalOutreachPersistence();
    expect(writesTo(GOALS)).toEqual([]);

    failed.clear();
    const goal = await goals.createGoal({ userId: USER, title: 'Read 12 books' });
    await goals.flushGoalOutreachPersistence();

    expect(idsAt(GOALS, 'goals')).toEqual(['old-goal', goal.id]);
  });
});
