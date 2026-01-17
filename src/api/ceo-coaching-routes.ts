/**
 * CEO Coaching API Routes
 *
 * Endpoints for CEO coaching features:
 * - Scheduled job handlers (Cloud Scheduler)
 * - Dashboard data API
 * - Manual trigger testing
 *
 * @module ceo-coaching-routes
 */

import type { Request, Response, Router } from 'express';
import { getLogger } from '../utils/safe-logger.js';
import {
  runDailyTriggerAnalysis,
  runWeeklyDigestJob,
} from '../services/ceo-coaching/scheduled-jobs.js';
import {
  analyzeUserForTriggers,
  triggerProactiveOutreach,
} from '../services/ceo-coaching/proactive-triggers.js';
import { generateWeeklyDigest } from '../services/ceo-coaching/weekly-digest.js';
import {
  getRecentWins,
  getEnergyTrend,
  getRecentEnergyEntries,
  getActiveBlockers,
  getPendingDecisions,
  getRecentGratitude,
  getPriorities,
} from '../tools/domains/ceo-coaching/storage.js';

const log = getLogger().child({ module: 'ceo-coaching-routes' });

// ============================================================================
// ROUTE SETUP
// ============================================================================

/**
 * Register CEO coaching routes
 */
export function registerCEOCoachingRoutes(router: Router): void {
  // Scheduled job handlers (called by Cloud Scheduler)
  router.post('/api/ceo-coaching/jobs/daily-triggers', handleDailyTriggers);
  router.post('/api/ceo-coaching/jobs/weekly-digest', handleWeeklyDigest);

  // Dashboard data API
  router.get('/api/ceo-coaching/dashboard/:userId', getDashboardData);

  // Trigger analysis (for testing/debugging)
  router.get('/api/ceo-coaching/triggers/:userId', getTriggerAnalysis);

  // Manual trigger (for testing)
  router.post('/api/ceo-coaching/trigger/:userId', manualTrigger);

  // Preview weekly digest
  router.get('/api/ceo-coaching/digest/:userId', previewDigest);

  // Health check
  router.get('/api/ceo-coaching/health', healthCheck);

  log.info('📊 CEO coaching routes registered');
}

// ============================================================================
// SCHEDULED JOB HANDLERS
// ============================================================================

/**
 * Handle daily trigger analysis job (Cloud Scheduler)
 */
