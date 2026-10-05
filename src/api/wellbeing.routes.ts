/**
 * Wellbeing API Handler
 *
 * REST API endpoints for the wellbeing dashboard:
 * - GET /api/wellbeing/dashboard - Full dashboard data
 * - GET /api/wellbeing/trends - Trend analysis over time
 * - GET /api/wellbeing/insights - Personalized insights
 *
 * @module WellbeingHandler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { buildDashboardResponse, loadWellbeingData, snapshotsWithin } from './wellbeing-data.js';
import { handleCorsPreflightIfNeeded, sendJSON } from './helpers.js';

const log = getLogger().child({ module: 'wellbeing-handler' });

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Legacy wrapper for sendJSON with (res, status, data) signature.
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

async function handleGetDashboard(res: ServerResponse, userId: string): Promise<void> {
  try {
    const { checkWarnings } = await import('../services/wellbeing-tracking/early-warning.js');
    const data = await loadWellbeingData(userId);
    const warnings = data.profile && data.current ? checkWarnings(data.profile) : [];

    const response = buildDashboardResponse(
      userId,
      data,
      warnings.map((w) => ({
        type: w.type,
        severity: w.severity,
        message: w.recommendations?.forUser?.[0] || `Warning: ${w.type}`,
      }))
    );

    log.debug({ userId, hasData: response.hasData }, 'Dashboard data retrieved');
    sendJson(res, 200, response);
  } catch (error) {
    log.error({ error, userId }, 'Failed to get dashboard');
    sendJson(res, 500, { error: 'Failed to retrieve dashboard data' });
  }
}

async function handleGetTrends(res: ServerResponse, url: URL, userId: string): Promise<void> {
  const period = (url.searchParams.get('period') as 'week' | 'month' | 'quarter') || 'week';

  try {
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
    const snapshots = snapshotsWithin((await loadWellbeingData(userId)).snapshots, days);

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
      mood: average(snapshots.map((s) => s.dimensions.mood).filter(Boolean) as number[]),
      energy: average(snapshots.map((s) => s.dimensions.energy).filter(Boolean) as number[]),
      anxiety: average(snapshots.map((s) => s.dimensions.worry).filter(Boolean) as number[]),
      connection: average(
        snapshots
          .map((s) => s.dimensions.loneliness)
          .filter(Boolean)
          .map((v) => 1 - (v as number)) as number[]
      ),
      purpose: average(
        snapshots.map((s) => s.dimensions.meaningfulness).filter(Boolean) as number[]
      ),
      sleep: average(snapshots.map((s) => s.dimensions.sleepQuality).filter(Boolean) as number[]),
    };

    sendJson(res, 200, { userId, period, dataPoints, averages, correlations: [] });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get trends');
    sendJson(res, 500, { error: 'Failed to retrieve trends' });
  }
}

async function handleGetInsights(res: ServerResponse, userId: string): Promise<void> {
  try {
    const data = await loadWellbeingData(userId);
    const snapshots = snapshotsWithin(data.snapshots, 30);

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
    const current = data.current?.dimensions;
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

  // Require authentication; every handler reads the authenticated user's own data
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  // GET /api/wellbeing/dashboard
  if (pathname === '/api/wellbeing/dashboard' && req.method === 'GET') {
    await handleGetDashboard(res, auth.userId);
    return true;
  }

  // GET /api/wellbeing/trends
  if (pathname === '/api/wellbeing/trends' && req.method === 'GET') {
    await handleGetTrends(res, parsedUrl, auth.userId);
    return true;
  }

  // GET /api/wellbeing/insights
  if (pathname === '/api/wellbeing/insights' && req.method === 'GET') {
    await handleGetInsights(res, auth.userId);
    return true;
  }

  // Not a wellbeing route
  return false;
}

export default { handleWellbeingRoutes };
