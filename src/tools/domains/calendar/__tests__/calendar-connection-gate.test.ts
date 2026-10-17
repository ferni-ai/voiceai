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
vi.mock('../../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasAnyProviderConnected: vi.fn(),
  getEventsForDay: vi.fn(),
  getEventsForWeek: vi.fn(),
  getDayOverview: vi.fn(),
  getWeekOverview: vi.fn(),
  createEvent: vi.fn(),
}));

import {
  createEvent,
  getDayOverview,
  getEventsForDay,
  getEventsForWeek,
  getWeekOverview,
  hasAnyProviderConnected,
  type CalendarEvent,
  type DayOverview,
} from '../../../../services/calendar/index.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import {
  NOT_CONNECTED_CREATE,
  NOT_CONNECTED_READ,
  smartCalendarTools,
} from '../calendar-connection-gate.js';

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
const emptyDay: DayOverview = {
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

const toolFor = (id: string) => {
  const def = smartCalendarTools.find((d) => d.id === id) as ToolDefinition;
  return def.create(ctx) as { execute: (params: unknown, options: unknown) => Promise<unknown> };
};

describe('calendar tools with no calendar connected', () => {
  beforeEach(() => {
    vi.mocked(hasAnyProviderConnected).mockResolvedValue(false);
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
    expect(out).toBe(NOT_CONNECTED_CREATE);
    expect(String(out)).toMatch(/Nothing was added to a calendar/);
    expect(String(out)).toMatch(/Ferni's own list/);
  });

  it('a create that failed keeps its own refusal, not the saved-to-list line', async () => {
    vi.mocked(createEvent).mockResolvedValue(null as never);
    const out = await toolFor('createCalendarEvent').execute(
      { title: 'Lunch with Sam', date: '2026-10-18', startTime: '12:00' },
      {}
    );
    expect(out).toMatch(/^Couldn't create the event/);
  });

  it('a connected calendar gets the real read, not the not-connected line', async () => {
    vi.mocked(hasAnyProviderConnected).mockResolvedValue(true);
    const out = await toolFor('getCalendarToday').execute({}, {});
    expect(out).not.toBe(NOT_CONNECTED_READ);
    expect(String(out)).toMatch(/Standup with Priya|meeting/);
  });
});
