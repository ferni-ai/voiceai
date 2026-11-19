/**
 * REMINDER_WRITES_TRUTHFUL (#4225): setReminder says "Saved" and cancelReminder
 * says "cancelled" only when Firestore took the write. Delivery reads Firestore,
 * so a save it never got never goes off and a cancel it never got still does.
 *
 * The real tools over the real scheduler; only Firestore (a fake that can fail
 * each write), the calendar bridge and the promise ledger are replaced.
 */
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  failSet: false,
  failUpdate: false,
  noDb: false,
  docs: new Map<string, Record<string, unknown>>(),
}));
const promise = vi.hoisted(() => vi.fn(async () => {}));

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
vi.mock('../../../../services/superhuman/firestore-utils.js', () => {
  const reminderDoc = (id: string) => ({
    set: async (data: Record<string, unknown>) => {
      if (fs.failSet) throw new Error('UNAVAILABLE');
      fs.docs.set(id, data);
    },
    update: async (data: Record<string, unknown>) => {
      if (fs.failUpdate) throw new Error('UNAVAILABLE');
      fs.docs.set(id, { ...fs.docs.get(id), ...data });
    },
  });
  const db = {
    collection: () => ({
      doc: () => ({ collection: () => ({ doc: reminderDoc }) }),
    }),
  };
  return { getFirestoreDb: () => (fs.noDb ? null : db) };
});
vi.mock('../../../../services/calendar/calendar-bridge.js', () => {
  const ok = vi.fn(async () => ({ success: true }));
  return {
    removeCalendarSyncedItem: vi.fn(async () => undefined),
    syncReminderToCalendar: ok,
    syncScheduledCallToCalendar: ok,
    syncScheduledEmailToCalendar: ok,
    syncScheduledTextToCalendar: ok,
  };
});
vi.mock('../../../../services/data-layer/hooks/index.js', () => ({
  onReminderChange: vi.fn(async () => undefined),
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: promise,
}));
vi.mock('../../../../services/outreach/user-reach.js', () => ({ userReach: vi.fn() }));
vi.mock('../../../../config/assistant-actions-flag.js', () => ({
  isAssistantActionsReal: () => false,
}));

import type { ToolContext } from '../../../registry/types.js';
import { getPendingReminders } from '../../../../services/scheduling/reminder-scheduler.js';
import { reminderTools } from '../reminders.js';

const REMINDER_NOT_SAVED =
  "I couldn't save that reminder, so it won't go off. Want me to try again?";

// Tuesday 2026-10-20 14:40 in UTC.
const NOW = new Date('2026-10-20T14:40:00Z');
type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

let n = 0;
let userId = '';
function tool(id: 'setReminder' | 'cancelReminder'): Exec {
  const ctx = { userId, agentId: 'ferni' } as ToolContext;
  return reminderTools.find((d) => d.id === id)!.create(ctx) as unknown as Exec;
}
const set = (message: string, when: string, opts?: unknown) =>
  tool('setReminder').execute({ message, when }, opts);
const cancel = (reminderQuery: string) => tool('cancelReminder').execute({ reminderQuery });
const pending = () => getPendingReminders(userId).map((r) => r.message);
const storedStatus = () => [...fs.docs.values()].map((d) => d.status);

/** A live call whose latest caller turn is `said`. */
function call(...said: string[]) {
  const items = said.map((text) => ({ type: 'message', role: 'user', textContent: text }));
  return {
    opts: { ctx: { session: { history: { items } } } },
    said: (text: string) => items.push({ type: 'message', role: 'user', textContent: text }),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  userId = `test-user-4225-${++n}`; // the scheduler's store is per process
  Object.assign(fs, { failSet: false, failUpdate: false, noDb: false });
  fs.docs.clear();
  promise.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.REMINDER_WRITES_TRUTHFUL;
  delete process.env.REMINDER_TIME_FROM_CALLER;
});

