/**
 * setReminder schedules in the caller's time zone, the one the call started
 * with (rememberCallerTimeZone in voice-agent-entry).
 *
 * Dev, 2026-10-11 22:41 ET: "remind me tomorrow at noon" was stored as
 * 2026-10-13T12:00Z, 8 AM ET the day after.
 */
// Prod servers run in UTC; pin it so a dev machine's own zone can't mask the bug.
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({
  reminders: [] as Array<Record<string, unknown>>,
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

import { rememberCallerTimeZone } from '../../../../utils/caller-time-zone.js';
import type { ToolContext } from '../../../registry/types.js';
import { reminderTools } from '../reminders.js';

// Sunday 2026-10-11 22:41 in New York: already Monday 02:41 in UTC.
const LATE_SUNDAY_NY = new Date('2026-10-12T02:41:00Z');

type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

describe('setReminder uses the caller zone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: LATE_SUNDAY_NY, toFake: ['Date'] });
    created.reminders.length = 0;
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

    await tool.execute({ message: 'call mom', when: 'tomorrow at noon' });

    expect(created.reminders).toHaveLength(1);
    expect((created.reminders[0].scheduledFor as Date).toISOString()).toBe(
      '2026-10-12T16:00:00.000Z'
    );
    expect(created.reminders[0].timezone).toBe('America/New_York');
  });
});
