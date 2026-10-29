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
const profile = vi.hoisted(() => ({ zone: undefined as string | undefined, fail: false }));
vi.mock('../../../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../memory/index.js')>()),
  getProfileStore: async () => ({
    getProfile: async () => {
      if (profile.fail) throw new Error('profile store down');
      return profile.zone ? { contactInfo: { timezone: profile.zone } } : { contactInfo: {} };
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

describe('sessionsInTimeframe with no zone: rolling windows, never a UTC day', () => {
  // 9 PM Eastern on Oct 28 (01:00 UTC Oct 29): UTC's "today" is only the last hour.
  const NINE_PM = new Date('2026-10-29T01:00:00Z');
  const threePm = '2026-10-28T19:00:00Z'; // 3 PM Eastern, 6 h ago
  const dayAndAHalfAgo = '2026-10-27T13:00:00Z';
  const fiveDaysAgo = '2026-10-24T01:00:00Z';
  const nineDaysAgo = '2026-10-20T01:00:00Z';
  const dates = [threePm, dayAndAHalfAgo, fiveDaysAgo, nineDaysAgo];

  it('today is the last 24 h: the 3 PM session is kept (a UTC day would drop it)', () => {
    expect(kept('today', dates, undefined as never, NINE_PM)).toEqual([threePm]);
    expect(kept('today', dates, 'Etc/UTC', NINE_PM)).toEqual([]); // the bug a UTC fallback made
  });

  it('yesterday is the 24 h before that; this-week 7 days; last-week the 7 before', () => {
    expect(kept('yesterday', dates, undefined as never, NINE_PM)).toEqual([dayAndAHalfAgo]);
    expect(kept('this-week', dates, undefined as never, NINE_PM)).toEqual([
      threePm,
      dayAndAHalfAgo,
      fiveDaysAgo,
    ]);
    expect(kept('last-week', dates, undefined as never, NINE_PM)).toEqual([nineDaysAgo]);
  });

  it('an invalid zone is no zone', () => {
    expect(kept('today', dates, 'Not/AZone', NINE_PM)).toEqual([threePm]);
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

  /** A 9 PM Eastern phone caller (no call zone) asks about today; the 3 PM session is 6 h old. */
  async function askAtNineThen(
    userId: string,
    timeframe: string,
    sessions: Array<{ date: string; topicsDiscussed: string[]; insights: string[] }>
  ): Promise<string> {
    process.env.RECENT_CONTEXT_TIMEFRAME = 'on';
    vi.useFakeTimers({ now: new Date('2026-10-29T01:00:00Z'), toFake: ['Date'] });
    setRecentContextTopicsReader(async () => []);
    history.sessions = sessions;
    const def = essentialsToolDefinitions.find((d) => d.id === 'recentContext')!;
    const tool = def.create({ userId, agentId: 'ferni', agentDisplayName: 'Ferni' } as never) as {
      execute: (args: Record<string, unknown>) => Promise<string>;
    };
    return tool.execute({ timeframe });
  }
  const threePm = { date: '2026-10-28T19:00:00Z', topicsDiscussed: ['garden plans'], insights: [] };

  // 10 PM last night in New York (02:00 UTC Oct 28): inside the rolling 24 h from 9 PM, but
  // before New York's midnight. Only a stored-zone lookup can tell it from today's.
  const lastNight = { date: '2026-10-28T02:00:00Z', topicsDiscussed: ['late movie'], insights: [] };

  it("on, no call zone: the account's stored zone sets the day (last night's session is not today)", async () => {
    profile.zone = NY;
    const said = await askAtNineThen('u-2757-stored', 'today', [threePm, lastNight]);
    profile.zone = undefined;
    expect(said).toContain('garden plans');
    expect(said).not.toContain('late movie');
    expect(said).toContain('**1 conversation(s)**');
  });

  it('on, the stored zone cannot be read (store down): rolling 24 h keeps both, still not UTC', async () => {
    profile.fail = true;
    const said = await askAtNineThen('u-2757-down', 'today', [threePm, lastNight]);
    profile.fail = false;
    expect(said).toContain('garden plans');
    expect(said).toContain('late movie');
    expect(said).toContain('**2 conversation(s)**');
  });

  it('on, no zone anywhere: rolling window keeps 6 h ago for today, drops 30 h ago', async () => {
    profile.zone = undefined;
    const old = { date: '2026-10-27T19:00:00Z', topicsDiscussed: ['old tax return'], insights: [] };
    const said = await askAtNineThen('u-2757-nozone', 'today', [threePm, old]);
    expect(said).toContain('garden plans');
    expect(said).not.toContain('old tax return');
    const week = await askAtNineThen('u-2757-nozone', 'this-week', [threePm, old]);
    expect(week).toContain('old tax return');
  });

  it('on, empty window but earlier sessions exist: never says first chat in a while', async () => {
    profile.zone = NY;
    const said = await askAtNineThen('u-2757-empty', 'today', [
      { date: '2026-09-30T14:00:00Z', topicsDiscussed: ['old tax return'], insights: [] },
    ]);
    expect(said).toContain('No conversation records found for today');
    expect(said).toContain('We have talked before');
    expect(said).not.toMatch(/first chat in a while/i);
    profile.zone = undefined;
  });

  it('on, no sessions at all: the first-chat line is still true and stays', async () => {
    const said = await askAtNineThen('u-2757-none', 'today', []);
    expect(said).toContain('first chat in a while');
  });

  it('off: an empty reply reads as before, whatever else exists', async () => {
    delete process.env.RECENT_CONTEXT_TIMEFRAME;
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    setRecentContextTopicsReader(async () => []);
    history.sessions = [];
    const def = essentialsToolDefinitions.find((d) => d.id === 'recentContext')!;
    const tool = def.create({ userId: 'u-2757-off', agentId: 'ferni' } as never) as {
      execute: (args: Record<string, unknown>) => Promise<string>;
    };
    const said = await tool.execute({ timeframe: 'today' });
    expect(said).toContain('This might be our first chat in a while!');
  });
});
