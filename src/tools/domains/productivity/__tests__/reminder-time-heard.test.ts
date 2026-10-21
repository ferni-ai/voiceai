/**
 * setReminder saves only a time the caller said, and a corrected time moves the
 * reminder set earlier in the call (REMINDER_TIME_FROM_CALLER, #2289).
 *
 * Prod, 2026-10-20: cut off at "You need to remind me next time. I schedule an",
 * the model stored a reminder and calendar event for "tomorrow morning". The
 * caller then said "Dinner is tonight" and the reminder stayed at 9 AM.
 */
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  reminders: [] as Array<Record<string, unknown>>,
  cancelled: [] as string[],
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
    store.reminders.push(params);
    return { id: `rem-test-${store.reminders.length}`, ...params };
  }),
  cancelReminder: vi.fn(async (id: string) => {
    store.cancelled.push(id);
    return true;
  }),
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: vi.fn(async () => {}),
}));
vi.mock('../../../../services/outreach/user-reach.js', () => ({ userReach: vi.fn() }));
vi.mock('../../../../config/assistant-actions-flag.js', () => ({
  isAssistantActionsReal: () => false,
}));

import type { ToolContext } from '../../../registry/types.js';
import { reminderTools } from '../reminders.js';
import { ASK_WHEN, callerCorrectsTime, callerSaidTime } from '../reminder-time-heard.js';

// Tuesday 2026-10-20 14:40 in UTC.
const NOW = new Date('2026-10-20T14:40:00Z');

type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

/** A live call whose chat history holds these turns; `said` appends a caller turn. */
function call(...turns: Array<[role: 'user' | 'assistant', text: string]>) {
  const items = turns.map(([role, text]) => ({ type: 'message', role, textContent: text }));
  const opts = { ctx: { session: { history: { items } } } };
  return {
    opts,
    said: (text: string) => items.push({ type: 'message', role: 'user', textContent: text }),
    ferni: (text: string) => items.push({ type: 'message', role: 'assistant', textContent: text }),
  };
}

function setReminder(): Exec {
  const ctx = { userId: 'test-user-2289', agentId: 'ferni' } as ToolContext;
  return reminderTools.find((d) => d.id === 'setReminder')!.create(ctx) as unknown as Exec;
}

