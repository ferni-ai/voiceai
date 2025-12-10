/**
 * Wellbeing API Routes
 *
 * REST API endpoints for the wellbeing dashboard:
 * - GET /api/wellbeing/dashboard - Full dashboard data
 * - GET /api/wellbeing/trends - Trend analysis over time
 * - GET /api/wellbeing/insights - Personalized insights
 * - POST /api/wellbeing/snapshot - Manual wellbeing check-in
 *
 * @module WellbeingRoutes
 */

import type { Request, Response, Router } from 'express';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'WellbeingRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface DashboardResponse {
  userId: string;
  currentState: {
    mood: number;
    energy: number;
    anxiety: number;
    connection: number;
    purpose: number;
    sleep: number;
    lastUpdated: string;
  };
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

interface TrendsResponse {
  userId: string;
  period: 'week' | 'month' | 'quarter';
  dataPoints: Array<{
    date: string;
    mood: number | null;
    energy: number | null;
    anxiety: number | null;
    connection: number | null;
    purpose: number | null;
    sleep: number | null;
  }>;
  averages: {
    mood: number;
    energy: number;
    anxiety: number;
    connection: number;
    purpose: number;
    sleep: number;
  };
  correlations: Array<{
    dimension1: string;
    dimension2: string;
    correlation: number;
    insight: string;
  }>;
}

interface InsightsResponse {
  userId: string;
  patterns: Array<{
    type: string;
    description: string;
    frequency: string;
    suggestion: string;
  }>;
  celebrations: Array<{
    achievement: string;
    date: string;
    dimension: string;
  }>;
  recommendations: Array<{
    action: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

interface SnapshotRequest {
  mood?: number;
  energy?: number;
  anxiety?: number;
  connection?: number;
  purpose?: number;
  sleep?: number;
  note?: string;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/wellbeing/dashboard
 * Returns comprehensive wellbeing dashboard data
 */
async function getDashboard(req: Request, res: Response): Promise<void> {
  const userId = req.query.userId as string;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const { getWellbeingProfile, getRecentSnapshots } =
      await import('../services/wellbeing-tracking/index.js');
    const { checkWarnings } = await import('../services/wellbeing-tracking/early-warning.js');

    const profile = getWellbeingProfile(userId);
    const recentSnapshots = getRecentSnapshots(userId, 7);
    const warnings = checkWarnings(profile as WBProfile);

    // Convert to simple format
    const simpleSnapshots = recentSnapshots.map(toSimpleSnapshot);

    // Calculate current state from recent snapshots
    const currentState = calculateCurrentState(simpleSnapshots);

    // Calculate trends
    const trends = calculateTrends(simpleSnapshots);

    // Generate insights
    const insights = generateInsights(simpleSnapshots);

    // Calculate streaks
    const streaks = calculateStreaks(simpleSnapshots);

    const response: DashboardResponse = {
      userId,
      currentState,
      trends,
      insights,
      warnings: warnings.map((w: EarlyWarning) => ({
        type: w.type,
        severity: w.severity,
        message: w.recommendations?.forUser?.[0] || `Warning: ${w.type}`,
      })),
      streaks,
    };

    log.debug({ userId, warnings: warnings.length }, 'Dashboard data retrieved');
    res.json(response);
  } catch (error) {
    log.error({ error, userId }, 'Failed to get dashboard');
    res.status(500).json({ error: 'Failed to retrieve dashboard data' });
  }
}

/**
 * GET /api/wellbeing/trends
 * Returns trend data over specified period
 */
async function getTrends(req: Request, res: Response): Promise<void> {
  const userId = req.query.userId as string;
  const period = (req.query.period as 'week' | 'month' | 'quarter') || 'week';

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const { getRecentSnapshots } = await import('../services/wellbeing-tracking/index.js');

    const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
    const rawSnapshots = getRecentSnapshots(userId, days);
    const snapshots = rawSnapshots.map(toSimpleSnapshot);

    // Group by date
    const dataPoints = groupSnapshotsByDate(snapshots);

    // Calculate averages
    const averages = calculateAverages(snapshots);

    // Find correlations
    const correlations = findCorrelations(snapshots);

    const response: TrendsResponse = {
      userId,
      period,
      dataPoints,
      averages,
      correlations,
    };

    res.json(response);
  } catch (error) {
    log.error({ error, userId }, 'Failed to get trends');
    res.status(500).json({ error: 'Failed to retrieve trends' });
  }
}

/**
 * GET /api/wellbeing/insights
 * Returns personalized insights and recommendations
 */
async function getInsights(req: Request, res: Response): Promise<void> {
  const userId = req.query.userId as string;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const { getWellbeingProfile, getRecentSnapshots } =
      await import('../services/wellbeing-tracking/index.js');

    const profile = getWellbeingProfile(userId);
    const rawSnapshots = getRecentSnapshots(userId, 30);
    const snapshots = rawSnapshots.map(toSimpleSnapshot);

    // Analyze patterns
    const patterns = analyzePatterns(snapshots);

    // Find celebrations
    const celebrations = findCelebrations(snapshots);

    // Generate recommendations
    const recommendations = generateRecommendations(snapshots);

    const response: InsightsResponse = {
      userId,
      patterns,
      celebrations,
      recommendations,
    };

    res.json(response);
  } catch (error) {
    log.error({ error, userId }, 'Failed to get insights');
    res.status(500).json({ error: 'Failed to retrieve insights' });
  }
}

