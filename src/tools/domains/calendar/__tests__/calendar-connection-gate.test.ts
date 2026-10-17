/**
 * Calendar tools with no calendar connected (#1547).
 *
 * Synthetic paraphrase of the dev call: a user with no calendar connected asks
 * what is on their calendar, then asks for lunch tomorrow. Ferni's own store
 * answered "clear" and "on your calendar". Reads must say no calendar is
 * connected and quote nothing; creates must say nothing went to a calendar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  safeLog: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(),
}));
vi.mock('../../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getEventsForDay: vi.fn(),
  getEventsForWeek: vi.fn(),
  getDayOverview: vi.fn(),
  getWeekOverview: vi.fn(),
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

import {
  createEvent,
  deleteEvent,
  getDayOverview,
  getEventsForDay,
  getEventsForWeek,
  getWeekOverview,
  type CalendarEvent,
  type DayOverview,
} from '../../../../services/calendar/index.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { isConnected } from '../../../../services/calendar/calendar-service.js';
import {
  NOT_CONNECTED_CHANGE,
  NOT_CONNECTED_CREATE_FAILED,
  NOT_CONNECTED_READ,
  notConnectedCreate,
} from '../../../../services/calendar/not-connected-copy.js';
import { gateCalendarTools, smartCalendarTools } from '../calendar-connection-gate.js';

const READS = [
  'getCalendarToday',
  'getCalendarWeek',
  'findFreeTime',
  'checkAvailability',
  'getDailyBriefing',
  'suggestMeetingTime',
  'detectCalendarIssues',
  'getPreMeetingBriefing',
  'getPostMeetingFollowUp',
  'checkConflicts',
  'findBestTime',
  'detectRecoveryNeeds',
  'findRecoveryOpportunities',
  'getCalendarLoadSummary',
  'smartReschedule',
];

const ctx = { userId: 'user-1', userTimeZone: 'UTC' } as unknown as ToolContext;

/** A real event the store would hand back if a calendar were connected. */
const standup = {
  id: 'e1',
  userId: 'user-1',
  title: 'Standup with Priya',
  startTime: new Date('2026-10-17T15:00:00Z'),
  endTime: new Date('2026-10-17T15:30:00Z'),
  isAllDay: false,
  attendees: [],
  status: 'confirmed',
  source: 'ferni',
  syncStatus: 'local',
  reminders: [],
  createdAt: new Date('2026-10-16T00:00:00Z'),
  updatedAt: new Date('2026-10-16T00:00:00Z'),
} as unknown as CalendarEvent;
const busyDay: DayOverview = {
  date: new Date('2026-10-17T00:00:00Z'),
  events: [standup],
  totalMeetings: 1,
  totalMeetingMinutes: 30,
  freeTimeMinutes: 450,
  firstEvent: standup,
  lastEvent: standup,
  isOverloaded: false,
  hasBackToBack: false,
};
const emptyDay: DayOverview = {
  date: new Date('2026-10-17T00:00:00Z'),
  events: [],
  totalMeetings: 0,
  totalMeetingMinutes: 0,
  freeTimeMinutes: 480,
  firstEvent: undefined,
  lastEvent: undefined,
  isOverloaded: false,
  hasBackToBack: false,
};

const toolFor = (id: string) => {
  const def = smartCalendarTools.find((d) => d.id === id) as ToolDefinition;
  return def.create(ctx) as { execute: (params: unknown, options: unknown) => Promise<unknown> };
};

