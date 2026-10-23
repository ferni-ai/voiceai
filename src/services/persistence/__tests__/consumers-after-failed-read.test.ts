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

// Spontaneous sharing picks from a persona's quirks; these are fixed so a share always happens.
vi.mock('../../persona-behavior-manager.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPersonaBehaviors: async () => ({
    quirks: { things_that_make_me_unreasonably_happy: ['joy 1', 'joy 2', 'joy 3'] },
  }),
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
const { CommunicationMirroringEngine } =
  await import('../../../intelligence/tracking/communication-style.js');
const { createPersistenceStore } = await import('../index.js');
const outreach = await import('../../outreach/outreach-intelligence.js');
const sharing = await import('../../engagement/spontaneous-sharing.js');
const { TeamEngagementService } = await import('../../engagement/team-engagement.js');
const { getMayaNotificationService } =
  await import('../../engagement/engagement-notification-service.js');

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

describe('communication style after a failed load', () => {
  const USER = 'u-style';
  const PATH = `bogle_users/${USER}/communication_style_test/data`;
  type StyleStore = ConstructorParameters<typeof CommunicationMirroringEngine>[1];
  const styleStore = createPersistenceStore({
    collection: 'communication_style_test',
  }) as NonNullable<StyleStore>;

  it('after recovery the next message saves next to the stored samples', async () => {
    const seeding = new CommunicationMirroringEngine(USER, styleStore);
    await seeding.analyzeMessage('this one was stored before');
    await styleStore.flush();
    const storedCount = (state.docs.get(PATH)?.samples as unknown[]).length;
    styleStore.clearAllCaches();

    const engine = new CommunicationMirroringEngine(USER, styleStore);
    failed.add(PATH);
    await engine.analyzeMessage('said during the outage');
    failed.clear();
    state.writes.length = 0;
    await engine.analyzeMessage('said after recovery');
    await styleStore.flush();

    expect(writesTo(PATH).length).toBeGreaterThan(0);
    expect((state.docs.get(PATH)?.samples as unknown[]).length).toBeGreaterThan(storedCount);
  });
});

describe('outreach intelligence after a failed load', () => {
  const USER = 'u-reach';
  const PATH = `bogle_users/${USER}/outreach_data/data`;
  const stored = {
    id: 'old-c',
    what: 'call the dentist',
    when: ISO,
    checkInTime: ISO,
    status: 'done',
  };

  it('a commitment heard during the outage does not stop the next load', async () => {
    await outreach.initializeOutreachPersistence();
    state.docs.set(PATH, { commitments: [stored], opportunities: [], sentLog: [] });
    failed.add(PATH);
    await outreach.detectOutreachOpportunities(USER);
    expect(outreach.extractCommitments(USER, "I'm going to call my mom tomorrow")).not.toEqual([]);
    failed.clear();

    await outreach.detectOutreachOpportunities(USER); // reads the stored data now
    outreach.setPreferences(USER, { maxPerDay: 1 });
    await outreach.shutdownOutreachPersistence(); // flushes
    expect(idsAt(PATH, 'commitments')).toContain('old-c');
    expect(state.docs.get(PATH)?.preferences).toMatchObject({ maxPerDay: 1 });
  });
});

describe('spontaneous sharing after a failed load', () => {
  const USER = 'u-share';
  const PATH = `bogle_users/${USER}/spontaneous_sharing/data`;

  it('content shared during the outage does not stop the next load', async () => {
    await sharing.initializeSpontaneousSharingPersistence();
    state.docs.set(PATH, { sharedByPersona: { ferni: ['stored joy'] } });
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // always share
    failed.add(PATH);
    const first = await sharing.shareSimpleJoy({ personaId: 'ferni' } as never, USER);
    expect(first).not.toBeNull();
    failed.clear();
    await sharing.shareSimpleJoy({ personaId: 'ferni' } as never, USER);
    await sharing.shutdownSpontaneousSharingPersistence();
    vi.restoreAllMocks();

    const ferni = (state.docs.get(PATH)?.sharedByPersona as Record<string, string[]>).ferni;
    expect(ferni).toContain('stored joy');
    expect(ferni.length).toBeGreaterThan(1);
  });
});

describe('team engagement after a failed load', () => {
  const USER = 'u-team';
  const PATH = `bogle_users/${USER}/team_engagement/data`;

  it('an evolution marked during the outage does not stop the next load', async () => {
    const team = new TeamEngagementService();
    await team.initialize();
    state.docs.set(PATH, { huddles: [], sharedEvolutions: ['old-evt'], anniversaries: [] });
    failed.add(PATH);
    await team.getUnlockedEvolutions(USER, null);
    team.markEvolutionShared(USER, 'during-outage');
    failed.clear();

    await team.getUnlockedEvolutions(USER, null); // reads the stored data now
    team.markEvolutionShared(USER, 'evt-2');
    await team.shutdown();
    expect(state.docs.get(PATH)?.sharedEvolutions).toEqual(['old-evt', 'evt-2']);
  });
});

describe('Maya notification preferences after a failed load', () => {
  const USER = 'u-maya';
  const PATH = `bogle_users/${USER}/maya_notifications/data`;

  it('a preference set during the outage does not hide the stored ones afterwards', async () => {
    const maya = getMayaNotificationService();
    await maya.initialize();
    state.docs.set(PATH, {
      preferences: {
        userId: USER,
        enabled: false,
        preferredMethod: 'email',
        enabledTypes: [],
        frequency: 'weekly',
      },
    });
    failed.add(PATH);
    await maya.setPreferences(USER, { quietHoursStart: 22 }); // built on defaults; not saved
    failed.clear();

    expect(await maya.getPreferences(USER)).toMatchObject({ enabled: false, frequency: 'weekly' });
    await maya.setPreferences(USER, { quietHoursEnd: 7 });
    await maya.shutdown();
    expect(state.docs.get(PATH)?.preferences).toMatchObject({ enabled: false, quietHoursEnd: 7 });
  });
});
