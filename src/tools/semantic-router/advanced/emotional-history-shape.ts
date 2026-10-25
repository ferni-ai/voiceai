/**
 * What an emotional_history data point may hold: the emotion label, its scores,
 * where it came from and when.
 *
 * Older entries also carried `context`: up to 100 characters of what the caller
 * said (voice routing until #2754, and whatever a client sent to
 * POST /api/intelligence/record-emotion). Nothing reads it. Loading, saving and
 * the one-off cleanup (scripts/migrations/strip-emotional-history-snippets.ts)
 * keep only these keys, so a snippet in a stored document, a truncated slice of
 * one, or one nested under some other key never enters memory and is never
 * written back.
 */

export const STORED_POINT_KEYS = [
  'timestamp',
  'emotion',
  'intensity',
  'valence',
  'source',
] as const;

export type StoredPoint = Partial<Record<(typeof STORED_POINT_KEYS)[number], unknown>>;

/** The data point with only the kept keys; null for an entry that is not an object. */
export function keepStoredFields(raw: unknown): StoredPoint | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: StoredPoint = {};
  for (const key of STORED_POINT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = (raw as Record<string, unknown>)[key];
    }
  }
  return out;
}

/**
 * Every data point with only the kept keys. `stripped` counts the entries that
 * lost a key or were dropped for not being an object; 0 means nothing changed.
 */
export function stripDataPoints(raw: readonly unknown[]): {
  points: StoredPoint[];
  stripped: number;
} {
  let stripped = 0;
  const points: StoredPoint[] = [];
  for (const entry of raw) {
    const kept = keepStoredFields(entry);
    if (!kept) {
      stripped++;
      continue;
    }
    if (Object.keys(entry as object).length !== Object.keys(kept).length) stripped++;
    points.push(kept);
  }
  return { points, stripped };
}
