/**
 * What POST /api/soul-stats takes: the four counts, each a whole number from 0
 * to 500, and nothing else at any level (#4069).
 */
import { describe, expect, it } from 'vitest';
import { soulStatsBodySchema } from '../soul-stats-input.js';

const counts = { micro_expression: 4, protective_mode: 0, comfort_pulse: 2, memory_spark: 500 };
const ok = (body: unknown) => soulStatsBodySchema.safeParse(body).success;
const withCount = (key: string, value: unknown) => ({ counts: { ...counts, [key]: value } });

describe('the soul stats body', () => {
  it('takes the four counts, 0 and 500 included, values unchanged', () => {
    expect(soulStatsBodySchema.parse({ counts })).toEqual({ counts });
  });

  it('refuses an unknown key at the top and inside counts (no trigger, session, uid or text)', () => {
    expect(ok({ counts, uid: 'u1' })).toBe(false);
    expect(ok({ counts, sessionId: 's1' })).toBe(false);
    expect(ok(withCount('trigger', 1))).toBe(false);
    expect(ok({ counts: { ...counts, note: 'hello' } })).toBe(false);
  });

  it('refuses a negative count and one above 500', () => {
    expect(ok(withCount('comfort_pulse', -1))).toBe(false);
    expect(ok(withCount('memory_spark', 501))).toBe(false);
  });

  it('refuses a non-integer, a string, NaN or Infinity', () => {
    expect(ok(withCount('micro_expression', 1.5))).toBe(false);
    expect(ok(withCount('micro_expression', '3'))).toBe(false);
    expect(ok(withCount('micro_expression', Number.NaN))).toBe(false);
    expect(ok(withCount('micro_expression', Number.POSITIVE_INFINITY))).toBe(false);
  });

  it('refuses a missing count, null, and a body without counts', () => {
    const { memory_spark: _dropped, ...three } = counts;
    expect(ok({ counts: three })).toBe(false);
    expect(ok(withCount('protective_mode', null))).toBe(false);
    expect(ok({})).toBe(false);
  });
});