/**
 * POST /api/wellbeing/snapshot
 * Record a manual wellbeing check-in
 */
async function postSnapshot(req: Request, res: Response): Promise<void> {
  const userId = (req.query.userId as string) || (req.body.userId as string);
  const snapshot: SnapshotRequest = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  // Validate dimensions are 0-1
  const dimensions = ['mood', 'energy', 'anxiety', 'connection', 'purpose', 'sleep'] as const;
  for (const dim of dimensions) {
    const value = snapshot[dim];
    if (value !== undefined && (value < 0 || value > 1)) {
      res.status(400).json({ error: `${dim} must be between 0 and 1` });
      return;
    }
  }

  try {
    const { recordSnapshot } = await import('../services/wellbeing-tracking/index.js');

    const recorded = recordSnapshot(
      userId,
      {
        mood: snapshot.mood,
        energy: snapshot.energy,
        worry: snapshot.anxiety, // Map anxiety to worry
        loneliness: snapshot.connection !== undefined ? 1 - snapshot.connection : undefined, // Invert connection to loneliness
        meaningfulness: snapshot.purpose,
        sleepQuality: snapshot.sleep,
      },
      { source: 'self_reported', notes: snapshot.note }
    );

    log.info({ userId, dimensions: Object.keys(snapshot) }, 'Wellbeing snapshot recorded');
    res.json({ success: true, snapshot: recorded });
  } catch (error) {
    log.error({ error, userId }, 'Failed to record snapshot');
    res.status(500).json({ error: 'Failed to record snapshot' });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Re-use types from the wellbeing module
import type {
  WellbeingSnapshot as WBSnapshot,
  WellbeingProfile as WBProfile,
} from '../services/wellbeing-tracking/index.js';
import type { EarlyWarning } from '../services/wellbeing-tracking/early-warning.js';

// Simplified snapshot for API responses
interface WellbeingSnapshotSimple {
  timestamp: Date;
  dimensions: {
    mood?: number;
    energy?: number;
    worry?: number;
    loneliness?: number;
    meaningfulness?: number;
    sleepQuality?: number;
  };
}

function calculateCurrentState(
  snapshots: WellbeingSnapshotSimple[]
): DashboardResponse['currentState'] {
  if (snapshots.length === 0) {
    return {
      mood: 0.5,
      energy: 0.5,
      anxiety: 0.5,
      connection: 0.5,
      purpose: 0.5,
      sleep: 0.5,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Use most recent snapshot, weighted
  const recent = snapshots.slice(0, 3);
  const weights = [0.5, 0.3, 0.2];

  const dimensions = [
    'mood',
    'energy',
    'worry',
    'loneliness',
    'meaningfulness',
    'sleepQuality',
  ] as const;
  const outputMap: Record<string, string> = {
    worry: 'anxiety',
    loneliness: 'connection',
    meaningfulness: 'purpose',
    sleepQuality: 'sleep',
  };
  const result: Record<string, number> = {};

  for (const dim of dimensions) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < recent.length; i++) {
      const value = recent[i].dimensions[dim];
      if (value !== undefined) {
        weightedSum += value * weights[i];
        totalWeight += weights[i];
      }
    }

    const outputKey = outputMap[dim] || dim;
    let finalValue = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
    // Invert loneliness to connection
    if (dim === 'loneliness') {
      finalValue = 1 - finalValue;
    }
    result[outputKey] = finalValue;
  }

  return {
    mood: result.mood ?? 0.5,
    energy: result.energy ?? 0.5,
    anxiety: result.anxiety ?? 0.5,
    connection: result.connection ?? 0.5,
    purpose: result.purpose ?? 0.5,
    sleep: result.sleep ?? 0.5,
    lastUpdated: recent[0]?.timestamp?.toISOString() || new Date().toISOString(),
  };
}

function calculateTrends(snapshots: WellbeingSnapshotSimple[]): DashboardResponse['trends'] {
  if (snapshots.length < 3) {
    return { period: 'week', direction: 'stable', changedDimensions: [] };
  }

  // Map output dimension name to internal dimension name and whether lower is better
  const dimensionMap: Array<{
    output: string;
    internal: keyof WellbeingSnapshotSimple['dimensions'];
    lowerIsBetter: boolean;
  }> = [
    { output: 'mood', internal: 'mood', lowerIsBetter: false },
    { output: 'energy', internal: 'energy', lowerIsBetter: false },
    { output: 'anxiety', internal: 'worry', lowerIsBetter: true },
    { output: 'connection', internal: 'loneliness', lowerIsBetter: true }, // Lower loneliness = higher connection
    { output: 'purpose', internal: 'meaningfulness', lowerIsBetter: false },
    { output: 'sleep', internal: 'sleepQuality', lowerIsBetter: false },
  ];

  const changedDimensions: string[] = [];
  let improving = 0;
  let declining = 0;

  for (const { output, internal, lowerIsBetter } of dimensionMap) {
    const recent = snapshots.slice(0, 3);
    const older = snapshots.slice(-3);

    const recentAvg = average(
      recent.map((s) => s.dimensions[internal]).filter(Boolean) as number[]
    );
    const olderAvg = average(older.map((s) => s.dimensions[internal]).filter(Boolean) as number[]);

    const diff = recentAvg - olderAvg;
    if (Math.abs(diff) > 0.1) {
      changedDimensions.push(output);
      if (lowerIsBetter) {
        // Lower is better (anxiety, loneliness)
        if (diff < 0) improving++;
        else declining++;
      } else {
        if (diff > 0) improving++;
        else declining++;
      }
    }
  }

  const direction =
    improving > declining ? 'improving' : declining > improving ? 'declining' : 'stable';

  return { period: 'week', direction, changedDimensions };
}

function generateInsights(snapshots: WellbeingSnapshotSimple[]): DashboardResponse['insights'] {
  const insights: DashboardResponse['insights'] = [];

  if (snapshots.length < 3) {
    insights.push({
      type: 'suggestion',
      message: 'Keep checking in! With more data, we can spot patterns together.',
    });
    return insights;
  }

  // Check for improvements
  const currentState = calculateCurrentState(snapshots);

  if (currentState.mood > 0.7) {
    insights.push({
      type: 'celebration',
      message: 'Your mood has been great lately! 🎉',
      dimension: 'mood',
    });
  }

  if (currentState.anxiety !== undefined && currentState.anxiety < 0.3) {
    insights.push({
      type: 'celebration',
      message: 'Anxiety seems well-managed right now.',
      dimension: 'anxiety',
    });
  }

  if (currentState.sleep !== undefined && currentState.sleep < 0.4) {
    insights.push({
      type: 'pattern',
      message: 'Sleep quality has been low - this often affects energy and mood.',
      dimension: 'sleep',
    });
  }

  if (currentState.connection < 0.4) {
    insights.push({
      type: 'suggestion',
      message: 'Connection feels low - reaching out to someone might help.',
      dimension: 'connection',
    });
  }

  return insights;
}

function calculateStreaks(snapshots: WellbeingSnapshotSimple[]): DashboardResponse['streaks'] {
  if (snapshots.length === 0) {
    return { currentDays: 0, bestDays: 0, lastCheckIn: '' };
  }

  // Sort by date
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const lastCheckIn = sorted[0].timestamp.toISOString();

  // Count consecutive days
  let currentDays = 0;
  let bestDays = 0;
  let streak = 0;

  const uniqueDays = new Set(sorted.map((s) => new Date(s.timestamp).toISOString().split('T')[0]));

  const sortedDays = Array.from(uniqueDays).sort().reverse();

  for (let i = 0; i < sortedDays.length; i++) {
    if (i === 0) {
      streak = 1;
      continue;
    }

    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays <= 1.5) {
      streak++;
    } else {
      if (i === 1 || i === 2) currentDays = streak;
      bestDays = Math.max(bestDays, streak);
      streak = 1;
    }
  }

  currentDays = currentDays || streak;
  bestDays = Math.max(bestDays, streak);

  return { currentDays, bestDays, lastCheckIn };
}

function groupSnapshotsByDate(snapshots: WellbeingSnapshotSimple[]): TrendsResponse['dataPoints'] {
  const byDate = new Map<string, WellbeingSnapshotSimple[]>();

  for (const s of snapshots) {
    const date = new Date(s.timestamp).toISOString().split('T')[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(s);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySnapshots]) => ({
      date,
      mood: average(daySnapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]) || null,
      energy:
        average(daySnapshots.map((s) => s.dimensions.energy).filter(Boolean) as number[]) || null,
      anxiety:
        average(daySnapshots.map((s) => s.dimensions.worry).filter(Boolean) as number[]) || null,
      connection:
        average(
          daySnapshots
            .map((s) => s.dimensions.loneliness)
            .filter(Boolean)
            .map((v) => 1 - (v as number)) as number[]
        ) || null,
      purpose:
        average(daySnapshots.map((s) => s.dimensions.meaningfulness).filter(Boolean) as number[]) ||
        null,
      sleep:
        average(daySnapshots.map((s) => s.dimensions.sleepQuality).filter(Boolean) as number[]) ||
        null,
    }));
}

