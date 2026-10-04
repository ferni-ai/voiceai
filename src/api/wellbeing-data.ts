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

/** Longest window any wellbeing route reads (the "quarter" trend). */
export const MAX_WELLBEING_DAYS = 90;

export interface WellbeingData {
  profile: WellbeingProfile | null;
  /** Newest first, covering the last {@link MAX_WELLBEING_DAYS} days. */
  snapshots: WellbeingSnapshot[];
  /** The latest snapshot, or null when the user has no wellbeing data. */
  current: WellbeingSnapshot | null;
}

export interface DashboardCurrentState {
  mood: number | null;
  energy: number | null;
  anxiety: number | null;
  connection: number | null;
  purpose: number | null;
  sleep: number | null;
  lastUpdated: string;
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

/** Load a user's persisted wellbeing profile and recent snapshots. */
export async function loadWellbeingData(userId: string): Promise<WellbeingData> {
  const { loadProfile, loadSnapshots } =
    await import('../services/wellbeing-tracking/persistence.js');
  const { getRecentSnapshots, getAllWellbeingProfiles } =
    await import('../services/wellbeing-tracking/index.js');

  let [profile, snapshots] = await Promise.all([
    loadProfile(userId),
    loadSnapshots(userId, MAX_WELLBEING_DAYS),
  ]);

  if (!profile && snapshots.length === 0) {
    // Nothing persisted: use what this process recorded itself, if anything.
    // (getWellbeingProfile would create and cache an empty profile, so look it up.)
    snapshots = getRecentSnapshots(userId, MAX_WELLBEING_DAYS);
    profile = getAllWellbeingProfiles().find((p) => p.userId === userId) ?? null;
  }

  const sorted = [...snapshots].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const current = profile?.current ?? sorted[0] ?? null;
  return { profile, snapshots: sorted, current };
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
