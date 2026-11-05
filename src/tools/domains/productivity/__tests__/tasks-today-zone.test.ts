/**
 * "Today" for the task tools is the caller's calendar day (TASKS_TODAY_USER_ZONE).
 *
 * The worker runs in UTC and due dates are stored on the user's wall clock, so for a
 * New York user between local midnight and 7 PM, getTasks(today) listed yesterday's
 * tasks and hid today's. "Completed today" used the same UTC midnight, rescheduleTask
 * read "tomorrow" in UTC, and a task added with no due date never showed under today.
 */
// Prod servers run in UTC; pin it so a dev machine's own zone can't mask the bug.
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ info: [] as Array<[unknown, unknown]> }));

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn((fields: unknown, msg: unknown) => logged.info.push([fields, msg])),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
  };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => config) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../services/calendar/calendar-bridge.js', () => ({
  syncTaskToCalendar: vi.fn(async () => ({ success: true })),
  removeCalendarSyncedItem: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: vi.fn(async () => {}),
    getUserTasks: () => [],
    setTask: vi.fn(),
    deleteTask: vi.fn(),
  }),
}));

import { completeTask, createTask, createTaskTools, getUserTasks } from '../tasks.js';

type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };
const tools = createTaskTools() as unknown as Record<
  'getTasks' | 'getTaskSummary' | 'rescheduleTask',
  Exec
>;

// Thursday 2026-11-05, 08:19 in New York (EST, UTC-5), 02:19 Friday in Auckland (NZDT, UTC+13).
const NY_MORNING = '2026-11-05T13:19:00Z';
// Thursday 2026-11-05, 23:30 in New York: already Friday 04:30 in UTC.
const NY_LATE = '2026-11-06T04:30:00Z';

let n = 0;
const freshUser = (): string => `tasks-tz-user-${++n}`;
const at = (iso: string): void => void vi.setSystemTime(new Date(iso));
const ctxFor = (userId: string, callerTimezone?: string) => ({
  ctx: { userData: { userId, ...(callerTimezone ? { callerTimezone } : {}) } },
});
const add = (userId: string, title: string, due?: string, priority?: 'urgent') =>
  createTask({ userId, title, dueDate: due ? new Date(due) : undefined, priority });
const today = (userId: string, zone?: string) =>
  tools.getTasks.execute({ filter: 'today' }, ctxFor(userId, zone));

/** A New York user: yesterday's, today's and tomorrow's task (each due 23:59 local), and one undated. */
async function newYorkList(userId: string): Promise<void> {
  await add(userId, 'return library books', '2026-11-05T04:59:00Z'); // Wed Nov 4, 23:59 EST
  await add(userId, 'pay the water bill', '2026-11-06T04:59:00Z'); // Thu Nov 5, 23:59 EST
  await add(userId, 'book the dentist', '2026-11-07T04:59:00Z'); // Fri Nov 6, 23:59 EST
  await add(userId, 'get the mailbox keys', undefined, 'urgent');
}