async function handleDailyTriggers(req: Request, res: Response): Promise<void> {
  // Verify Cloud Scheduler header (optional security)
  const schedulerHeader = req.get('X-CloudScheduler');
  if (process.env.NODE_ENV === 'production' && !schedulerHeader) {
    log.warn('Daily triggers called without Cloud Scheduler header');
  }

  log.info('Running daily trigger analysis (scheduled job)');

  try {
    const result = await runDailyTriggerAnalysis();

    res.json({
      success: result.success,
      message: 'Daily trigger analysis completed',
      stats: result.stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Daily trigger analysis failed');
    res.status(500).json({
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handle weekly digest job (Cloud Scheduler)
 */
async function handleWeeklyDigest(req: Request, res: Response): Promise<void> {
  // Verify Cloud Scheduler header (optional security)
  const schedulerHeader = req.get('X-CloudScheduler');
  if (process.env.NODE_ENV === 'production' && !schedulerHeader) {
    log.warn('Weekly digest called without Cloud Scheduler header');
  }

  log.info('Running weekly digest job (scheduled job)');

  try {
    const result = await runWeeklyDigestJob();

    res.json({
      success: result.success,
      message: 'Weekly digest completed',
      stats: result.stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Weekly digest job failed');
    res.status(500).json({
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// DASHBOARD API
// ============================================================================

/**
 * Get CEO coaching dashboard data for a user
 */
async function getDashboardData(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    // Fetch all data in parallel
    const [
      recentWins,
      energyTrend,
      energyEntries,
      activeBlockers,
      pendingDecisions,
      recentGratitude,
      priorities,
    ] = await Promise.all([
      getRecentWins(userId, 30).catch(() => []),
      getEnergyTrend(userId).catch(() => null),
      getRecentEnergyEntries(userId, 14).catch(() => []),
      getActiveBlockers(userId).catch(() => []),
      getPendingDecisions(userId).catch(() => []),
      getRecentGratitude(userId, 14).catch(() => []),
      getPriorities(userId).catch(() => []),
    ]);

    // Calculate derived metrics
    const now = new Date();

    // Win streak calculation
    let currentWinStreak = 0;
    const winsThisWeek = recentWins.filter((w) => {
      const winDate = new Date(w.date);
      const daysAgo = Math.floor((now.getTime() - winDate.getTime()) / (24 * 60 * 60 * 1000));
      return daysAgo <= 7;
    });

    // Simple streak: consecutive days with wins
    if (winsThisWeek.length > 0) {
      currentWinStreak = winsThisWeek.length;
    }

    // Calculate energy metrics
    const avgEnergyThisWeek = energyEntries.length > 0
      ? energyEntries.slice(0, 7).reduce((sum, e) => sum + e.level, 0) / Math.min(energyEntries.length, 7)
      : 0;

    const avgEnergyLastWeek = energyEntries.length > 7
      ? energyEntries.slice(7, 14).reduce((sum, e) => sum + e.level, 0) / Math.min(energyEntries.length - 7, 7)
      : 0;

    // Find best energy day
    let bestEnergyDay: string | null = null;
    let bestEnergy = 0;
    for (const entry of energyEntries.slice(0, 7)) {
      if (entry.level > bestEnergy) {
        bestEnergy = entry.level;
        bestEnergyDay = new Date(entry.timestamp).toLocaleDateString('en-US', { weekday: 'long' });
      }
    }

    // Find top win category
    const categoryCount: Record<string, number> = {};
    for (const win of recentWins) {
      const cat = win.category || 'general';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    }
    const topWinCategory = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Stale items (14+ days old)
    const staleBlockers = activeBlockers.filter((b) => {
      const daysOld = Math.floor((now.getTime() - new Date(b.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      return daysOld >= 14;
    }).length;

    const staleDecisions = pendingDecisions.filter((d) => {
      const daysOld = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      return daysOld >= 14;
    }).length;

    res.json({
      userId,
      timestamp: new Date().toISOString(),

      // Overview stats
      totalWins: recentWins.length,
      currentWinStreak,
      avgEnergyThisWeek: Math.round(avgEnergyThisWeek * 10) / 10,
      avgEnergyLastWeek: Math.round(avgEnergyLastWeek * 10) / 10,
      activeBlockers: activeBlockers.length,
      pendingDecisions: pendingDecisions.length,

      // Detailed data
      energyTrends: energyEntries.map((e) => ({
        date: e.timestamp.split('T')[0],
        level: e.level,
        note: e.note,
      })),
      recentWins: recentWins.slice(0, 10).map((w) => ({
        text: w.text,
        date: w.date,
        category: w.category,
      })),
      blockers: activeBlockers.map((b) => ({
        id: b.id,
        text: b.text,
        createdAt: b.createdAt,
        daysOld: Math.floor((now.getTime() - new Date(b.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      })),
      decisions: pendingDecisions.map((d) => ({
        id: d.id,
        description: d.description,
        createdAt: d.createdAt,
        daysOld: Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      })),
      priorities: priorities.map((p) => ({
        text: p.text,
        status: p.status,
        order: p.order,
      })),
      gratitude: recentGratitude.map((g) => ({
        text: g.text,
        date: g.date,
      })),

      // Insights
      bestEnergyDay,
      topWinCategory,
      staleBlockers,
      staleDecisions,
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get dashboard data');
    res.status(500).json({
      error: 'Failed to get dashboard data',
      details: String(error),
    });
  }
}

// ============================================================================
// TRIGGER ANALYSIS API
// ============================================================================

/**
 * Get trigger analysis for a user (for debugging/testing)
 */
async function getTriggerAnalysis(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const analysis = await analyzeUserForTriggers(userId);
    res.json(analysis);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to analyze triggers');
    res.status(500).json({
      error: 'Failed to analyze triggers',
      details: String(error),
    });
  }
}

/**
 * Manually trigger a proactive call (for testing)
 */
async function manualTrigger(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const { phoneNumber, triggerType } = req.body;

  if (!userId || !phoneNumber) {
    res.status(400).json({ error: 'userId and phoneNumber are required' });
    return;
  }

  try {
    // First, analyze for triggers
    const analysis = await analyzeUserForTriggers(userId);

    // Find the requested trigger or use the top one
    let trigger = analysis.topTrigger;
    if (triggerType) {
      trigger = analysis.triggers.find((t) => t.type === triggerType) || trigger;
    }

    if (!trigger) {
      res.json({
        success: false,
        message: 'No triggers found for this user',
        analysis,
      });
      return;
    }

    // Trigger the outreach
    const result = await triggerProactiveOutreach(userId, phoneNumber, trigger);

    res.json({
      success: result.success,
      message: result.success ? 'Proactive outreach triggered' : 'Failed to trigger outreach',
      trigger,
      error: result.error,
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to trigger manual outreach');
    res.status(500).json({
      error: 'Failed to trigger outreach',
      details: String(error),
    });
  }
}

// ============================================================================
// DIGEST API
// ============================================================================

/**
 * Preview weekly digest for a user (for testing)
 */
async function previewDigest(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const format = req.query.format || 'json';

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const digest = await generateWeeklyDigest(userId);

    if (format === 'html') {
      const { renderDigestEmail } = await import('../services/ceo-coaching/weekly-digest.js');
      res.setHeader('Content-Type', 'text/html');
      res.send(renderDigestEmail(digest));
    } else if (format === 'text') {
      const { renderDigestText } = await import('../services/ceo-coaching/weekly-digest.js');
      res.setHeader('Content-Type', 'text/plain');
      res.send(renderDigestText(digest));
    } else {
      res.json(digest);
    }
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to generate digest preview');
    res.status(500).json({
      error: 'Failed to generate digest',
      details: String(error),
    });
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Health check for CEO coaching system
 */
async function healthCheck(_req: Request, res: Response): Promise<void> {
  res.json({
    status: 'healthy',
    service: 'ceo-coaching',
    features: {
      dailyTriggers: true,
      weeklyDigest: true,
      dashboardApi: true,
      proactiveOutreach: true,
    },
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { registerCEOCoachingRoutes };
