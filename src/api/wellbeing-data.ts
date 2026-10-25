/**
 * Wellbeing data for the dashboard API.
 *
 * The voice agent records wellbeing snapshots in its own process and persists
 * them to Firestore; the API server is a different process, so its in-memory
 * profile is always empty. This module reads the persisted data (falling back
 * to this process's memory when Firestore has nothing, e.g. local dev), and
 * builds dashboard responses that say "no data" instead of inventing neutral
 * 0.5 scores.
 *
 * @module api/wellbeing-data
 */

import type {
  WellbeingDimensions,
  WellbeingProfile,
  WellbeingSnapshot,
} from '../services/wellbeing-tracking/index.js';
import {
  estimateWellbeing,
  type Direction,
  type WellbeingEstimates,
} from '../services/wellbeing-tracking/state-model.js';
import { flagOn } from '../config/env-flag.js';

/** Longest window any wellbeing route reads (the "quarter" trend). */
export const MAX_WELLBEING_DAYS = 90;

export interface WellbeingData {
  profile: WellbeingProfile | null;
  /** Newest first, covering the last {@link MAX_WELLBEING_DAYS} days. */
  snapshots: WellbeingSnapshot[];
  /** The latest snapshot, or null when the user has no wellbeing data. */
  current: WellbeingSnapshot | null;
  /** Per field, the recency-weighted estimate; only read when WELLBEING_FIELD_ESTIMATES is on. */
  estimates?: WellbeingEstimates;
}

/** The panel's fields, and the stored dimension each one reads. */
const PANEL_FIELDS = {
  mood: 'mood',
  energy: 'energy',
  anxiety: 'worry',
  connection: 'loneliness',
  purpose: 'meaningfulness',
  sleep: 'sleepQuality',
} as const;
type PanelField = keyof typeof PANEL_FIELDS;

/** When a field last came up, how often, and which way it is going (null: not enough history). */
export interface PanelFieldInfo {
  asOf: string;
  observations: number;
  direction: Direction | null;
}

export interface DashboardCurrentState {
  mood: number | null;
  energy: number | null;
  anxiety: number | null;
  connection: number | null;
  purpose: number | null;
  sleep: number | null;
  lastUpdated: string;
  /** Present only with WELLBEING_FIELD_ESTIMATES on. null: nobody has talked about that field. */
  fields?: Record<PanelField, PanelFieldInfo | null>;
}

