/**
 * #4322: the alarm, reminder, timer, note, task and goal writers log the length of what the caller
 * said, never the words. Each row drives a real writer with an invented line in every free-text
 * field, captures every log call, and asserts that no captured field holds that line and that the
 * writer's own log line carries its length.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => cap.logger,
  safeLog: () => cap.logger,
  createLogger: () => cap.logger,
}));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => cap.db }));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));
vi.mock('../../../../tools/domains/simple-utilities/voice-callbacks.js', () => ({
  onTimerComplete: vi.fn(async () => undefined),
}));

const { productivityExecutor } = await import('../productivity-executor.js');
const { schedulingExecutor } = await import('../scheduling-executor.js');
const { timerToolDefinitions } =
  await import('../../../../tools/domains/simple-utilities/timer-tools.js');
const { advancedReminderDefinitions: advancedReminderTools } =
  await import('../../../../tools/domains/simple-utilities/advanced-reminders.js');
const { reminderTools } = await import('../../../../tools/domains/productivity/reminders.js');
const { upsertEvent } = await import('../../../../services/scheduling/calendar-reminders.js');
const { onTimerComplete } =
  await import('../../../../tools/domains/simple-utilities/voice-callbacks.js');

/** Invented caller words: if any log field holds this, the words reached the logger. */
const WORDS = 'riley test oat milk at the clinic on fifth';
const ctx: ToolExecutionContext = { userId: 'riley-test-1' };

beforeEach(() => {
  cap.calls.length = 0;
});
const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  vi.useRealTimers();
});

const quietly = async (run: () => Promise<unknown>): Promise<void> => {
  try {
    await run();
  } catch {
    // Some writers fail later against the stub store; the log line under test came first.
  }
};

/** No captured call holds the words, and the line `msg` carries `field` = the words' length. */
function wordsNeverLogged(msg: string, ...fields: string[]): void {
  for (const c of cap.calls) expect(JSON.stringify(c.fields) ?? '').not.toContain(WORDS);
  const line = cap.calls.find((c) => c.msg === msg);
  expect(line, `no "${msg}" line`).toBeDefined();
  for (const f of fields) expect(line?.fields).toHaveProperty(f, WORDS.length);
}

async function tool(
  defs: ReadonlyArray<{ id: string; create: unknown }>,
  id: string,
  args: unknown,
  session: Record<string, unknown> = {}
): Promise<void> {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const made = (def.create as (c: unknown) => { execute: (a: unknown, o: unknown) => unknown })({
    userId: ctx.userId,
  });
  await quietly(async () =>
    made.execute(args, { ctx: { userData: { userId: ctx.userId }, session } })
  );
}

const chat = async (fn: string, args: Record<string, unknown>): Promise<void> =>
  quietly(async () => productivityExecutor.execute(fn, args, ctx));

describe('caller words never reach the logger (#4322)', () => {
  it('chat setAlarm: the time, label and repeat as lengths', async () => {
    await chat('setAlarm', { time: WORDS, label: WORDS, recurring: WORDS });
    wordsNeverLogged('⏰ Setting alarm', 'timeLength', 'labelLength', 'recurringLength');
  });

  it('chat scheduleReminder: the message and when as lengths', async () => {
    await chat('scheduleReminder', { message: WORDS, when: WORDS });
    wordsNeverLogged('🔔 Scheduling reminder', 'messageLength', 'whenLength');
  });

  it('chat setTimer: the duration and label as lengths', async () => {
    await chat('setTimer', { duration: WORDS, label: WORDS });
    wordsNeverLogged('⏱️ Setting timer', 'durationLength', 'labelLength');
  });

  it('chat addNote and searchNotes: the title, content and query as lengths', async () => {
    await chat('addNote', { title: WORDS, content: WORDS });
    wordsNeverLogged('📝 Adding note', 'titleLength', 'noteContentLength');
    cap.calls.length = 0;
    await chat('searchNotes', { query: WORDS });
    wordsNeverLogged('🔍 Searching notes', 'queryLength');
  });

  it('chat addTask, completeTask and addGoal: the titles as lengths', async () => {
    await chat('addTask', { title: WORDS });
    wordsNeverLogged('📝 Adding task', 'titleLength');
    cap.calls.length = 0;
    await chat('completeTask', { taskName: WORDS });
    wordsNeverLogged('✅ Completing task', 'taskNameLength');
    cap.calls.length = 0;
    await chat('addGoal', { title: WORDS });
    wordsNeverLogged('🎯 Adding goal', 'titleLength');
  });

  it('chat cancelReminder: which reminder, as a length', async () => {
    await quietly(async () => schedulingExecutor.execute('cancelReminder', { which: WORDS }, ctx));
    wordsNeverLogged('❌ Canceling scheduled item', 'whichLength');
  });

  it('voice setReminder: the message and when as lengths', async () => {
    await tool(reminderTools, 'setReminder', { message: WORDS, when: WORDS });
    wordsNeverLogged('Setting reminder', 'messageLength', 'whenLength');
  });

  it('voice setReminder held for a time the caller never said: when as a length', async () => {
    process.env.REMINDER_TIME_FROM_CALLER = 'on';
    const said = { type: 'message', role: 'user', textContent: 'remind me about the milk' };
    await tool(
      reminderTools,
      'setReminder',
      { message: WORDS, when: WORDS },
      {
        history: { items: [said] },
      }
    );
    wordsNeverLogged('Reminder time not said by caller', 'whenLength');
  });

  it('voice recurring, location and cancel reminders: no words, lengths where kept', async () => {
    await tool(advancedReminderTools, 'recurringReminder', {
      message: WORDS,
      pattern: 'daily',
      time: WORDS,
    });
    wordsNeverLogged('Creating recurring reminder', 'timeLength');
    cap.calls.length = 0;
    await tool(advancedReminderTools, 'locationReminder', {
      message: WORDS,
      locationName: WORDS,
      triggerOn: 'arrive',
    });
    wordsNeverLogged('Creating location reminder');
    cap.calls.length = 0;
    await tool(advancedReminderTools, 'cancelRecurringReminder', {
      type: 'recurring',
      searchTerm: WORDS,
    });
    wordsNeverLogged('Cancelling reminder', 'searchTermLength');
  });

  it('voice timer, when it ends and when its callback fails: the label as a length', async () => {
    vi.useFakeTimers();
    await tool(timerToolDefinitions, 'setTimer', { minutes: 1, label: WORDS });
    await vi.advanceTimersByTimeAsync(61_000);
    wordsNeverLogged('⏰ Timer finished!', 'labelLength');
    cap.calls.length = 0;
    vi.mocked(onTimerComplete).mockRejectedValueOnce(new Error('no session'));
    await tool(timerToolDefinitions, 'setTimer', { minutes: 1, label: WORDS });
    await vi.advanceTimersByTimeAsync(61_000);
    wordsNeverLogged('⏰ Timer completion callback failed', 'labelLength');
  });

  it('a saved calendar event: no title in the log', async () => {
    await quietly(async () =>
      upsertEvent({
        id: 'event-1',
        userId: ctx.userId ?? '',
        title: WORDS,
        startTime: new Date(Date.now() + 3_600_000),
        endTime: new Date(Date.now() + 7_200_000),
        isAllDay: false,
        reminders: [],
        source: 'manual',
      })
    );
    wordsNeverLogged('📅 Calendar event saved');
  });
});
