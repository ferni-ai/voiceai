/**
 * setReminder and addTask schedule in the caller's time zone, the one the
 * call started with (rememberCallerTimeZone in voice-agent-entry).
 *
 * Dev, 2026-10-11 22:41 ET: "remind me tomorrow at noon" was stored as
 * 2026-10-13T12:00Z (8 AM ET the day after), and a medication task for
 * "tomorrow" landed on the calendar at 09:00Z (5 AM ET).
 */
// Prod servers run in UTC; pin it so a dev machine's own zone can't mask the bug.
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({
  reminders: [] as Array<Record<string, unknown>>,
  calendar: [] as Array<{ title: string; at: Date }>,
}));

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
  };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => config) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../services/scheduling/reminder-scheduler.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../services/scheduling/reminder-scheduler.js')
  >()),
  createReminder: vi.fn(async (params: Record<string, unknown>) => {
    created.reminders.push(params);
    return { id: 'rem-1', ...params };
  }),
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: vi.fn(async () => {}),
}));
vi.mock('../../../../services/outreach/user-reach.js', () => ({ userReach: vi.fn() }));
vi.mock('../../../../config/assistant-actions-flag.js', () => ({
  isAssistantActionsReal: () => false,
}));
vi.mock('../../../../services/calendar/calendar-bridge.js', () => ({
  syncTaskToCalendar: vi.fn(async (_u: string, _id: string, title: string, at: Date) => {
    created.calendar.push({ title, at });
    return { success: true };
  }),
  removeCalendarSyncedItem: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    getTasks: () => [],
    setTask: vi.fn(),
    loadUser: vi.fn(async () => {}),
    ensureLoaded: vi.fn(async () => {}),
  }),
}));

import { rememberCallerTimeZone } from '../../../../utils/caller-time-zone.js';
import type { ToolContext } from '../../../registry/types.js';
import { reminderTools } from '../reminders.js';
import { createTaskTools } from '../tasks.js';

// Sunday 2026-10-11 22:41 in New York: already Monday 02:41 in UTC.
const LATE_SUNDAY_NY = new Date('2026-10-12T02:41:00Z');

type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

describe('scheduling tools use the caller zone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: LATE_SUNDAY_NY, toFake: ['Date'] });
    created.reminders.length = 0;
    created.calendar.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('setReminder: "tomorrow at noon" at 22:41 New York is noon Monday New York', async () => {
    rememberCallerTimeZone('America/New_York', 'session-tz', 'voice-eval-tz-user');
    const ctx = {
      userId: 'voice-eval-tz-user',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
    } as ToolContext;
    const tool = reminderTools.find((d) => d.id === 'setReminder')!.create(ctx) as unknown as Exec;

    const said = await tool.execute({ message: 'call mom', when: 'tomorrow at noon' });

    // Read back what was stored, in their time: one reminder, where it lands.
    expect(said).toContain(
      'Saved: tomorrow, Oct 12, 12:00 PM your time, one reminder to "call mom"'
    );
    expect(said).toContain('as a message in the Ferni app');
    expect(said).not.toMatch(/repeat/i);
    expect(created.reminders).toHaveLength(1);
    expect((created.reminders[0].scheduledFor as Date).toISOString()).toBe(
      '2026-10-12T16:00:00.000Z'
    );
    expect(created.reminders[0].timezone).toBe('America/New_York');
    // The user asked for it, so consent given on a call covers its text.
    expect(created.reminders[0].requestedByUser).toBe(true);
  });

  it('setReminder: a repeat asked for is not confirmed, and the result says it does not repeat', async () => {
    rememberCallerTimeZone('America/New_York', 'voice-eval-tz-user');
    const ctx = { userId: 'voice-eval-tz-user', agentId: 'ferni', agentDisplayName: 'Ferni' };
    const tool = reminderTools
      .find((d) => d.id === 'setReminder')!
      .create(ctx as ToolContext) as unknown as Exec;

    const said = await tool.execute({
      message: 'take my blood pressure pill every morning',
      when: 'tomorrow at 8am',
    });

    expect(created.reminders).toHaveLength(1);
    expect(said).toContain('tomorrow, Oct 12, 8:00 AM your time, one reminder');
    expect(said).toContain("It does not repeat: repeating reminders aren't supported yet.");
    expect(said).not.toMatch(/remind you (daily|every)/i);
  });

  it('addTask: a task due "tomorrow" goes on the calendar at 9 AM in Tokyo, not 9 AM UTC', async () => {
    rememberCallerTimeZone('Asia/Tokyo', 'voice-eval-tz-tokyo');
    const { addTask } = createTaskTools() as unknown as { addTask: Exec };

    const said = await addTask.execute(
      {
        title: 'take blood pressure pill',
        dueDate: 'tomorrow',
        priority: 'medium',
        isRecurring: true,
        recurrencePattern: 'daily',
      },
      { ctx: { userData: { userId: 'voice-eval-tz-tokyo' } } }
    );

    // Says what a task is: a to-do due Tokyo's tomorrow, no ping, no repeating reminder.
    expect(said).toContain('due by tomorrow, Oct 13, 11:59 PM your time');
    expect(said).toContain('nothing will ping them');
    expect(said).not.toMatch(/repeats daily|remind you/i);

    // 11:41 Monday in Tokyo; tomorrow is Tuesday the 13th, 09:00 JST = 00:00Z.
    expect(created.calendar).toHaveLength(1);
    expect(created.calendar[0].at.toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });
});
