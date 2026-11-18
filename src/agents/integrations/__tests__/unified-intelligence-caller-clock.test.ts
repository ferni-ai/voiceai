/**
 * The turn handler's intelligence call reaches the caller's clock (#2167).
 *
 * getUnifiedIntelligence gets the call's session id from the turn handler and
 * must hand it to getIntelligenceForTurn, which looks up the zone the call
 * settled. With CALLER_CLOCK_TIME_OF_DAY on, 6 pm Eastern is not late night.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../memory/embeddings.js', () => ({
  embed: vi.fn(async () => new Array(768).fill(0)),
  getEmbedding: vi.fn(async () => new Array(768).fill(0)),
}));

import {
  cleanupIntelligenceSession,
  getUnifiedIntelligence,
} from '../unified-intelligence-integration.js';
import { forgetCallerTimeZone, rememberCallerTimeZone } from '../../../utils/caller-time-zone.js';

const USER = 'riley-test-turn-clock';
const SESSION = 'riley-test-turn-clock-session';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T23:00:00Z')); // 6 pm Wednesday in New York
  process.env.CALLER_CLOCK_TIME_OF_DAY = 'on';
  rememberCallerTimeZone('America/New_York', SESSION, USER);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CALLER_CLOCK_TIME_OF_DAY;
  forgetCallerTimeZone(SESSION, USER);
  cleanupIntelligenceSession(USER, SESSION);
});

describe('getUnifiedIntelligence with CALLER_CLOCK_TIME_OF_DAY on', () => {
  it('the first turn at 6 pm Eastern reads as evening, not late night', async () => {
    const result = await getUnifiedIntelligence({
      userId: USER,
      sessionId: SESSION,
      turnNumber: 1,
      transcript: 'hi there',
    });
    expect(result.context.immediate.hour).toBe(18);
    expect(result.context.immediate.isLateNight).toBe(false);
    expect(result.proactiveInsights.map((i) => i.category)).not.toContain('late_night_support');
  });
});