describe('calendar tools with no calendar connected', () => {
  beforeEach(() => {
    vi.mocked(isConnected).mockResolvedValue(false);
    vi.mocked(getEventsForDay).mockResolvedValue([standup]);
    vi.mocked(getEventsForWeek).mockResolvedValue([standup]);
    vi.mocked(getDayOverview).mockResolvedValue(emptyDay);
    vi.mocked(getWeekOverview).mockResolvedValue({
      days: [emptyDay],
      totalMeetings: 1,
      averageMeetingsPerDay: 0.2,
      busiestDay: { day: 'Saturday', meetings: 1 },
      lightestDay: { day: 'Friday', meetings: 0 },
      backToBackDays: [],
    } as never);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(READS)('%s says no calendar is connected and quotes no events', async (id) => {
    const out = await toolFor(id).execute({}, {});
    expect(out).toBe(NOT_CONNECTED_READ);
    expect(String(out)).not.toMatch(/Standup|clear|no meetings|free|completely/i);
  });

  it('createCalendarEvent saves to Ferni\'s own list and says nothing went to a calendar', async () => {
    vi.mocked(createEvent).mockResolvedValue(standup as never);
    const out = await toolFor('createCalendarEvent').execute(
      { title: 'Lunch with Sam', date: '2026-10-18', startTime: '12:00' },
      {}
    );
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(out).toBe(notConnectedCreate('Lunch with Sam, 2026-10-18, 12:00'));
    expect(String(out)).toMatch(/Saved "Lunch with Sam, 2026-10-18, 12:00" to Ferni's own list/);
    expect(String(out)).toMatch(/isn't on your calendar/);
  });

  it('deleteCalendarEvent deletes from Ferni\'s own list and says the calendar was not changed', async () => {
    vi.mocked(deleteEvent).mockResolvedValue(true);
    const out = await toolFor('deleteCalendarEvent').execute({ eventId: 'e1' }, {});
    expect(deleteEvent).toHaveBeenCalledWith('user-1', 'e1');
    expect(out).toBe(NOT_CONNECTED_CHANGE);
    expect(String(out)).not.toMatch(/removed from your calendar/);
  });

  it('a create that failed keeps its own refusal, not the saved-to-list line', async () => {
    vi.mocked(createEvent).mockResolvedValue(null as never);
    const out = await toolFor('createCalendarEvent').execute(
      { title: 'Lunch with Sam', date: '2026-10-18', startTime: '12:00' },
      {}
    );
    expect(out).toBe(NOT_CONNECTED_CREATE_FAILED);
    expect(String(out)).not.toMatch(/quite full/);
  });

  it("getCalendarToday with nothing connected names Ferni's own list when it has items", async () => {
    vi.mocked(getDayOverview).mockResolvedValue(busyDay);
    const out = String(await toolFor('getCalendarToday').execute({}, {}));
    expect(out).toMatch(/No calendar is connected, but on Ferni's own list for today you have: .*Standup with Priya/);
    expect(out).not.toMatch(/clear/i);
  });

  it('a connected calendar gets the real read, not the not-connected line', async () => {
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getDayOverview).mockResolvedValue(busyDay);
    const out = await toolFor('getCalendarToday').execute({}, {});
    expect(out).not.toBe(NOT_CONNECTED_READ);
    expect(String(out)).toMatch(/Standup with Priya|meeting/);
  });

  it("getCalendarWeek with nothing connected names Ferni's own list by day", async () => {
    vi.mocked(getWeekOverview).mockResolvedValueOnce({ days: [busyDay] } as never);
    const out = String(await toolFor('getCalendarWeek').execute({}, {}));
    expect(out).toMatch(/No calendar is connected, but on Ferni's own list for this week you have: .*Standup with Priya/);
  });

  it('schedule views with nothing connected only change the "clear" wording', async () => {
    vi.mocked(isConnected).mockResolvedValue(false);
    const [clear, reminder, emptyWeek] = gateCalendarTools([
      scheduleView('getUnifiedSchedule', 'Monday is clear. No scheduled items.'),
      scheduleView('getUnifiedSchedule', 'Reminder: call mom at 9.'),
      scheduleView('getUnifiedSchedule', 'This week: 0 scheduled items across 7 days.'),
    ]).map((def) => def.create({ userId: 'user-1' } as never) as { execute: (p: unknown, o: unknown) => Promise<unknown> });
    expect(await clear.execute({}, {})).toBe(NOT_CONNECTED_READ);
    expect(await emptyWeek.execute({}, {})).toBe(NOT_CONNECTED_READ);
    expect(await reminder.execute({}, {})).toMatch(/^No calendar is connected, so this is Ferni's own list[\s\S]*Reminder: call mom at 9\./);
  });
});

function scheduleView(id: string, text: string): ToolDefinition {
  return {
    id,
    name: id,
    description: id,
    domain: 'scheduling',
    tags: [],
    create: () => ({ execute: async () => text }),
  } as unknown as ToolDefinition;
}
