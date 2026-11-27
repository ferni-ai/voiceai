/**
 * What POST /api/soul-stats takes: the eleven counts, each a whole number from 0
 * to 500, and nothing else at any level (#4069).
 */
import { describe, expect, it } from 'vitest';
import { SOUL_COUNT_KEYS, SOUL_STATS_LIMITS, soulStatsBodySchema } from '../soul-stats-input.js';

const counts = {
  micro_expression: 4,
  protective_mode: 0,
  comfort_pulse: 2,
  memory_spark: 500,
  warmth_bloom: 7,
  celebrate_growth: 1,
  cameo_arrival: 3,
  crisis_hold: 1,
  name_lift_brighten: 2,
  name_lift_attentive: 0,
  name_lift_comfort: 5,
};
const ok = (body: unknown) => soulStatsBodySchema.safeParse(body).success;
const withCount = (key: string, value: unknown) => ({ counts: { ...counts, [key]: value } });

describe('the soul stats body', () => {
  it('names every avatar moment, in this order', () => {
    expect(SOUL_COUNT_KEYS).toEqual([
      'micro_expression',
      'protective_mode',
      'comfort_pulse',
      'memory_spark',
      'warmth_bloom',
      'celebrate_growth',
      'cameo_arrival',
      'crisis_hold',
      'name_lift_brighten',
      'name_lift_attentive',
      'name_lift_comfort',
    ]);
  });

  it('takes the eleven counts, 0 and 500 included, values unchanged', () => {
    expect(soulStatsBodySchema.parse({ counts })).toEqual({ counts });
  });

  it('takes all eleven at 500, and that body is under the 1 KB cap', () => {
    const full = { counts: Object.fromEntries(SOUL_COUNT_KEYS.map((k) => [k, 500])) };
    expect(ok(full)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(full))).toBeLessThan(SOUL_STATS_LIMITS.maxBodyBytes);
  });

  it('refuses a twelfth key', () => {
    expect(ok(withCount('name_lift_other', 1))).toBe(false);
    expect(ok(withCount('confetti', 0))).toBe(false);
  });

  it('refuses an unknown key at the top and inside counts (no trigger, session, uid or text)', () => {
    expect(ok({ counts, uid: 'u1' })).toBe(false);
    expect(ok({ counts, sessionId: 's1' })).toBe(false);
    expect(ok(withCount('trigger', 1))).toBe(false);
    expect(ok({ counts: { ...counts, note: 'hello' } })).toBe(false);
  });

  it('refuses a negative count and one above 500, for a new key too', () => {
    expect(ok(withCount('comfort_pulse', -1))).toBe(false);
    expect(ok(withCount('memory_spark', 501))).toBe(false);
    expect(ok(withCount('crisis_hold', 501))).toBe(false);
    expect(ok(withCount('name_lift_comfort', -1))).toBe(false);
  });

  it('refuses a non-integer, a string, NaN or Infinity', () => {
    expect(ok(withCount('micro_expression', 1.5))).toBe(false);
    expect(ok(withCount('micro_expression', '3'))).toBe(false);
    expect(ok(withCount('micro_expression', Number.NaN))).toBe(false);
    expect(ok(withCount('warmth_bloom', Number.POSITIVE_INFINITY))).toBe(false);
  });

  it('refuses a missing count (an old four-key body too), null, and a body without counts', () => {
    const { name_lift_comfort: _dropped, ...ten } = counts;
    expect(ok({ counts: ten })).toBe(false);
    const old = { micro_expression: 1, protective_mode: 0, comfort_pulse: 0, memory_spark: 0 };
    expect(ok({ counts: old })).toBe(false);
    expect(ok(withCount('protective_mode', null))).toBe(false);
    expect(ok({})).toBe(false);
  });
});
