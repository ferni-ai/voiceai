/**
 * What an emotional_history data point may hold: an emotion label from a fixed
 * list, two scores in range, where it came from and when. Nothing else.
 *
 * Older entries also carried `context`: up to 100 characters of what the caller
 * said (voice routing until #2754, and whatever a client sent to
 * POST /api/intelligence/record-emotion). Loading, saving, the record route and
 * the one-off cleanup (scripts/migrations/strip-emotional-history-snippets.ts)
 * all go through `toStoredPoint`, so no text reaches memory or Firestore under
 * any key: a label that isn't on the list, a score that is a string, an object
 * under a kept key, each makes the point invalid.
 *
 * A point without a valid time is dropped rather than given the server's time:
 * stamping it "now" would invent a feeling at a moment it wasn't felt and bend
 * the arc and its trend. Dropping it never blocks the other points.
 */

import {
  boundedNumber,
  emotionLabel,
  ownField,
  sameFields,
  validTimestamp,
} from '../../../utils/emotion-point-fields.js';

export const EMOTION_SOURCES = ['voice', 'text', 'inferred'] as const;
export type EmotionSource = (typeof EMOTION_SOURCES)[number];

export interface StoredPoint {
  timestamp: string;
  emotion: string;
  intensity: number;
  valence: number;
  source: EmotionSource;
}

/** Points older than this are not kept (the in-memory window is the same). */
export const RETENTION_MS = 30 * 24 * 3_600_000;
/** Newest points kept per person, so the document stays far under 1 MiB. */
export const MAX_STORED_POINTS = 1000;

/**
 * The point with only typed, bounded values; null when it can't be kept. A
 * missing source reads as 'inferred', as the record route has always defaulted.
 */
export function toStoredPoint(raw: unknown, now = Date.now()): StoredPoint | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const timestamp = validTimestamp(ownField(raw, 'timestamp'), now);
  const emotion = emotionLabel(ownField(raw, 'emotion'));
  const intensity = boundedNumber(ownField(raw, 'intensity'), 0, 1);
  const valence = boundedNumber(ownField(raw, 'valence'), -1, 1);
  const source = ownField(raw, 'source') ?? 'inferred';
  if (!timestamp || !emotion || intensity === null || valence === null) return null;
  if (!(EMOTION_SOURCES as readonly unknown[]).includes(source)) return null;
  return { timestamp, emotion, intensity, valence, source: source as EmotionSource };
}

/**
 * Every entry that can be kept, in its stored form. `stripped` counts entries
 * that changed or were dropped; 0 means the stored array is already clean.
 */
export function stripDataPoints(
  raw: readonly unknown[],
  now = Date.now()
): { points: StoredPoint[]; stripped: number } {
  let stripped = 0;
  const points: StoredPoint[] = [];
  for (const entry of raw) {
    const kept = toStoredPoint(entry, now);
    if (!kept || !sameFields(entry as object, { ...kept })) stripped++;
    if (kept) points.push(kept);
  }
  return { points, stripped };
}

/**
 * Stored and new points together, oldest first: each point once, none past the
 * retention window, at most MAX_STORED_POINTS (the newest).
 */
export function mergePoints(
  stored: readonly unknown[],
  fresh: readonly unknown[],
  now = Date.now()
): StoredPoint[] {
  const byKey = new Map<string, StoredPoint>();
  for (const p of stripDataPoints([...stored, ...fresh], now).points) {
    if (Date.parse(p.timestamp) < now - RETENTION_MS) continue;
    byKey.set(`${p.timestamp}|${p.emotion}|${p.intensity}|${p.valence}|${p.source}`, p);
  }
  return [...byKey.values()]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-MAX_STORED_POINTS);
}
