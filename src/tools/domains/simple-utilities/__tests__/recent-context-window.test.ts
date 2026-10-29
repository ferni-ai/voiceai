/**
 * recentContext answers for the timeframe it was asked (#2757, RECENT_CONTEXT_TIMEFRAME).
 *
 * getHistory takes only a limit, so "what did we talk about today" came back with last month's
 * sessions labelled "Timeframe: today". Each window is checked with sessions just inside and just
 * outside it, in New York while the server runs in UTC, so a UTC day can't pass for theirs.
 */
// Prod servers run in UTC; pin it so a dev machine's own zone can't mask the bug.
process.env.TZ = 'UTC';

import { afterEach, describe, expect, it, vi } from 'vitest';

const history = vi.hoisted(() => ({
  sessions: [] as Array<{ date: string; topicsDiscussed: string[]; insights: string[] }>,
  limits: [] as number[],
}));
vi.mock('../../../../services/stores/conversation-history.js', () => ({
  getConversationHistoryService: () => ({
    getHistory: async (_userId: string, limit: number) => {
      history.limits.push(limit);
      return { sessions: history.sessions.slice(0, limit) };
    },
  }),
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: vi.fn(async () => {}),
}));

import { rememberCallerTimeZone } from '../../../../utils/caller-time-zone.js';
import { essentialsToolDefinitions } from '../essentials-tools.js';
import { setRecentContextTopicsReader } from '../recent-context-forget.js';
import { sessionsInTimeframe, type RecentTimeframe } from '../recent-context-window.js';

const NY = 'America/New_York';
// Wednesday 2026-10-28, 4 PM in New York (20:00 UTC).
const NOW = new Date('2026-10-28T20:00:00Z');

/** Which of these dated sessions the window keeps. */
function kept(timeframe: RecentTimeframe, dates: string[], zone = NY, now = NOW): string[] {
  return sessionsInTimeframe(
    dates.map((date) => ({ date })),
    timeframe,
    zone,
    now
  ).map((s) => s.date);
}

describe('sessionsInTimeframe', () => {
  it('today starts at their midnight, not UTC midnight', () => {
    const lateLastNight = '2026-10-28T02:00:00Z'; // Oct 27, 10 PM in New York; Oct 28 in UTC
    const earlyToday = '2026-10-28T05:00:00Z'; // Oct 28, 1 AM in New York
    expect(kept('today', [lateLastNight, earlyToday])).toEqual([earlyToday]);
    // The same instants in UTC: both fall on the UTC day, so the zone is what drops the first.
    expect(kept('today', [lateLastNight, earlyToday], 'Etc/UTC')).toEqual([
      lateLastNight,
      earlyToday,
    ]);
  });

  it('yesterday is the local day before, and nothing from today', () => {
    expect(
      kept('yesterday', [
        '2026-10-27T03:59:00Z', // Oct 26, 11:59 PM
        '2026-10-27T04:00:00Z', // Oct 27, midnight
        '2026-10-28T03:59:00Z', // Oct 27, 11:59 PM
        '2026-10-28T04:00:00Z', // Oct 28, midnight
      ])
    ).toEqual(['2026-10-27T04:00:00Z', '2026-10-28T03:59:00Z']);
  });

  it('this-week is the last 7 local days; last-week the 7 before them', () => {
    const dates = [
      '2026-10-15T03:59:00Z', // Oct 14, 11:59 PM: before last week
      '2026-10-15T04:00:00Z', // Oct 15, midnight: last week starts
      '2026-10-22T03:59:00Z', // Oct 21, 11:59 PM: last week ends
      '2026-10-22T04:00:00Z', // Oct 22, midnight: this week starts
      '2026-10-28T19:00:00Z', // today
    ];
    expect(kept('this-week', dates)).toEqual(['2026-10-22T04:00:00Z', '2026-10-28T19:00:00Z']);
    expect(kept('last-week', dates)).toEqual(['2026-10-15T04:00:00Z', '2026-10-22T03:59:00Z']);
  });

  it('this-month starts on the 1st of their month', () => {
    expect(kept('this-month', ['2026-10-01T03:59:00Z', '2026-10-01T04:00:00Z'])).toEqual([
      '2026-10-01T04:00:00Z',
    ]);
  });

  it('crosses the end of daylight time: today after Nov 1 starts at 05:00 UTC', () => {
    const monday = new Date('2026-11-02T15:00:00Z'); // Nov 2, 10 AM EST
    const dates = ['2026-11-02T04:30:00Z', '2026-11-02T05:00:00Z']; // 11:30 PM Sun, midnight Mon
    expect(kept('today', dates, NY, monday)).toEqual(['2026-11-02T05:00:00Z']);
    // Last week of October (EDT) still begins at 04:00 UTC.
    expect(kept('this-week', ['2026-10-27T03:59:00Z', '2026-10-27T04:00:00Z'], NY, monday)).toEqual(
      ['2026-10-27T04:00:00Z']
    );
  });

  it('all-time keeps everything', () => {
    expect(kept('all-time', ['2020-01-01T00:00:00Z', '2026-10-28T19:00:00Z'])).toHaveLength(2);
  });
});

describe('recentContext with RECENT_CONTEXT_TIMEFRAME', () => {
  const userId = 'u-2757';
  const prev = process.env.RECENT_CONTEXT_TIMEFRAME;

  afterEach(() => {
    vi.useRealTimers();
    setRecentContextTopicsReader(undefined);
    history.sessions = [];
    history.limits = [];
    if (prev === undefined) delete process.env.RECENT_CONTEXT_TIMEFRAME;
    else process.env.RECENT_CONTEXT_TIMEFRAME = prev;
  });

  async function askToday(): Promise<string> {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    rememberCallerTimeZone(NY, userId);
    setRecentContextTopicsReader(async () => []);
    history.sessions = [
      { date: '2026-10-28T14:00:00Z', topicsDiscussed: ['garden plans'], insights: [] },
      { date: '2026-09-30T14:00:00Z', topicsDiscussed: ['old tax return'], insights: [] },
    ];
    const def = essentialsToolDefinitions.find((d) => d.id === 'recentContext')!;
    const tool = def.create({ userId, agentId: 'ferni', agentDisplayName: 'Ferni' } as never) as {
      execute: (args: Record<string, unknown>) => Promise<string>;
    };
    return tool.execute({ timeframe: 'today' });
  }

  it('off: today still reads the last 20 sessions, a month-old one included (as before)', async () => {
    delete process.env.RECENT_CONTEXT_TIMEFRAME;
    const said = await askToday();
    expect(history.limits).toEqual([20]);
    expect(said).toContain('old tax return');
    expect(said).toContain('**2 conversation(s)**');
  });

  it("on: today leaves out last month's session and counts only today's", async () => {
    process.env.RECENT_CONTEXT_TIMEFRAME = 'on';
    const said = await askToday();
    expect(history.limits).toEqual([50]);
    expect(said).toContain('garden plans');
    expect(said).not.toContain('old tax return');
    expect(said).toContain('**1 conversation(s)**');
  });
});
