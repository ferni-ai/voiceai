/**
 * quickCalendar must run calendar tools that are actually registered. It used
 * to look up getCalendarEvents and listCalendar, which don't exist, so every
 * "what's on my calendar?" answered that the calendar wasn't connected.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calendar = vi.hoisted(() => ({
  getDayOverview: vi.fn(),
  getWeekOverview: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock('../../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...calendar,
}));

import { getToolDefinitions as getCalendarTools } from '../../calendar/index.js';
import { getToolDefinitions as getShortcutTools } from '../index.js';
import { quickCalendarTarget } from '../shortcuts-tools.js';
import type { ToolContext } from '../../../registry/types.js';

const ctx = { userId: 'u1', agentId: 'ferni', agentDisplayName: 'Ferni' } as ToolContext;

async function quickCalendar(args: Record<string, string>): Promise<string> {
  const def = (await getShortcutTools()).find((d) => d.id === 'quickCalendar')!;
  return String(await def.create(ctx).execute(args, { toolCallId: 't', ctx: {} } as never));
}

beforeEach(() => {
  vi.clearAllMocks();
  calendar.getDayOverview.mockResolvedValue({ totalMeetings: 0, events: [] });
  calendar.getWeekOverview.mockResolvedValue({ totalMeetings: 0, days: [] });
});

describe('quickCalendar targets', () => {
  it('every target is a registered calendar tool', async () => {
    const ids = (await getCalendarTools()).map((d) => d.id);
    for (const [action, date] of [['list'], ['check', 'today'], ['check', 'this week'], ['add']]) {
      expect(ids).toContain(quickCalendarTarget(action as 'list', date));
    }
  });

  it('today reads the day, other dates read the week', () => {
    expect(quickCalendarTarget('list')).toBe('getCalendarToday');
    expect(quickCalendarTarget('check', 'Today')).toBe('getCalendarToday');
    expect(quickCalendarTarget('check', 'tomorrow')).toBe('getCalendarWeek');
    expect(quickCalendarTarget('add', 'today')).toBe('createCalendarEvent');
  });
});

describe('quickCalendar runs the calendar', () => {
  it('list reads today from the calendar instead of saying it is not connected', async () => {
    const reply = await quickCalendar({ action: 'list' });
    expect(calendar.getDayOverview).toHaveBeenCalledWith('u1', expect.any(Date));
    expect(reply).toBe('Your calendar is clear today. No meetings scheduled.');
  });

  it('check for this week reads the week', async () => {
    const reply = await quickCalendar({ action: 'check', date: 'this week' });
    expect(calendar.getWeekOverview).toHaveBeenCalledWith('u1');
    expect(reply).toMatch(/week is completely clear/);
  });

  it('add passes the event as createCalendarEvent expects it', async () => {
    calendar.createEvent.mockResolvedValue({ id: 'e1' });
    const reply = await quickCalendar({
      action: 'add',
      event: 'Lunch with Sarah',
      date: '2026-10-12',
      time: '13:00',
    });
    const [, input] = calendar.createEvent.mock.calls[0];
    expect(input.title).toBe('Lunch with Sarah');
    expect(input.startTime).toEqual(new Date(2026, 9, 12, 13, 0));
    expect(reply).toMatch(/Lunch with Sarah/);
  });

  it('add without a usable date and time writes nothing and says so', async () => {
    const reply = await quickCalendar({ action: 'add', event: 'Lunch', date: 'tomorrow', time: '1pm' });
    expect(calendar.createEvent).not.toHaveBeenCalled();
    expect(reply).toMatch(/Nothing was added/);
  });
});
