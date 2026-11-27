/**
 * #4322 round 2: the task, goal, routine and calendar writers log an id, a length or a count,
 * never the title, name or attendee the caller gave. Each row drives a real writer with an
 * invented line in every free-text field, captures every log call, and asserts that no captured
 * field holds that line and that the writer's own line carries its shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../types.js';

const cap = vi.hoisted(() => {
  const calls: Array<{ level: string; fields: unknown; msg: unknown }> = [];
  const logger: Record<string, unknown> = {};
  for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal']) {
    logger[level] = (fields: unknown, msg?: unknown) => calls.push({ level, fields, msg });
  }
  logger.child = () => logger;
  // A Firestore that takes every write and reads back nothing.
  const empty = { docs: [], empty: true, size: 0, exists: false, data: () => undefined };
  const node = (): unknown =>
    new Proxy(() => {}, {
      get: (_t, key) => {
        if (key === 'then') return undefined;
        if (key === 'get') return async () => ({ ...empty, forEach: () => {} });
        if (key === 'set' || key === 'update' || key === 'add' || key === 'delete') {
          return async () => node();
        }
        return () => node();
      },
    });
  return { calls, logger, db: node() };
});

/** Invented caller words: if any log field holds this, the words reached the logger. */
const WORDS = vi.hoisted(() => 'riley test dentist with dr oat on fifth');
/** An invented attendee address, a third party's contact. */
const ATTENDEE = 'riley.neighbour@example.test';

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => cap.logger,
  safeLog: () => cap.logger,
  createLogger: () => cap.logger,
}));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => cap.db }));
vi.mock('../../../../utils/shared-firestore.js', () => ({ sharedFirestore: () => cap.db }));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));
vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createEvent: vi.fn(async () => ({ id: 'event-1' })),
  isConnected: vi.fn(async () => true),
}));
vi.mock('../../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createEvent: vi.fn(async () => ({
    id: 'event-2',
    startTime: new Date('2030-01-02T15:00:00Z'),
    endTime: new Date('2030-01-02T16:00:00Z'),
  })),
}));
vi.mock('../../../../services/calendar/proactive-calendar.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPostMeetingFollowUps: vi.fn(async () => [
    {
      eventId: 'event-3',
      eventTitle: WORDS,
      endedAt: new Date(),
      prompts: [],
      suggestedActions: [],
    },
  ]),
}));
vi.mock('../../../../services/calendar/meeting-memory-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordMeetingInteraction: vi.fn(async () => undefined),
}));

const { calendarExecutor } = await import('../calendar-executor.js');
const { createTask, completeTask } =
  await import('../../../../tools/domains/productivity/tasks.js');
const { createGoal } = await import('../../../../tools/domains/life-planning/goal-management.js');
const { createRoutine } = await import('../../../../tools/domains/productivity/routines.js');
const { smartCalendarTools } =
  await import('../../../../tools/domains/calendar/smart-calendar-tools.js');
const { createEvent: storeEvent } =
  await import('../../../../services/calendar/unified-calendar-store.js');
const { getLifeDataStore } = await import('../../../../services/stores/life-data-store.js');

const ctx: ToolExecutionContext = { userId: 'riley-test-1' };

beforeEach(() => {
  cap.calls.length = 0;
});

const quietly = async (run: () => Promise<unknown>): Promise<void> => {
  try {
    await run();
  } catch {
    // Some writers fail later against the stub store; the log line under test came first.
  }
};

/** No captured call holds the words or the attendee; line `msg` has every field in `shape`. */
function nothingNamed(msg: string, shape: Record<string, unknown> = {}): void {
  for (const c of cap.calls) {
    const text = JSON.stringify(c.fields) ?? '';
    expect(text).not.toContain(WORDS);
    expect(text).not.toContain(ATTENDEE);
  }
  const line = cap.calls.find((c) => c.msg === msg);
  expect(line, `no "${msg}" line`).toBeDefined();
  expect(line?.fields).toMatchObject(shape);
}