function calculateAverages(snapshots: WellbeingSnapshotSimple[]): TrendsResponse['averages'] {
  return {
    mood: average(snapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]) || 0.5,
    energy: average(snapshots.map((s) => s.dimensions.energy).filter(Boolean) as number[]) || 0.5,
    anxiety: average(snapshots.map((s) => s.dimensions.worry).filter(Boolean) as number[]) || 0.5,
    connection:
      average(
        snapshots
          .map((s) => s.dimensions.loneliness)
          .filter(Boolean)
          .map((v) => 1 - (v as number)) as number[]
      ) || 0.5,
    purpose:
      average(snapshots.map((s) => s.dimensions.meaningfulness).filter(Boolean) as number[]) || 0.5,
    sleep:
      average(snapshots.map((s) => s.dimensions.sleepQuality).filter(Boolean) as number[]) || 0.5,
  };
}

function findCorrelations(snapshots: WellbeingSnapshotSimple[]): TrendsResponse['correlations'] {
  if (snapshots.length < 5) return [];

  const correlations: TrendsResponse['correlations'] = [];

  // Check sleep ↔ mood correlation
  const sleepMoodCorr = calculateCorrelation(
    snapshots.map((s) => s.dimensions.sleepQuality).filter(Boolean) as number[],
    snapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]
  );

  if (Math.abs(sleepMoodCorr) > 0.3) {
    correlations.push({
      dimension1: 'sleep',
      dimension2: 'mood',
      correlation: sleepMoodCorr,
      insight:
        sleepMoodCorr > 0
          ? 'Better sleep tends to improve your mood'
          : 'Sleep and mood seem disconnected for you',
    });
  }

  // Check connection ↔ anxiety correlation (using loneliness inverted)
  const connectionAnxietyCorr = calculateCorrelation(
    snapshots
      .map((s) => s.dimensions.loneliness)
      .filter(Boolean)
      .map((v) => 1 - (v as number)) as number[],
    snapshots.map((s) => s.dimensions.worry).filter(Boolean) as number[]
  );

  if (Math.abs(connectionAnxietyCorr) > 0.3) {
    correlations.push({
      dimension1: 'connection',
      dimension2: 'anxiety',
      correlation: connectionAnxietyCorr,
      insight:
        connectionAnxietyCorr < 0
          ? 'Social connection seems to reduce your anxiety'
          : 'Interestingly, connection and anxiety rise together for you',
    });
  }

  return correlations;
}

