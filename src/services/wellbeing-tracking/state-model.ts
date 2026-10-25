/**
 * How someone is doing, per field, from every time it came up: a
 * recency-weighted estimate, not the latest snapshot.
 *
 * Each observation counts by its confidence times an exponential decay with a
 * 7-day half-life, so last week's "wiped out" still counts, last month's barely
 * does, and an old saved profile never outweighs newer calls. A field nobody
 * talked about has no estimate at all: it is left out, never filled in.
 * A direction (rising / steady / falling) is given only once a field came up at
 * least 3 times over at least 5 days; before that, one hard day isn't a trend.
 * Plain numbers and dates only: no labels, no diagnoses.
 *
 * Pure: the caller passes the snapshots and "now".
 *
 * @module services/wellbeing-tracking/state-model
 */
import type { WellbeingDimensions, WellbeingSnapshot } from './index.js';

export const HALF_LIFE_DAYS = 7;
export const DIRECTION_MIN_OBSERVATIONS = 3;
export const DIRECTION_MIN_SPAN_DAYS = 5;
/** Change across the observed span, on the 0-1 scale, that counts as rising or falling. */
export const DIRECTION_MIN_CHANGE = 0.1;
/** Used when a snapshot carries no confidence for the field. */
export const DEFAULT_CONFIDENCE = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type Direction = 'rising' | 'steady' | 'falling';

export interface FieldEstimate {
  /** 0 to 1, on the field's own scale. */
  value: number;
  /** When the field last came up (ISO). */
  asOf: string;
  /** How many times it came up. */
  observations: number;
  /** null until DIRECTION_MIN_OBSERVATIONS over DIRECTION_MIN_SPAN_DAYS. */
  direction: Direction | null;
}

export type WellbeingEstimates = Partial<Record<keyof WellbeingDimensions, FieldEstimate>>;

interface Observation {
  t: number;
  value: number;
  confidence: number;
}

/** Snapshots may repeat (profile.current is also in the list): one observation per snapshot id. */
function observationsByField(
  snapshots: readonly WellbeingSnapshot[]
): Map<keyof WellbeingDimensions, Observation[]> {
  const seen = new Set<string>();
  const out = new Map<keyof WellbeingDimensions, Observation[]>();
  for (const s of snapshots) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const t = s.timestamp.getTime();
    if (!Number.isFinite(t)) continue;
    for (const [key, value] of Object.entries(s.dimensions) as Array<
      [keyof WellbeingDimensions, unknown]
    >) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const c = s.confidence?.[key];
      const confidence =
        typeof c === 'number' && Number.isFinite(c)
          ? Math.min(1, Math.max(0, c))
          : DEFAULT_CONFIDENCE;
      const list = out.get(key) ?? [];
      list.push({ t, value, confidence });
      out.set(key, list);
    }
  }
  return out;
}

/** Confidence-weighted least-squares slope (per day) times the span: the change across it. */
function direction(obs: readonly Observation[]): Direction | null {
  if (obs.length < DIRECTION_MIN_OBSERVATIONS) return null;
  const first = Math.min(...obs.map((o) => o.t));
  const last = Math.max(...obs.map((o) => o.t));
  const spanDays = (last - first) / DAY_MS;
  if (spanDays < DIRECTION_MIN_SPAN_DAYS) return null;
  const w = obs.reduce((sum, o) => sum + o.confidence, 0);
  if (w <= 0) return null;
  const meanX = obs.reduce((sum, o) => sum + o.confidence * ((o.t - first) / DAY_MS), 0) / w;
  const meanY = obs.reduce((sum, o) => sum + o.confidence * o.value, 0) / w;
  let num = 0;
  let den = 0;
  for (const o of obs) {
    const dx = (o.t - first) / DAY_MS - meanX;
    num += o.confidence * dx * (o.value - meanY);
    den += o.confidence * dx * dx;
  }
  if (den === 0) return 'steady';
  const change = (num / den) * spanDays;
  if (change >= DIRECTION_MIN_CHANGE) return 'rising';
  if (change <= -DIRECTION_MIN_CHANGE) return 'falling';
  return 'steady';
}

/** The estimate for every field that came up; fields that never did are absent. */
export function estimateWellbeing(
  snapshots: readonly WellbeingSnapshot[],
  now: Date
): WellbeingEstimates {
  const estimates: WellbeingEstimates = {};
  for (const [key, obs] of observationsByField(snapshots)) {
    let weight = 0;
    let sum = 0;
    for (const o of obs) {
      const ageDays = Math.max(0, (now.getTime() - o.t) / DAY_MS);
      const w = o.confidence * 0.5 ** (ageDays / HALF_LIFE_DAYS);
      weight += w;
      sum += w * o.value;
    }
    if (weight <= 0) continue; // only zero-confidence mentions: nothing to stand on
    estimates[key] = {
      value: Math.round((sum / weight) * 1e6) / 1e6, // no 0.8999999 for a single 0.9
      asOf: new Date(Math.max(...obs.map((o) => o.t))).toISOString(),
      observations: obs.length,
      direction: direction(obs),
    };
  }
  return estimates;
}
