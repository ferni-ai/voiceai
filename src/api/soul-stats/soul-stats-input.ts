/**
 * What a browser sends to POST /api/soul-stats: how many times each avatar soul
 * moment played since its last send. Counts only: no trigger name, session id,
 * uid or text, and every object strict, so nothing else can ride along.
 *
 * @module api/soul-stats/soul-stats-input
 */
import { z } from 'zod';

export const SOUL_STATS_LIMITS = { maxBodyBytes: 1024, maxCount: 500 } as const;

/** Every counted avatar moment, as the browser names it. */
export const SOUL_COUNT_KEYS = [
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
] as const;
type SoulCountKey = (typeof SOUL_COUNT_KEYS)[number];
export type SoulCounts = Record<SoulCountKey, number>;

const count = z.number().int().min(0).max(SOUL_STATS_LIMITS.maxCount);

export const soulStatsBodySchema = z.strictObject({
  counts: z.strictObject({
    micro_expression: count,
    protective_mode: count,
    comfort_pulse: count,
    memory_spark: count,
    warmth_bloom: count,
    celebrate_growth: count,
    cameo_arrival: count,
    crisis_hold: count,
    name_lift_brighten: count,
    name_lift_attentive: count,
    name_lift_comfort: count,
  }),
});