describe('task tools: "today" is the caller\'s day', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    logged.info.length = 0;
    delete process.env.TASKS_TODAY_USER_ZONE;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TASKS_TODAY_USER_ZONE;
  });

  it("New York at 13:19Z: today's task is listed (in their date), yesterday's is not", async () => {
    at(NY_MORNING);
    const userId = freshUser();
    await newYorkList(userId);

    const said = await today(userId, 'America/New_York');

    expect(said).toContain('1. ☐ 🟡 pay the water bill - Due: Thu, Nov 5');
    expect(said).not.toContain('return library books');
    expect(said).not.toContain('book the dentist');
  });

  it("New York at 23:30 local: still Thursday's task, not Wednesday's or Friday's", async () => {
    at(NY_LATE);
    const userId = freshUser();
    await newYorkList(userId);

    const said = await today(userId, 'America/New_York');

    expect(said).toContain('pay the water bill - Due: Thu, Nov 5');
    expect(said).not.toContain('return library books');
    expect(said).not.toContain('book the dentist');
  });

  it("Auckland at 13:19Z is already Friday: Friday's task, not Thursday's", async () => {
    at(NY_MORNING);
    const userId = freshUser();
    await add(userId, 'water the ferns', '2026-11-05T10:59:00Z'); // Thu Nov 5, 23:59 NZDT
    await add(userId, 'call the plumber', '2026-11-06T10:59:00Z'); // Fri Nov 6, 23:59 NZDT

    const said = await today(userId, 'Pacific/Auckland');

    expect(said).toContain('call the plumber - Due: Fri, Nov 6');
    expect(said).not.toContain('water the ferns');
  });

  it('a UTC user keeps the UTC day', async () => {
    at(NY_MORNING);
    const userId = freshUser();
    await add(userId, 'renew the parking permit', '2026-11-04T23:59:00Z');
    await add(userId, 'send the invoice', '2026-11-05T23:59:00Z');
    await add(userId, 'pick up the dry cleaning', '2026-11-06T00:30:00Z');

    const said = await today(userId, 'UTC');

    expect(said).toContain('send the invoice - Due: Thu, Nov 5');
    expect(said).not.toContain('renew the parking permit');
    expect(said).not.toContain('pick up the dry cleaning');
  });

  it('an undated task is under today, after the dated ones, even when nothing is dated', async () => {
    at(NY_MORNING);
    const userId = freshUser();
    await newYorkList(userId);

    const said = await today(userId, 'America/New_York');

    // The undated task is urgent, so plain priority order would put it first.
    expect(said).toContain("📋 Today's Tasks (2):");
    expect(said).toContain('1. ☐ 🟡 pay the water bill');
    expect(said).toContain('2. ☐ 🔴 get the mailbox keys');

    const onlyUndated = freshUser();
    await add(onlyUndated, 'get the mailbox keys');
    const said2 = await today(onlyUndated, 'America/New_York');
    expect(said2).toContain('1. ☐ 🟡 get the mailbox keys');
    expect(said2).not.toContain('No tasks for today');
  });

  it('"completed today" counts the caller\'s day, across their midnight', async () => {
    const userId = freshUser();
    const lateWednesday = await add(userId, 'fold the laundry');
    const thursdayMorning = await add(userId, 'take out the recycling');
    at('2026-11-05T04:30:00Z'); // Wed 23:30 EST, but Thursday in UTC
    await completeTask(lateWednesday.id);
    at('2026-11-05T14:00:00Z'); // Thu 09:00 EST
    await completeTask(thursdayMorning.id);

    at('2026-11-06T03:30:00Z'); // Thu 22:30 EST, Friday in UTC
    const thursdayNight = await tools.getTaskSummary.execute(
      {},
      ctxFor(userId, 'America/New_York')
    );
    expect(thursdayNight).toContain('**Completed Today:** 1\n');

    at('2026-11-06T05:30:00Z'); // Fri 00:30 EST
    const afterMidnight = await tools.getTaskSummary.execute(
      {},
      ctxFor(userId, 'America/New_York')
    );
    expect(afterMidnight).toContain('**Completed Today:** 0\n');
  });

  it('reschedule "tomorrow" lands at 23:59 on the caller\'s tomorrow', async () => {
    at(NY_MORNING);
    const userId = freshUser();
    await add(userId, 'return library books', '2026-11-05T04:59:00Z');

    const said = await tools.rescheduleTask.execute(
      { taskTitle: 'library', newDueDate: 'tomorrow' },
      ctxFor(userId, 'America/New_York')
    );

    expect(said).toBe('📅 Moved "return library books" to Friday, Nov 6.');
    expect(getUserTasks(userId)[0].dueDate?.toISOString()).toBe('2026-11-07T04:59:00.000Z');
  });

  it('an unknown zone keeps the UTC day and logs counts only', async () => {
    at(NY_MORNING);
    const userId = freshUser();
    await add(userId, 'send the invoice', '2026-11-05T23:59:00Z');
    await add(userId, 'get the mailbox keys');

    const said = await today(userId);

    expect(said).toContain('1. ☐ 🟡 send the invoice - Due: Thu, Nov 5');
    expect(said).toContain('2. ☐ 🟡 get the mailbox keys');
    const reason = logged.info.find(([f]) => (f as { reason?: string }).reason);
    expect(reason?.[0]).toEqual({ reason: 'caller_zone_unknown', dated: 1, undated: 1 });
  });

  describe('flag off: exactly what main says', () => {
    beforeEach(() => {
      process.env.TASKS_TODAY_USER_ZONE = 'off';
    });

    it("getTasks(today) is the server's UTC day, undated tasks left out", async () => {
      at(NY_MORNING);
      const userId = freshUser();
      await newYorkList(userId);

      expect(await today(userId, 'America/New_York')).toBe(
        "📋 Today's Tasks (1):\n\n1. ☐ 🟡 return library books ⚠️ OVERDUE (Thu, Nov 5)" +
          '\n\n⚠️ You also have 1 overdue task!'
      );
      expect(logged.info.some(([f]) => (f as { reason?: string }).reason)).toBe(false);
    });

    it('getTaskSummary counts completions since UTC midnight', async () => {
      const userId = freshUser();
      const done = await add(userId, 'take out the recycling');
      await add(userId, 'get the mailbox keys');
      at('2026-11-05T14:00:00Z');
      await completeTask(done.id);
      at('2026-11-06T03:30:00Z');

      expect(await tools.getTaskSummary.execute({}, ctxFor(userId, 'America/New_York'))).toBe(
        '📊 **Task Summary**\n\n**Today:** 0 tasks\n**Completed Today:** 0\n**Total Pending:** 1\n'
      );
    });

    it('rescheduleTask reads "tomorrow" in UTC', async () => {
      at(NY_MORNING);
      const userId = freshUser();
      await add(userId, 'return library books', '2026-11-05T04:59:00Z');

      const said = await tools.rescheduleTask.execute(
        { taskTitle: 'library', newDueDate: 'tomorrow' },
        ctxFor(userId, 'America/New_York')
      );

      expect(said).toBe('📅 Moved "return library books" to Friday, Nov 6.');
      expect(getUserTasks(userId)[0].dueDate?.toISOString()).toBe('2026-11-06T23:59:00.000Z');
    });
  });
});
