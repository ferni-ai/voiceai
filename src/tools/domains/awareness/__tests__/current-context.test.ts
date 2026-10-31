/**
 * getCurrentContext / getTodaySignificance read the caller's clock and the
 * call's cached weather, never the server's UTC clock (prod call 2026-10-17:
 * "1:14 AM UTC, Saturday" to a caller at 9:14 pm Friday, Eastern).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const l = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) };
  return { getLogger: () => l, createLogger: () => l, safeLog: () => l };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config: Record<string, unknown>) => config) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const snapshot = vi.hoisted(() => ({
  weather: undefined as unknown,
  home: undefined as string | undefined,
}));
vi.mock('../../../../services/world-awareness/index.js', () => ({
  getWorldSnapshot: () => ({ weather: snapshot.weather }),
  cachedHomeWeather: () => snapshot.home,
}));

import {
  forgetCallerTimeZone,
  rememberCallerTimeZone,
} from '../../../../utils/caller-time-zone.js';
import type { ToolContext } from '../../../registry/types.js';
import { NO_WEATHER_NOTE, NO_ZONE_NOTE, currentContext } from '../current-context.js';
import { getToolDefinitions } from '../index.js';

// 9:14 pm Friday Oct 16 in New York is 01:14 Saturday Oct 17 UTC.
const NOW = new Date('2026-10-17T01:14:00Z');
const SESSION = 'session-cc-test';
const USER = 'user-cc-test';

const ctx: ToolContext = {
  userId: USER,
  sessionId: SESSION,
  agentId: 'peter-john',
  agentDisplayName: 'Peter',
};

type Exec = (args: Record<string, unknown>, opts?: { ctx?: unknown }) => Promise<string>;
async function tool(id: string): Promise<Exec> {
  const defs = await getToolDefinitions();
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`missing ${id}`);
  return (def.create(ctx) as { execute: Exec }).execute;
}

describe('currentContext (pure)', () => {
  it("states the caller's local time and day, not UTC", () => {
    const c = currentContext({ now: NOW, zone: 'America/New_York' });
    expect(c.current_time).toBe('9:14 PM');
    expect(c.current_date).toBe('Friday, October 16, 2026');
    expect(c.timezone).toBe('America/New_York');
    expect(c.time_of_day).toBe('night');
    expect(c.is_friday).toBe(true);
    expect(c.is_weekend).toBe(false);
  });

  it('says the time is unknown when the call has no zone, with no clock to read', () => {
    const c = currentContext({ now: NOW, zone: undefined });
    expect(c.current_time).toBeUndefined();
    expect(c.current_date).toBeUndefined();
    expect(c.timezone).toBe('unknown');
    expect(c.note).toBe(NO_ZONE_NOTE);
  });
});

describe('getCurrentContext tool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    snapshot.weather = undefined;
    snapshot.home = undefined;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    forgetCallerTimeZone(SESSION, USER);
  });

  it("uses the call's zone from the per-call store", async () => {
    rememberCallerTimeZone('America/New_York', SESSION, USER);
    const out = JSON.parse(await (await tool('getCurrentContext'))({}));
    expect(out.current_time).toBe('9:14 PM');
    expect(out.current_date).toContain('Friday');
    expect(out.timezone).toBe('America/New_York');
  });

  it("uses the zone in LiveKit's run context", async () => {
    const runCtx = { userData: { callerTimezone: 'America/Los_Angeles' } };
    const out = JSON.parse(await (await tool('getCurrentContext'))({}, { ctx: runCtx }));
    expect(out.current_time).toBe('6:14 PM');
    expect(out.timezone).toBe('America/Los_Angeles');
  });

  it("the call's own zone beats the model's timezone argument", async () => {
    rememberCallerTimeZone('America/New_York', SESSION, USER);
    const out = JSON.parse(await (await tool('getCurrentContext'))({ timezone: 'UTC' }));
    expect(out.timezone).toBe('America/New_York');
  });

  it('never reports the server zone when the call has none', async () => {
    const out = JSON.parse(await (await tool('getCurrentContext'))({}));
    expect(out.timezone).toBe('unknown');
    expect(JSON.stringify(out)).not.toMatch(/1:14 AM|UTC|Saturday/);
  });

  it('includeWeather returns the reading cached at call start', async () => {
    snapshot.weather = {
      current: 'Right now in Testville: 82°F with mostly cloudy.',
      location: 'Testville',
      fetchedAt: new Date(NOW.getTime() - 6 * 60_000),
    };
    const out = JSON.parse(await (await tool('getCurrentContext'))({ includeWeather: true }));
    expect(out.weather).toContain('82°F with mostly cloudy');
    expect(out.weather).toContain('6 min ago');
  });

  it('includeWeather with nothing cached says so instead of omitting it', async () => {
    const out = JSON.parse(await (await tool('getCurrentContext'))({ includeWeather: true }));
    expect(out.weather).toBe(NO_WEATHER_NOTE);
  });

  it("falls back to the saved home's weather (WORLD_NOW cache)", async () => {
    snapshot.home = 'Right now in Hometown: 70°F with clear.';
    const out = JSON.parse(await (await tool('getCurrentContext'))({ includeWeather: true }));
    expect(out.weather).toBe(snapshot.home);
  });

  it('a stale reading (over an hour) is not reported as now', async () => {
    snapshot.weather = {
      current: 'Right now in Testville: 60°F with rain.',
      location: 'Testville',
      fetchedAt: new Date(NOW.getTime() - 2 * 60 * 60_000),
    };
    const out = JSON.parse(await (await tool('getCurrentContext'))({ includeWeather: true }));
    expect(out.weather).toBe(NO_WEATHER_NOTE);
  });

  it('AWARENESS_CALLER_TIME=off: the old server clock, no weather', async () => {
    vi.stubEnv('AWARENESS_CALLER_TIME', 'off');
    rememberCallerTimeZone('America/New_York', SESSION, USER);
    const out = JSON.parse(await (await tool('getCurrentContext'))({ includeWeather: true }));
    expect(out.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(out.weather).toBeUndefined();
  });
});

describe('getTodaySignificance tool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    forgetCallerTimeZone(SESSION, USER);
  });

  it("gives the caller's date and weekday", async () => {
    rememberCallerTimeZone('America/New_York', SESSION, USER);
    const out = JSON.parse(await (await tool('getTodaySignificance'))({}));
    expect(out.day_of_week).toBe('Friday');
    expect(out.date).toBe('October 16, 2026');
    expect(out.note).toBeUndefined();
  });

  it('flags the date as UTC when the zone is unknown', async () => {
    const out = JSON.parse(await (await tool('getTodaySignificance'))({}));
    expect(out.day_of_week).toBe('Saturday');
    expect(out.note).toMatch(/UTC date/);
  });
});
