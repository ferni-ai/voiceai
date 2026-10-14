/**
 * createCalendarEvent (and quickCalendar, which hands off to it) reads the
 * date and HH:MM as the caller's wall clock. It used new Date(y, m, d, h, mm),
 * the server's clock: UTC in prod, so "13:00" for a New Yorker was 9 AM there.
 */
// Prod servers run in UTC; pin it so a dev machine's own zone can't mask the bug.
process.env.TZ = 'UTC';

import { describe, expect, it, vi } from 'vitest';

const events = vi.hoisted(() => [] as Array<{ title: string; startTime: Date }>);

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
vi.mock('../../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/calendar/index.js')>()),
  createEvent: vi.fn(async (_userId: string, input: { title: string; startTime: Date }) => {
    events.push(input);
    return { id: 'evt-1', ...input };
  }),
}));

import { rememberCallerTimeZone } from '../../../../utils/caller-time-zone.js';
import type { ToolContext } from '../../../registry/types.js';
import { smartCalendarTools } from '../smart-calendar-tools.js';

type Exec = { execute: (args: Record<string, unknown>) => Promise<string> };

describe('createCalendarEvent', () => {
  it('stores 13:00 on 2026-11-03 as 1 PM New York (EST, after the DST change)', async () => {
    rememberCallerTimeZone('America/New_York', 'voice-eval-cal-user');
    const ctx = {
      userId: 'voice-eval-cal-user',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
    } as ToolContext;
    const def = smartCalendarTools.find((d) => d.id === 'createCalendarEvent')!;
    const tool = def.create(ctx) as unknown as Exec;

    const said = await tool.execute({ title: 'Dentist', date: '2026-11-03', startTime: '13:00' });

    expect(events[0].startTime.toISOString()).toBe('2026-11-03T18:00:00.000Z');
    expect(said).toContain('1:00 PM your time');
  });
});
