/**
 * callQuietHours' `toTheMinute` default is NIGHT_WINDOW_ALL_PATHS (issue 3599). Only
 * proactive-call-scheduler.ts calls it with no third argument, so these pin that path: saved
 * quiet hours 12:00-18:30 on the server clock, asked at 18:00. Off: held to the next day's 18:00,
 * as on main. On: held to 18:30 the same day. Round 5 of #3615.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TZ = 'UTC'; // the server clock the unified-off check reads
});
const h = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  saved: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: !!h.user, data: () => h.user }),
        collection: () => ({
          doc: () => ({ set: async (row: Record<string, unknown>) => void h.saved.push(row) }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../messaging/consent-reach.js', () => ({ ownerRefusal: async () => null }));
const makeConversationalCall = vi.hoisted(() => vi.fn(async () => ({ id: 'c1' })));
vi.mock('../conversational-calls.js', () => ({
  isConversationalCallsConfigured: () => true,
  makeConversationalCall,
}));
vi.mock('../llm-content-generator.js', () => ({
  generatePersonalizedContent: async () => ({
    ssml: '<speak>hi Sam</speak>',
    text: 'hi Sam',
    reason: 'check in',
  }),
}));

import { callQuietHours } from '../quiet-hours.js';
import { scheduleProactiveCall } from '../proactive-call-scheduler.js';

const SIX_PM = new Date('2026-11-10T18:00:00Z'); // inside 12:00-18:30, server clock UTC
const SAME_DAY_1830 = '2026-11-10T18:30:00.000Z';
const NEXT_DAY_1800 = '2026-11-11T18:00:00.000Z'; // main: waits to the end HOUR
const CASES = [
  { flag: 'off', until: NEXT_DAY_1800 },
  { flag: 'on', until: SAME_DAY_1830 },
];

beforeEach(() => {
  h.user = {
    outreachPreferences: { quietHours: { enabled: true, start: '12:00', end: '18:30' } },
  };
  h.saved.length = 0;
  vi.stubEnv('QUIET_HOURS_UNIFIED', 'off');
  vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'off');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('callQuietHours(userId, at): no third argument', () => {
  it.each(CASES)('NIGHT_WINDOW_ALL_PATHS $flag: held until $until', async ({ flag, until }) => {
    vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', flag);
    const r = await callQuietHours('u-sam', SIX_PM);
    expect(r.quiet).toBe(true);
    expect(r.until.toISOString()).toBe(until);
  });
});

describe('proactive-call-scheduler: the path that uses the default', () => {
  it.each(CASES)('NIGHT_WINDOW_ALL_PATHS $flag: stored for $until', async ({ flag, until }) => {
    vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', flag);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SIX_PM);
    const result = await scheduleProactiveCall({
      userId: 'u-sam',
      phoneNumber: '+12125550142', // fictional
      userContext: {},
      outreachType: 'thinking_of_you',
    } as unknown as Parameters<typeof scheduleProactiveCall>[0]);
    expect(result).toMatchObject({ success: true, status: 'scheduled' });
    expect(result.scheduledFor?.toISOString()).toBe(until);
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0].scheduledFor).toBe(until);
    expect(makeConversationalCall).not.toHaveBeenCalled();
  });
});