async function smart(id: string, args: Record<string, unknown>): Promise<unknown> {
  const def = smartCalendarTools.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const made = (def.create as (c: unknown) => { execute: (a: unknown, o: unknown) => unknown })({
    userId: ctx.userId,
  });
  return made.execute(args, { ctx: { userData: { userId: ctx.userId } } });
}

describe('task, goal and routine titles never reach the logger (#4322)', () => {
  it('a task created and then completed: a title length, then no title', async () => {
    const task = await createTask({ userId: 'riley-test-1', title: WORDS });
    nothingNamed('Task created', { taskId: task.id, titleLength: WORDS.length });
    cap.calls.length = 0;
    await completeTask(task.id);
    nothingNamed('Task completed', { taskId: task.id });
  });

  it('a goal: the title as a length', async () => {
    await quietly(async () => createGoal('riley-test-1', WORDS, 'health', 'monthly'));
    nothingNamed('Goal created', { titleLength: WORDS.length, category: 'health' });
    nothingNamed('💾 Goal saved');
  });

  it('a life milestone saved to the store: the name as a length', async () => {
    const now = new Date();
    await quietly(async () =>
      getLifeDataStore().saveMilestone('riley-test-1', {
        id: 'milestone-1',
        userId: 'riley-test-1',
        name: WORDS,
        category: 'first-home',
        status: 'planning',
        checklist: [],
        notes: '',
        createdAt: now,
        updatedAt: now,
      })
    );
    nothingNamed('💾 Milestone saved', { nameLength: WORDS.length });
  });

  it('a routine: the name as a length', () => {
    createRoutine({ userId: 'riley-test-1', name: WORDS, type: 'morning' });
    nothingNamed('🌅 Routine created', { nameLength: WORDS.length });
  });
});

describe('calendar titles and attendees never reach the logger (#4322)', () => {
  it('chat createCalendarEvent: the title as a length, no date or time words', async () => {
    await calendarExecutor.execute(
      'createCalendarEvent',
      { title: WORDS, date: WORDS, time: WORDS },
      ctx
    );
    nothingNamed('📅 Creating calendar event', { titleLength: WORDS.length });
  });

  it('chat sendMeetingInvite: the title as a length, no attendees', async () => {
    await calendarExecutor.execute(
      'sendMeetingInvite',
      { title: WORDS, attendees: [ATTENDEE, 'riley.two@example.test'] },
      ctx
    );
    nothingNamed('📧 Sending meeting invite', { titleLength: WORDS.length });
  });

  it('voice createCalendarEvent: the title as a length', async () => {
    await smart('createCalendarEvent', { title: WORDS, date: '2030-01-02', startTime: '15:00' });
    nothingNamed('Created calendar event', { titleLength: WORDS.length });
  });

  it('a post-meeting follow-up: the event id, not its title', async () => {
    await smart('getPostMeetingFollowUp', {});
    nothingNamed('Delivered post-meeting follow-up', { eventId: 'event-3' });
  });

  it('a meeting outcome: whether there was an attendee, never their address', async () => {
    await smart('recordMeetingOutcome', {
      meetingTitle: WORDS,
      attendeeEmail: ATTENDEE,
      topics: [WORDS],
    });
    nothingNamed('Recorded meeting outcome', { hasAttendee: true, topicCount: 1 });
  });

  it('a recovery block with a title the caller gave: the event id only', async () => {
    await smart('blockRecoveryTime', {
      durationMinutes: 30,
      title: WORDS,
      startTime: '2030-01-02T15:00:00Z',
    });
    nothingNamed('Recovery time blocked', { eventId: 'event-2' });
  });

  it('an event saved to the Ferni calendar store: the id and source, no title', async () => {
    await quietly(async () =>
      storeEvent(
        'riley-test-1',
        { title: WORDS, startTime: new Date('2030-01-02T15:00:00Z'), durationMinutes: 30 },
        'ferni'
      )
    );
    nothingNamed('Created calendar event', { source: 'ferni' });
  });
});
