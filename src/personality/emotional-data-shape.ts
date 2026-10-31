/**
 * What an emotional_data/{uid}/points document may hold: an emotion label from
 * a fixed list, its intensity, and when. Nothing else.
 *
 * Older points also carried `context` (userText.slice(0, 100): what the caller
 * said) and `topics`. Saving, loading and the one-off cleanup
 * (scripts/migrations/strip-emotional-data-snippets.ts) all go through
 * `toStoredDataPoint`, so neither reaches Firestore or memory again. Topics stay
 * in memory for pattern analysis; nothing reads them from this collection.
 */

import {
  boundedNumber,
  emotionLabel,
  ownField,
  sameFields,
  validTimestamp,
} from '../utils/emotion-point-fields.js';

export interface StoredDataPoint {
  timestamp: string;
  emotion: string;
  intensity: number;
  /** When the point was written, if it says. */
  createdAt?: string;
}

/** The point with only typed, bounded values; null when it can't be kept. */
export function toStoredDataPoint(raw: unknown, now = Date.now()): StoredDataPoint | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const timestamp = validTimestamp(ownField(raw, 'timestamp'), now);
  const emotion = emotionLabel(ownField(raw, 'emotion'));
  const intensity = boundedNumber(ownField(raw, 'intensity'), 0, 1);
  if (!timestamp || !emotion || intensity === null) return null;
  const createdAt = validTimestamp(ownField(raw, 'createdAt'), now);
  return createdAt
    ? { timestamp, emotion, intensity, createdAt }
    : { timestamp, emotion, intensity };
}

/**
 * What the cleanup does with one stored point: keep it as is, rewrite it to
 * the kept fields, or delete it (no valid time, label or intensity).
 */
export function planDataPoint(
  raw: unknown,
  now = Date.now()
): { action: 'keep' } | { action: 'rewrite'; point: StoredDataPoint } | { action: 'delete' } {
  const point = toStoredDataPoint(raw, now);
  if (!point) return { action: 'delete' };
  return sameFields(raw as object, { ...point })
    ? { action: 'keep' }
    : { action: 'rewrite', point };
}