describe('REMINDER_WRITES_TRUTHFUL on', () => {
  beforeEach(() => {
    process.env.REMINDER_WRITES_TRUTHFUL = 'on';
  });

  it('a save Firestore took reads "Saved" and is pending', async () => {
    expect(await set('call mom', 'tomorrow at 2pm')).toMatch(/^Saved: .*"call mom"/);
    expect(pending()).toEqual(['call mom']);
    expect(storedStatus()).toEqual(['pending']);
    expect(promise).toHaveBeenCalledTimes(1);
  });

  it('a failed save says it was not saved, keeps nothing and promises nothing', async () => {
    fs.failSet = true;
    expect(await set('call mom', 'tomorrow at 2pm')).toBe(REMINDER_NOT_SAVED);
    expect(pending()).toEqual([]);
    expect(promise).not.toHaveBeenCalled();
  });

  it('with no database it is not saved either (memory alone never goes off)', async () => {
    fs.noDb = true;
    expect(await set('call mom', 'tomorrow at 2pm')).toBe(REMINDER_NOT_SAVED);
    expect(pending()).toEqual([]);
  });

  it('a cancel Firestore took reads "cancelled"', async () => {
    await set('call mom', 'tomorrow at 2pm');
    expect(await cancel('call mom')).toBe('Done! I cancelled the reminder: "call mom"');
    expect(pending()).toEqual([]);
    expect(storedStatus()).toEqual(['cancelled']);
  });

  it('a failed cancel says it is still set, and it stays pending', async () => {
    await set('call mom', 'tomorrow at 2pm');
    fs.failUpdate = true;
    const said = await cancel('call mom');
    expect(said).toMatch(/^I couldn't cancel "call mom", so it's still set for .+\. Want me/);
    expect(said).not.toMatch(/Done|cancelled the reminder|already been sent/);
    expect(pending()).toEqual(['call mom']);
    expect(storedStatus()).toEqual(['pending']);
  });

  it('a moved reminder whose old one failed to cancel says both are set', async () => {
    process.env.REMINDER_TIME_FROM_CALLER = 'on';
    const live = call('Remind me to call mom tomorrow at 2pm');
    await set('call mom', 'tomorrow at 2pm', live.opts);
    fs.failUpdate = true;
    live.said('actually make it tomorrow at 5pm');
    const said = await set('call mom', 'tomorrow at 5pm', live.opts);
    expect(said).toMatch(
      /^Saved: .* I couldn't cancel the one for .+, so that one is still set too\.$/
    );
    expect(said).not.toMatch(/which is cancelled/);
    expect(pending()).toEqual(['call mom', 'call mom']);
  });

  it('a moved reminder whose old one cancelled still reads as replaced', async () => {
    process.env.REMINDER_TIME_FROM_CALLER = 'on';
    const live = call('Remind me to call mom tomorrow at 2pm');
    await set('call mom', 'tomorrow at 2pm', live.opts);
    live.said('actually make it tomorrow at 5pm');
    const said = await set('call mom', 'tomorrow at 5pm', live.opts);
    expect(said).toMatch(/It replaces the one for .+, which is cancelled\.$/);
    expect(pending()).toEqual(['call mom']);
  });
});

describe('REMINDER_WRITES_TRUTHFUL off: the same failures read as main', () => {
  it('a failed save still says "Saved" and keeps it in memory', async () => {
    fs.failSet = true;
    expect(await set('call mom', 'tomorrow at 2pm')).toMatch(/^Saved: .*"call mom"/);
    expect(pending()).toEqual(['call mom']);
    expect(promise).toHaveBeenCalledTimes(1);
  });

  it('a failed cancel still says "cancelled"', async () => {
    await set('call mom', 'tomorrow at 2pm');
    fs.failUpdate = true;
    expect(await cancel('call mom')).toBe('Done! I cancelled the reminder: "call mom"');
    expect(pending()).toEqual([]);
  });

  it('a moved reminder whose old one failed to cancel still says it is cancelled', async () => {
    process.env.REMINDER_TIME_FROM_CALLER = 'on';
    const live = call('Remind me to call mom tomorrow at 2pm');
    await set('call mom', 'tomorrow at 2pm', live.opts);
    fs.failUpdate = true;
    live.said('actually make it tomorrow at 5pm');
    expect(await set('call mom', 'tomorrow at 5pm', live.opts)).toMatch(/which is cancelled\.$/);
  });
});