function analyzePatterns(snapshots: WellbeingSnapshotSimple[]): InsightsResponse['patterns'] {
  const patterns: InsightsResponse['patterns'] = [];

  if (snapshots.length < 7) return patterns;

  // Check for weekend patterns
  const weekdaySnapshots = snapshots.filter((s) => {
    const day = new Date(s.timestamp).getDay();
    return day > 0 && day < 6;
  });

  const weekendSnapshots = snapshots.filter((s) => {
    const day = new Date(s.timestamp).getDay();
    return day === 0 || day === 6;
  });

  if (weekdaySnapshots.length > 2 && weekendSnapshots.length > 2) {
    const weekdayMood = average(
      weekdaySnapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]
    );
    const weekendMood = average(
      weekendSnapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]
    );

    if (weekendMood - weekdayMood > 0.15) {
      patterns.push({
        type: 'weekly',
        description: 'Your mood is higher on weekends',
        frequency: 'Most weeks',
        suggestion: 'What makes weekends better? Can you bring some of that into weekdays?',
      });
    }
  }

  return patterns;
}

function findCelebrations(snapshots: WellbeingSnapshotSimple[]): InsightsResponse['celebrations'] {
  const celebrations: InsightsResponse['celebrations'] = [];

  for (const s of snapshots) {
    // High mood day
    if (s.dimensions.mood && s.dimensions.mood > 0.85) {
      celebrations.push({
        achievement: 'Great mood day!',
        date: new Date(s.timestamp).toISOString().split('T')[0],
        dimension: 'mood',
      });
    }

    // Low anxiety day
    if (s.dimensions.worry !== undefined && s.dimensions.worry < 0.15) {
      celebrations.push({
        achievement: 'Very calm day',
        date: new Date(s.timestamp).toISOString().split('T')[0],
        dimension: 'anxiety',
      });
    }
  }

  // Limit to top 5
  return celebrations.slice(0, 5);
}