describe('setReminder with REMINDER_TIME_FROM_CALLER on', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    process.env.REMINDER_TIME_FROM_CALLER = 'on';
    store.reminders.length = 0;
    store.cancelled.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.REMINDER_TIME_FROM_CALLER;
  });

  it('the cut-off turn from #2289 stores nothing and asks when', async () => {
    const { opts } = call(['user', 'You need to remind me next time. I schedule an']);

    const said = await setReminder().execute(
      { message: 'Invite a friend to dinner', when: 'tomorrow morning' },
      opts
    );

    expect(said).toBe(ASK_WHEN);
    expect(store.reminders).toHaveLength(0);
  });

  it('no time at all stores nothing and asks when', async () => {
    const { opts } = call(['user', 'Remind me to call the dentist']);

    const said = await setReminder().execute({ message: 'call the dentist' }, opts);

    expect(said).toBe(ASK_WHEN);
    expect(store.reminders).toHaveLength(0);
  });

  it('a time the caller said is stored at that time', async () => {
    const { opts } = call(['user', 'Remind me to call mom tomorrow at 2pm']);

    const said = await setReminder().execute(
      { message: 'call mom', when: 'tomorrow at 2pm' },
      opts
    );

    expect(said).toMatch(/^Saved: /);
    expect(store.reminders).toHaveLength(1);
    expect((store.reminders[0].scheduledFor as Date).toISOString()).toBe(
      '2026-10-21T14:00:00.000Z'
    );
  });

  it('the #2289 correction ("Dinner is tonight") moves the reminder set earlier', async () => {
    const live = call(['user', 'Remind me tomorrow morning to invite my friend to dinner']);
    const tool = setReminder();
    await tool.execute(
      { message: 'invite my friend to dinner', when: 'tomorrow morning' },
      live.opts
    );

    live.ferni("I've got that reminder set for you for tomorrow morning.");
    live.said("Tomorrow's a little bit late. Dinner is tonight, so 5 pm.");
    const said = await tool.execute(
      { message: 'Invite my friend to dinner', when: 'tonight at 5pm' },
      live.opts
    );

    expect(store.reminders).toHaveLength(2);
    expect(store.cancelled).toEqual(['rem-test-1']);
    expect((store.reminders[1].scheduledFor as Date).toISOString()).toBe(
      '2026-10-20T17:00:00.000Z'
    );
    expect(said).toMatch(/replaces the one for .*cancelled/);
  });

  it('the same reminder at a second time, with no correction, keeps both', async () => {
    const live = call(['user', 'Remind me to take my pill tonight at 9pm']);
    const tool = setReminder();
    await tool.execute({ message: 'take my pill', when: 'tonight at 9pm' }, live.opts);

    live.ferni('Saved for tonight at 9.');
    live.said('And tomorrow at 9am.');
    await tool.execute({ message: 'take my pill', when: 'tomorrow at 9am' }, live.opts);

    expect(store.reminders).toHaveLength(2);
    expect(store.cancelled).toEqual([]);
  });

  it('a longer message that contains the first is a new reminder, even after "actually"', async () => {
    const live = call(['user', 'Remind me to take pill at 8pm']);
    const tool = setReminder();
    await tool.execute({ message: 'take pill', when: 'at 8pm' }, live.opts);

    live.ferni('Saved for 8 tonight.');
    live.said('Actually, also remind me to take pill with food tomorrow at 8am.');
    await tool.execute({ message: 'take pill with food', when: 'tomorrow at 8am' }, live.opts);

    expect(store.reminders).toHaveLength(2);
    expect(store.cancelled).toEqual([]);
  });

  it('a reminder for something else in the same call is not moved', async () => {
    const live = call(['user', 'Remind me to call mom at 7 and to water the plants at 8']);
    const tool = setReminder();
    await tool.execute({ message: 'call mom', when: 'at 7pm' }, live.opts);
    await tool.execute({ message: 'water the plants', when: 'at 8pm' }, live.opts);

    expect(store.reminders).toHaveLength(2);
    expect(store.cancelled).toEqual([]);
  });
});

describe('setReminder with the flag off', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    store.reminders.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('keeps today’s behaviour: the unsaid time is stored', async () => {
    const { opts } = call(['user', 'You need to remind me next time. I schedule an']);

    await setReminder().execute({ message: 'Invite a friend', when: 'tomorrow morning' }, opts);

    expect(store.reminders).toHaveLength(1);
  });
});

describe('callerSaidTime', () => {
  it.each([
    ['in 30 minutes', 'remind me in half an hour'],
    ['this evening', "it's tonight"],
    ['2:30pm', 'at two thirty'],
    ['14:00', 'at 2'],
    ['2026-10-21T09:00', 'tomorrow at nine'],
    ['in 1 hour', 'in an hour please'],
    ['at 12pm', 'at noon'],
    ['next Monday', 'on monday'],
  ])('%s is what the caller said in "%s"', (when, said) => {
    expect(callerSaidTime(when, said)).toBe(true);
  });

  it.each([
    ['tomorrow morning', 'You need to remind me next time. I schedule an'],
    ['tomorrow morning', 'remind me tomorrow'],
    ['tonight at 7pm', "it's tonight"],
    ['2026-10-21T09:00', 'remind me about dinner'],
    ['in 20 minutes', 'at 8'],
    ['', 'tomorrow at 9'],
  ])('%s is not in "%s"', (when, said) => {
    expect(callerSaidTime(when, said)).toBe(false);
  });
});

describe('callerCorrectsTime', () => {
  const latest = (text: string) => call(['user', text]).opts.ctx;

  it.each([
    ['Actually, make it 6.'],
    ['No, 7 pm.'],
    ['Not tomorrow, tonight.'],
    ["Tomorrow's a little bit late. Dinner is tonight."],
    ['Can you change it to Friday?'],
  ])('"%s" changes the time', (said) => {
    expect(callerCorrectsTime(latest(said))).toBe(true);
  });

  it.each([['And tomorrow at 9am.'], ['Also at noon, please.'], ['Remind me at 8 to stretch.']])(
    '"%s" asks for another reminder',
    (said) => {
      expect(callerCorrectsTime(latest(said))).toBe(false);
    }
  );
});