export interface DashboardResponse {
  userId: string;
  hasData: boolean;
  currentState: DashboardCurrentState | null;
  trends: {
    period: 'week' | 'month';
    direction: 'improving' | 'stable' | 'declining';
    changedDimensions: string[];
  };
  insights: Array<{
    type: 'pattern' | 'suggestion' | 'celebration';
    message: string;
    dimension?: string;
  }>;
  warnings: Array<{
    type: string;
    severity: 'watch' | 'concern' | 'urgent';
    message: string;
  }>;
  streaks: {
    currentDays: number;
    bestDays: number;
    lastCheckIn: string;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Snapshots from the last `days` days (input is newest first). */
export function snapshotsWithin(snapshots: WellbeingSnapshot[], days: number): WellbeingSnapshot[] {
  const cutoff = Date.now() - days * DAY_MS;
  return snapshots.filter((s) => s.timestamp.getTime() >= cutoff);
}

/**
 * Load a user's persisted wellbeing profile and recent snapshots. A failed read
 * throws (the routes answer 500 and the panel shows its error state) rather
 * than reading as "no data yet".
 */
export async function loadWellbeingData(userId: string): Promise<WellbeingData> {
  const { loadProfile, loadSnapshots } =
    await import('../services/wellbeing-tracking/persistence.js');
  const { getRecentSnapshots, getAllWellbeingProfiles } =
    await import('../services/wellbeing-tracking/index.js');

  let [profile, snapshots] = await Promise.all([
    loadProfile(userId, { rethrow: true }),
    loadSnapshots(userId, MAX_WELLBEING_DAYS, { rethrow: true }),
  ]);

  if (!profile && snapshots.length === 0) {
    // Nothing persisted: use what this process recorded itself, if anything.
    // (getWellbeingProfile would create and cache an empty profile, so look it up.)
    snapshots = getRecentSnapshots(userId, MAX_WELLBEING_DAYS);
    profile = getAllWellbeingProfiles().find((p) => p.userId === userId) ?? null;
  }

  const sorted = [...snapshots].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  // The profile's pointer lags behind snapshots written after it (the after-call task writes
  // a snapshot without moving the pointer), so the newer of the two is the current state.
  const latest = sorted[0] ?? null;
  const pointed = profile?.current ?? null;
  const current = pointed && (!latest || pointed.timestamp >= latest.timestamp) ? pointed : latest;
  if (!flagOn('WELLBEING_FIELD_ESTIMATES')) return { profile, snapshots: sorted, current };
  // The saved profile joins the estimate as one more (decayed) observation, never as the answer.
  const all = profile?.current ? [...sorted, profile.current] : sorted;
  return { profile, snapshots: sorted, current, estimates: estimateWellbeing(all, new Date()) };
}

const FLIPPED: Record<Direction, Direction> = {
  rising: 'falling',
  falling: 'rising',
  steady: 'steady',
};

/** Each panel field from its estimate; connection is shown as 1 minus loneliness. */
function panelFields(estimates: WellbeingEstimates): Record<PanelField, PanelFieldInfo | null> {
  const out = {} as Record<PanelField, PanelFieldInfo | null>;
  for (const field of Object.keys(PANEL_FIELDS) as PanelField[]) {
    const e = estimates[PANEL_FIELDS[field]];
    if (!e) {
      out[field] = null;
      continue;
    }
    const invert = field === 'connection';
    out[field] = {
      asOf: e.asOf,
      observations: e.observations,
      direction: invert && e.direction ? FLIPPED[e.direction] : e.direction,
    };
  }
  return out;
}

function dim(
  dimensions: Partial<WellbeingDimensions>,
  key: keyof WellbeingDimensions
): number | null {
  const value = dimensions[key];
  return typeof value === 'number' ? value : null;
}

function trendDirection(
  profile: WellbeingProfile | null
): DashboardResponse['trends']['direction'] {
  const trends = profile?.weeklyTrends ?? [];
  const up = trends.filter((t) => t.direction === 'improving').length;
  const down = trends.filter((t) => t.direction === 'declining').length;
  return up > down ? 'improving' : down > up ? 'declining' : 'stable';
}

function buildInsights(state: DashboardCurrentState): DashboardResponse['insights'] {
  const insights: DashboardResponse['insights'] = [];
  if (state.mood !== null && state.mood > 0.7) {
    insights.push({
      type: 'celebration',
      message: 'Your mood has been great lately!',
      dimension: 'mood',
    });
  }
  if (state.anxiety !== null && state.anxiety < 0.3) {
    insights.push({
      type: 'celebration',
      message: 'Anxiety seems well-managed.',
      dimension: 'anxiety',
    });
  }
  if (state.sleep !== null && state.sleep < 0.4) {
    insights.push({
      type: 'pattern',
      message: 'Sleep quality has been low lately.',
      dimension: 'sleep',
    });
  }
  if (state.connection !== null && state.connection < 0.4) {
    insights.push({
      type: 'suggestion',
      message: 'Connection feels low - reaching out might help.',
      dimension: 'connection',
    });
  }
  return insights;
}

/**
 * Build the dashboard response. With no snapshot it reports `hasData: false`
 * and `currentState: null`; dimensions that were never measured are null,
 * not a neutral 0.5.
 */
export function buildDashboardResponse(
  userId: string,
  data: WellbeingData,
  warnings: DashboardResponse['warnings']
): DashboardResponse {
  const week = snapshotsWithin(data.snapshots, 7);
  const uniqueDays = new Set(week.map((s) => s.timestamp.toISOString().split('T')[0]));
  const streaks = {
    currentDays: uniqueDays.size,
    bestDays: uniqueDays.size,
    lastCheckIn: data.snapshots[0]?.timestamp.toISOString() ?? '',
  };
  const trends = {
    period: 'week' as const,
    direction: trendDirection(data.profile),
    changedDimensions: (data.profile?.weeklyTrends ?? [])
      .filter((t) => t.direction !== 'stable')
      .map((t) => t.dimension),
  };

  if (!data.current) {
    return {
      userId,
      hasData: false,
      currentState: null,
      trends,
      insights: [],
      warnings: [],
      streaks,
    };
  }

  const d = data.current.dimensions;
  const loneliness = dim(d, 'loneliness');
  const currentState: DashboardCurrentState = {
    mood: dim(d, 'mood'),
    energy: dim(d, 'energy'),
    anxiety: dim(d, 'worry'),
    connection: loneliness === null ? null : 1 - loneliness,
    purpose: dim(d, 'meaningfulness'),
    sleep: dim(d, 'sleepQuality'),
    lastUpdated: data.current.timestamp.toISOString(),
  };
  if (data.estimates) currentState.fields = panelFields(data.estimates);

  return {
    userId,
    hasData: true,
    currentState,
    trends,
    insights: buildInsights(currentState),
    warnings,
    streaks,
  };
}
