/**
 * The assembled moment follows the caller's clock (CALLER_CLOCK_TIME_OF_DAY, #2167).
 *
 * The agent server runs in UTC, so 23:00Z (6 pm Eastern) read as late night and
 * 03:00Z Saturday (7 pm Friday Pacific) read as the weekend. With the flag on and
 * the call's zone known, hour, day and late night come from the caller's clock.
 * Flag on with no valid zone: no time of day and never late night (the UTC hour
 * is wrong for the caller). Flag off: the server clock, exactly as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assembleContext,
  clearContextCache,
  formatAssembledContextForPrompt,
} from '../context-assembler.js';
import { getIntelligenceForTurn } from '../unified-intelligence-api.js';
import { forgetCallerTimeZone, rememberCallerTimeZone } from '../../../utils/caller-time-zone.js';

const USER = 'riley-test-clock';
const SESSION = 'riley-test-clock-session';
const EASTERN = 'America/New_York';
const PACIFIC = 'America/Los_Angeles';
/** Wednesday 18:00 in New York (EST, UTC-5). */
const EASTERN_SIX_PM = '2026-11-18T23:00:00Z';

function at(iso: string): void {
  vi.setSystemTime(new Date(iso));
}

async function immediate(timeZone?: string) {
  return (await assembleContext({ userId: USER, timeZone, forceRefresh: true })).immediate;
}

/** What assembleImmediate read before the flag: the process clock. */
function serverClock() {
  const now = new Date();
  return { hour: now.getHours(), day: now.getDay() };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clearContextCache();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CALLER_CLOCK_TIME_OF_DAY;
  forgetCallerTimeZone(SESSION, USER);
  clearContextCache();
});

describe('assembleContext with CALLER_CLOCK_TIME_OF_DAY on', () => {
  beforeEach(() => {
    process.env.CALLER_CLOCK_TIME_OF_DAY = 'on';
  });

  it('6 pm Eastern (23:00Z) is evening, not late night', async () => {
    at(EASTERN_SIX_PM);
    const moment = await immediate(EASTERN);
    expect(moment.hour).toBe(18);
    expect(moment.timeOfDay).toBe('evening');
    expect(moment.isLateNight).toBe(false);
    expect(moment.dayOfWeek).toBe('Wednesday');
  });

  it('11 pm Eastern (04:00Z next day) is still late night, on the caller day', async () => {
    at('2026-11-19T04:00:00Z');
    const moment = await immediate(EASTERN);
    expect(moment.hour).toBe(23);
    expect(moment.isLateNight).toBe(true);
    expect(moment.dayOfWeek).toBe('Wednesday');
  });

  it('Saturday 7 pm Pacific (03:00Z Sunday) reads as Saturday', async () => {
    at('2026-11-22T03:00:00Z');
    const moment = await immediate(PACIFIC);
    expect(moment.dayOfWeek).toBe('Saturday');
    expect(moment.hour).toBe(19);
    expect(moment.timeOfDay).toBe('evening');
  });

  it('Friday 7 pm Pacific (03:00Z Saturday) is a weekday', async () => {
    at('2026-11-21T03:00:00Z');
    const moment = await immediate(PACIFIC);
    expect(moment.dayOfWeek).toBe('Friday');
    expect(moment.isWeekend).toBe(false);
  });

  it('no zone at 23:00Z: no time of day, and not late night', async () => {
    at(EASTERN_SIX_PM);
    const neutral = { isWeekend: false, isLateNight: false };
    expect(await immediate(undefined)).toEqual(neutral);
    expect(await immediate('Not/AZone')).toEqual(neutral);
  });

  it('no zone at 03:00Z (late on the server clock): no late-night line or insight', async () => {
    at('2026-11-19T03:00:00Z');
    const context = await assembleContext({ userId: USER, forceRefresh: true });
    expect(context.immediate.isLateNight).toBe(false);
    expect(context.activeDomains).not.toContain('late_night_support');
    const prompt = formatAssembledContextForPrompt(context);
    expect(prompt).not.toContain('[MOMENT]');
    expect(prompt).not.toContain('Late night');
    const { proactiveInsights } = await getIntelligenceForTurn(USER, {
      moment: 'session_start',
      sessionId: SESSION, // a session with no zone recorded
      forceRefresh: true,
    });
    expect(proactiveInsights.map((i) => i.category)).not.toContain('late_night_support');
  });

  it('getIntelligenceForTurn reads the zone the call settled, by session id', async () => {
    rememberCallerTimeZone(EASTERN, SESSION); // by session only: the user id has no zone
    at(EASTERN_SIX_PM);
    const { context } = await getIntelligenceForTurn(USER, {
      moment: 'session_start',
      sessionId: SESSION,
      forceRefresh: true,
    });
    expect(context.immediate.hour).toBe(18);
    expect(context.immediate.isLateNight).toBe(false);
  });
});

describe('assembleContext with CALLER_CLOCK_TIME_OF_DAY off', () => {
  it('no zone: the server clock and the [MOMENT] line, as before', async () => {
    at(EASTERN_SIX_PM);
    const context = await assembleContext({ userId: USER, forceRefresh: true });
    const { hour } = serverClock();
    expect(context.immediate.hour).toBe(hour);
    expect(context.immediate.isLateNight).toBe(hour >= 22 || hour < 6);
    expect(formatAssembledContextForPrompt(context)).toContain(
      `[MOMENT] ${context.immediate.timeOfDay}, ${context.immediate.dayOfWeek}`
    );
  });

  it('a known zone is ignored: hour and day come from the server clock', async () => {
    at('2026-11-22T03:00:00Z'); // 08:45 Sunday in Kathmandu (UTC+5:45), no server's own zone
    const moment = await immediate('Asia/Kathmandu');
    const { hour, day } = serverClock();
    expect(hour).not.toBe(8); // the zone's hour differs, so this tells the two clocks apart
    expect(moment.hour).toBe(hour);
    expect(moment.isWeekend).toBe(day === 0 || day === 6);
    expect(moment.isLateNight).toBe(hour >= 22 || hour < 6);
  });
});
