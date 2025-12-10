/**
 * Wellbeing API Handler
 *
 * REST API endpoints for the wellbeing dashboard:
 * - GET /api/wellbeing/dashboard - Full dashboard data
 * - GET /api/wellbeing/trends - Trend analysis over time
 * - GET /api/wellbeing/insights - Personalized insights
 * - POST /api/wellbeing/snapshot - Manual wellbeing check-in
 *
 * @module WellbeingHandler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded } from './helpers.js';

const log = getLogger().child({ module: 'wellbeing-handler' });

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
// HELPERS
// ============================================================================

function getUserId(req: IncomingMessage, url: URL): string | null {
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId && typeof headerUserId === 'string') {
    return headerUserId;
  }
  const queryUserId = url.searchParams.get('userId');
  if (queryUserId) {
    return queryUserId;
  }
  return null;
}

async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

async function handleGetDashboard(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  const userId = getUserId(req, url);
  if (!userId) {
    sendJson(res, 400, { error: 'userId is required' });
    return;
  }

  try {
    const { getWellbeingProfile, getRecentSnapshots } =
      await import('../services/wellbeing-tracking/index.js');
    const { checkWarnings } = await import('../services/wellbeing-tracking/early-warning.js');

    const profile = getWellbeingProfile(userId);
    const recentSnapshots = getRecentSnapshots(userId, 7);

    // Calculate current state from profile
    const currentState = {
      mood: profile.current?.dimensions.mood ?? 0.5,
      energy: profile.current?.dimensions.energy ?? 0.5,
      anxiety: profile.current?.dimensions.worry ?? 0.5,
      connection: profile.current?.dimensions.loneliness
        ? 1 - profile.current.dimensions.loneliness
        : 0.5,
      purpose: profile.current?.dimensions.meaningfulness ?? 0.5,
      sleep: profile.current?.dimensions.sleepQuality ?? 0.5,
      lastUpdated: profile.current?.timestamp?.toISOString() || new Date().toISOString(),
    };

    // Get trends
    const trends = {
      period: 'week' as const,
      direction: (profile.weeklyTrends.filter((t) => t.direction === 'improving').length >
      profile.weeklyTrends.filter((t) => t.direction === 'declining').length
        ? 'improving'
        : profile.weeklyTrends.filter((t) => t.direction === 'declining').length >
            profile.weeklyTrends.filter((t) => t.direction === 'improving').length
          ? 'declining'
          : 'stable') as 'improving' | 'stable' | 'declining',
      changedDimensions: profile.weeklyTrends
        .filter((t) => t.direction !== 'stable')
        .map((t) => t.dimension),
    };

    // Check warnings
    const warnings = checkWarnings(profile);

    // Generate insights
    const insights: DashboardResponse['insights'] = [];
    if (currentState.mood > 0.7) {
      insights.push({
        type: 'celebration',
        message: 'Your mood has been great lately! 🎉',
        dimension: 'mood',
      });
    }
    if (currentState.anxiety < 0.3) {
      insights.push({
        type: 'celebration',
        message: 'Anxiety seems well-managed.',
        dimension: 'anxiety',
      });
    }
    if (currentState.sleep < 0.4) {
      insights.push({
        type: 'pattern',
        message: 'Sleep quality has been low lately.',
        dimension: 'sleep',
      });
    }
    if (currentState.connection < 0.4) {
      insights.push({
        type: 'suggestion',
        message: 'Connection feels low - reaching out might help.',
        dimension: 'connection',
      });
    }

    // Calculate streaks
    const uniqueDays = new Set(recentSnapshots.map((s) => s.timestamp.toISOString().split('T')[0]));
    const streaks = {
      currentDays: uniqueDays.size,
      bestDays: uniqueDays.size,
      lastCheckIn: recentSnapshots[0]?.timestamp?.toISOString() || '',
    };

    const response: DashboardResponse = {
      userId,
      currentState,
      trends,
      insights,
      warnings: warnings.map((w) => ({
        type: w.type,
        severity: w.severity,
        message: w.recommendations?.forUser?.[0] || `Warning: ${w.type}`,
      })),
      streaks,
    };

    log.debug({ userId, warnings: warnings.length }, 'Dashboard data retrieved');
    sendJson(res, 200, response);
  } catch (error) {
    log.error({ error, userId }, 'Failed to get dashboard');
    sendJson(res, 500, { error: 'Failed to retrieve dashboard data' });
  }
}

async function handleGetTrends(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const userId = getUserId(req, url);
  const period = (url.searchParams.get('period') as 'week' | 'month' | 'quarter') || 'week';

  if (!userId) {
    sendJson(res, 400, { error: 'userId is required' });
    return;
  }

  try {
    const { getRecentSnapshots } = await import('../services/wellbeing-tracking/index.js');

    const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
    const snapshots = getRecentSnapshots(userId, days);

    // Group by date
    const byDate = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const date = s.timestamp.toISOString().split('T')[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(s);
    }

    const dataPoints = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, daySnapshots]) => ({
        date,
        mood: average(daySnapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]),
        energy: average(daySnapshots.map((s) => s.dimensions.energy).filter(Boolean) as number[]),
        anxiety: average(daySnapshots.map((s) => s.dimensions.worry).filter(Boolean) as number[]),
        connection: average(
          daySnapshots
            .map((s) => s.dimensions.loneliness)
            .filter(Boolean)
            .map((v) => 1 - (v as number)) as number[]
        ),
        purpose: average(
          daySnapshots.map((s) => s.dimensions.meaningfulness).filter(Boolean) as number[]
        ),
        sleep: average(
          daySnapshots.map((s) => s.dimensions.sleepQuality).filter(Boolean) as number[]
        ),
      }));

    const averages = {
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
        average(snapshots.map((s) => s.dimensions.meaningfulness).filter(Boolean) as number[]) ||
        0.5,
      sleep:
        average(snapshots.map((s) => s.dimensions.sleepQuality).filter(Boolean) as number[]) || 0.5,
    };

    sendJson(res, 200, { userId, period, dataPoints, averages, correlations: [] });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get trends');
    sendJson(res, 500, { error: 'Failed to retrieve trends' });
  }
}

async function handleGetInsights(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  const userId = getUserId(req, url);

  if (!userId) {
    sendJson(res, 400, { error: 'userId is required' });
    return;
  }

  try {
    const { getWellbeingProfile, getRecentSnapshots } =
      await import('../services/wellbeing-tracking/index.js');

    const profile = getWellbeingProfile(userId);
    const snapshots = getRecentSnapshots(userId, 30);

    // Generate patterns
    const patterns: Array<{
      type: string;
      description: string;
      frequency: string;
      suggestion: string;
    }> = [];

    // Check for weekend mood difference
    const weekdaySnapshots = snapshots.filter((s) => {
      const day = s.timestamp.getDay();
      return day > 0 && day < 6;
    });
    const weekendSnapshots = snapshots.filter((s) => {
      const day = s.timestamp.getDay();
      return day === 0 || day === 6;
    });

    if (weekdaySnapshots.length > 2 && weekendSnapshots.length > 2) {
      const weekdayMood =
        average(weekdaySnapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]) ?? 0;
      const weekendMood =
        average(weekendSnapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]) ?? 0;
      if (weekendMood - weekdayMood > 0.15) {
        patterns.push({
          type: 'weekly',
          description: 'Your mood is higher on weekends',
          frequency: 'Most weeks',
          suggestion: 'What makes weekends better? Can you bring some of that into weekdays?',
        });
      }
    }

    // Find celebrations
    const celebrations: Array<{ achievement: string; date: string; dimension: string }> = [];
    for (const s of snapshots.slice(0, 10)) {
      if (s.dimensions.mood && s.dimensions.mood > 0.85) {
        celebrations.push({
          achievement: 'Great mood day!',
          date: s.timestamp.toISOString().split('T')[0],
          dimension: 'mood',
        });
      }
    }

    // Generate recommendations
    const recommendations: Array<{
      action: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
    }> = [];
    const current = profile.current?.dimensions;
    if (current) {
      if ((current.sleepQuality ?? 1) < 0.4) {
        recommendations.push({
          action: 'Focus on sleep hygiene this week',
          reason: 'Sleep quality has been low',
          priority: 'high',
        });
      }
      if ((current.loneliness ?? 0) > 0.6) {
        recommendations.push({
          action: 'Reach out to someone you care about',
          reason: 'Connection has been low',
          priority: 'medium',
        });
      }
      if ((current.worry ?? 0) > 0.7) {
        recommendations.push({
          action: 'Try a grounding exercise today',
          reason: 'Anxiety has been elevated',
          priority: 'high',
        });
      }
    }

    sendJson(res, 200, {
      userId,
      patterns,
      celebrations: celebrations.slice(0, 5),
      recommendations,
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get insights');
    sendJson(res, 500, { error: 'Failed to retrieve insights' });
  }
}

async function handlePostSnapshot(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  const userId = getUserId(req, url);
  const snapshot = await parseBody<SnapshotRequest>(req);

  if (!userId) {
    sendJson(res, 400, { error: 'userId is required' });
    return;
  }

  if (!snapshot) {
    sendJson(res, 400, { error: 'Invalid request body' });
    return;
  }

  // Validate dimensions are 0-1
  const dims = ['mood', 'energy', 'anxiety', 'connection', 'purpose', 'sleep'] as const;
  for (const dim of dims) {
    const value = snapshot[dim];
    if (value !== undefined && (value < 0 || value > 1)) {
      sendJson(res, 400, { error: `${dim} must be between 0 and 1` });
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
        worry: snapshot.anxiety,
        loneliness: snapshot.connection !== undefined ? 1 - snapshot.connection : undefined,
        meaningfulness: snapshot.purpose,
        sleepQuality: snapshot.sleep,
      },
      { source: 'self_reported', notes: snapshot.note }
    );

    log.info({ userId, dimensions: Object.keys(snapshot) }, 'Wellbeing snapshot recorded');
    sendJson(res, 200, { success: true, snapshot: recorded });
  } catch (error) {
    log.error({ error, userId }, 'Failed to record snapshot');
    sendJson(res, 500, { error: 'Failed to record snapshot' });
  }
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleWellbeingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/wellbeing/* routes
  if (!pathname.startsWith('/api/wellbeing')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  // GET /api/wellbeing/dashboard
  if (pathname === '/api/wellbeing/dashboard' && req.method === 'GET') {
    await handleGetDashboard(req, res, parsedUrl);
    return true;
  }

  // GET /api/wellbeing/trends
  if (pathname === '/api/wellbeing/trends' && req.method === 'GET') {
    await handleGetTrends(req, res, parsedUrl);
    return true;
  }

  // GET /api/wellbeing/insights
  if (pathname === '/api/wellbeing/insights' && req.method === 'GET') {
    await handleGetInsights(req, res, parsedUrl);
    return true;
  }

  // POST /api/wellbeing/snapshot
  if (pathname === '/api/wellbeing/snapshot' && req.method === 'POST') {
    await handlePostSnapshot(req, res, parsedUrl);
    return true;
  }

  // Not a wellbeing route
  return false;
}

export default { handleWellbeingRoutes };
