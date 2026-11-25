/**
 * What a browser sends to POST /api/soul-stats: how many times each avatar soul
 * response played since its last send. Counts only: no trigger name, session id,
 * uid or text, and every object strict, so nothing else can ride along.
 *
 * @module api/soul-stats/soul-stats-input
 */
import { z } from 'zod';

export const SOUL_STATS_LIMITS = { maxBodyBytes: 1024, maxCount: 500 } as const;

/** The four counted responses, as the browser names them. */
export const SOUL_COUNT_KEYS = [
  'micro_expression',
  'protective_mode',
  'comfort_pulse',
  'memory_spark',
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
  }),
});