function generateRecommendations(
  snapshots: WellbeingSnapshotSimple[]
): InsightsResponse['recommendations'] {
  const recommendations: InsightsResponse['recommendations'] = [];
  const currentState = calculateCurrentState(snapshots);

  if (currentState.sleep < 0.4) {
    recommendations.push({
      action: 'Focus on sleep hygiene this week',
      reason: 'Sleep quality has been low, which affects everything else',
      priority: 'high',
    });
  }

  if (currentState.connection < 0.4) {
    recommendations.push({
      action: 'Reach out to someone you care about',
      reason: 'Connection has been low - small moments matter',
      priority: 'medium',
    });
  }

  if (currentState.anxiety > 0.7) {
    recommendations.push({
      action: 'Try a grounding exercise today',
      reason: 'Anxiety has been elevated - your body might need calming',
      priority: 'high',
    });
  }

  if (currentState.energy < 0.4 && currentState.sleep > 0.5) {
    recommendations.push({
      action: 'Get some movement in - even a short walk',
      reason: 'Energy is low but sleep is okay - movement might help',
      priority: 'medium',
    });
  }

  return recommendations;
}

// Helper to convert full snapshot to simple format
function toSimpleSnapshot(s: WBSnapshot): WellbeingSnapshotSimple {
  return {
    timestamp: s.timestamp,
    dimensions: {
      mood: s.dimensions.mood,
      energy: s.dimensions.energy,
      worry: s.dimensions.worry,
      loneliness: s.dimensions.loneliness,
      meaningfulness: s.dimensions.meaningfulness,
      sleepQuality: s.dimensions.sleepQuality,
    },
  };
}

// Statistical helpers
function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const avgX = average(x.slice(0, n));
  const avgY = average(y.slice(0, n));

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - avgX;
    const dy = y[i] - avgY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : numerator / denom;
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export function registerWellbeingRoutes(router: Router): void {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  router.get('/api/wellbeing/dashboard', getDashboard);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  router.get('/api/wellbeing/trends', getTrends);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  router.get('/api/wellbeing/insights', getInsights);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  router.post('/api/wellbeing/snapshot', postSnapshot);

  log.info('Wellbeing routes registered');
}

export default { registerWellbeingRoutes };
