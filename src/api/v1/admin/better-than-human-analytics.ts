/**
 * Better Than Human Analytics Admin API Routes (v1)
 *
 * Dashboard and analytics for superhuman capability effectiveness.
 * Tracks which of the 31 capabilities are actually helping users.
 *
 * Routes:
 * - GET  /api/v1/admin/bth/stats                    - Overall capability stats
 * - GET  /api/v1/admin/bth/capabilities             - All capability performance
 * - GET  /api/v1/admin/bth/top                      - Top performing capabilities
 * - GET  /api/v1/admin/bth/trends/:cap              - Effectiveness trends for capability
 * - GET  /api/v1/admin/bth/user/:userId             - User-specific feedback history
 * - POST /api/v1/admin/bth/aggregates               - Trigger aggregate refresh
 * - GET  /api/v1/admin/bth/activity                 - Recent activity summary
 *
 * BTH Validation Framework Routes:
 * - GET  /api/v1/admin/bth/validation/telemetry     - Real-time production telemetry
 * - GET  /api/v1/admin/bth/validation/benchmark     - Run capability benchmarks
 * - GET  /api/v1/admin/bth/validation/blind-evaluation - A/B evaluation results
 * - GET  /api/v1/admin/bth/validation/gaps          - Identify capability gaps
 *
 * @module BetterThanHumanAnalyticsAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  ALL_CAPABILITIES,
  getCapabilityStats,
  getMostEffectiveCapabilities,
  getRecentActivitySummary,
  type SuperhumanCapability,
} from '../../../conversation/superhuman/analytics.js';
import {
  getEffectivenessTrend,
  getTopCapabilities,
  getUserFeedbackHistory,
  updateAggregates,
} from '../../../conversation/superhuman/analytics-persistence.js';
import {
  getAllCapabilityTelemetry,
  getBufferStats,
} from '../../../services/better-than-human-validation/production-telemetry.js';
import {
  runFullBenchmark,
  formatBenchmarkReport,
} from '../../../services/better-than-human-validation/capability-benchmark.js';
import {
  getCapabilityEvaluationResults,
  getAvailableScenarios,
  createBlindEvaluationSession,
  submitBlindEvaluation,
  getScenarioEvaluationResults,
} from '../../../services/better-than-human-validation/blind-evaluation.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { rateLimit, requireAuth } from '../../auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from '../../helpers.js';

const log = createLogger({ module: 'BTHAnalyticsAPI' });

// Base path for these routes
const BASE_PATH = '/api/v1/admin/bth';

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle all BTH analytics admin routes
 * @returns true if the request was handled
 */
export async function handleBTHAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle /api/v1/admin/bth routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // All BTH routes require auth (allow dev mode)
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  // Get the path after the base path
  const subPath = pathname.slice(BASE_PATH.length) || '/';

  try {
    // ========================================================================
    // OVERALL STATS
    // ========================================================================
    if ((subPath === '/' || subPath === '/stats') && method === 'GET') {
      const stats = await getOverallStats();
      sendJSON(res, stats);
      return true;
    }

    // ========================================================================
    // ALL CAPABILITIES
    // ========================================================================
    if (subPath === '/capabilities' && method === 'GET') {
      const capabilities = getCapabilityStats();

      // Organize by category
      const byCategory = {
        original10: capabilities.filter((c) => ORIGINAL_10.includes(c.capability)),
        enhanced9: capabilities.filter((c) => ENHANCED_9.includes(c.capability)),
        legacy12: capabilities.filter((c) => LEGACY_12.includes(c.capability)),
      };

      sendJSON(res, {
        totalCapabilities: capabilities.length,
        byCategory,
        all: capabilities.map(formatCapabilityStat),
      });
      return true;
    }

    // ========================================================================
    // TOP PERFORMING
    // ========================================================================
    if (subPath === '/top' && method === 'GET') {
      // Get from both in-memory and persisted
      const inMemory = getMostEffectiveCapabilities();
      const persisted = await getTopCapabilities(10);

      sendJSON(res, {
        fromMemory: inMemory.slice(0, 10),
        fromFirestore: persisted,
        recommended: persisted.length > 0 ? persisted : inMemory.slice(0, 10),
      });
      return true;
    }

    // ========================================================================
    // TRENDS FOR SPECIFIC CAPABILITY
    // ========================================================================
    if (subPath.startsWith('/trends/') && method === 'GET') {
      const capabilityName = subPath.slice('/trends/'.length);

      if (!isValidCapability(capabilityName)) {
        sendError(res, `Invalid capability: ${capabilityName}`, 400);
        return true;
      }

      const trends = await getEffectivenessTrend(capabilityName as SuperhumanCapability, 7);

      sendJSON(res, {
        capability: capabilityName,
        period: '7 days',
        trends,
        summary: summarizeTrends(trends),
      });
      return true;
    }

    // ========================================================================
    // USER FEEDBACK HISTORY
    // ========================================================================
    if (subPath.startsWith('/user/') && method === 'GET') {
      const userId = subPath.slice('/user/'.length);

      if (!userId || userId.length < 5) {
        sendError(res, 'Invalid user ID', 400);
        return true;
      }

      const feedback = await getUserFeedbackHistory(userId, 50);

      sendJSON(res, {
        userId,
        feedbackCount: feedback.length,
        feedback: feedback.map((f) => ({
          capability: f.capability,
          reaction: f.reaction,
          sessionId: f.sessionId,
          insight: f.insight,
          timestamp: f.timestamp?.toDate?.() || f.timestamp,
        })),
      });
      return true;
    }

    // ========================================================================
    // REFRESH AGGREGATES
    // ========================================================================
    if (subPath === '/aggregates' && method === 'POST') {
      log.info({ userId: auth.userId }, 'Manual aggregate refresh triggered');

      // Run async, don't wait
      updateAggregates().catch((err) => {
        log.error({ error: String(err) }, 'Aggregate refresh failed');
      });

      sendJSON(res, {
        message: 'Aggregate refresh started',
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // ========================================================================
    // RECENT ACTIVITY
    // ========================================================================
    if (subPath === '/activity' && method === 'GET') {
      const activity = getRecentActivitySummary(60); // Last hour

      sendJSON(res, {
        period: '1 hour',
        totalUsage: activity.totalUsage,
        appliedCount: activity.appliedCount,
        applicationRate:
          activity.totalUsage > 0
            ? Math.round((activity.appliedCount / activity.totalUsage) * 100)
            : 0,
        byCapability: Object.entries(activity.byCapability)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([cap, count]) => ({ capability: cap, count })),
      });
      return true;
    }

    // ========================================================================
    // BTH VALIDATION FRAMEWORK ROUTES
    // ========================================================================

    // GET /api/v1/admin/bth/validation/telemetry - Real-time telemetry data
    if (subPath === '/validation/telemetry' && method === 'GET') {
      const telemetry = getAllCapabilityTelemetry();
      const bufferStats = getBufferStats();

      // Convert to dashboard-friendly format
      const formatted = Object.entries(telemetry).map(([capability, data]) => ({
        capability,
        triggers: data.triggers,
        outcomes: data.outcomes,
        successRate: data.triggers > 0 ? Math.round((data.outcomes / data.triggers) * 100) : 0,
        lastTriggered: data.lastTriggered || null,
      }));

      sendJSON(res, {
        telemetry: formatted,
        buffer: bufferStats,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // GET /api/v1/admin/bth/validation/benchmark - Run capability benchmark
    if (subPath === '/validation/benchmark' && method === 'GET') {
      log.info({ userId: auth.userId }, 'Running BTH capability benchmark');

      const benchmarkResults = await runFullBenchmark();
      const report = formatBenchmarkReport(benchmarkResults);

      sendJSON(res, {
        results: benchmarkResults,
        report,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // GET /api/v1/admin/bth/validation/blind-evaluation - Blind evaluation results
    if (subPath === '/validation/blind-evaluation' && method === 'GET') {
      const capabilities = [
        'commitment_detection',
        'crisis_detection',
        'reading_between_lines',
      ] as const;
      const results: Record<string, unknown> = {};

      for (const cap of capabilities) {
        const evalResults = await getCapabilityEvaluationResults(cap);
        results[cap] = evalResults;
      }

      const scenarios = await getAvailableScenarios({ capability: 'commitment_detection' });

      sendJSON(res, {
        evaluationResults: results,
        availableScenarios: scenarios.length,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // =========================================================================
    // BLIND EVALUATION PANEL ENDPOINTS
    // =========================================================================

    // GET /api/v1/admin/bth/blind-panel/scenarios - List available scenarios
    if (subPath === '/blind-panel/scenarios' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const capability = url.searchParams.get('capability') || undefined;
      const difficulty = url.searchParams.get('difficulty') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);

      const scenarios = await getAvailableScenarios({ capability, difficulty, limit });

      sendJSON(res, {
        scenarios,
        total: scenarios.length,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // POST /api/v1/admin/bth/blind-panel/session - Create evaluation session
    if (subPath === '/blind-panel/session' && method === 'POST') {
      const body = (await parseBody(req)) as { scenarioId?: string };

      if (!body.scenarioId) {
        sendError(res, 'scenarioId is required', 400);
        return true;
      }

      const session = await createBlindEvaluationSession({
        evaluatorId: auth.userId,
        scenarioId: body.scenarioId,
      });

      if (!session) {
        sendError(res, 'Failed to create evaluation session', 500);
        return true;
      }

      sendJSON(res, {
        session,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // POST /api/v1/admin/bth/blind-panel/submit - Submit evaluation
    if (subPath === '/blind-panel/submit' && method === 'POST') {
      interface EvaluationRatings {
        empathy: number;
        helpfulness: number;
        memoryUsage: number;
        timeliness: number;
        superhumanFactor: number;
      }
      interface SubmitBody {
        sessionId?: string;
        responseARatings?: EvaluationRatings;
        responseBRatings?: EvaluationRatings;
        preferredResponse?: 'A' | 'B' | 'no_preference';
        feedback?: string;
        evaluatorConfidence?: number;
      }
      const body = (await parseBody(req)) as SubmitBody;

      if (
        !body.sessionId ||
        !body.responseARatings ||
        !body.responseBRatings ||
        !body.preferredResponse
      ) {
        sendError(
          res,
          'Missing required fields: sessionId, responseARatings, responseBRatings, preferredResponse',
          400
        );
        return true;
      }

      const result = await submitBlindEvaluation({
        sessionId: body.sessionId,
        responseARatings: body.responseARatings,
        responseBRatings: body.responseBRatings,
        preferredResponse: body.preferredResponse,
        feedback: body.feedback,
        evaluatorConfidence: body.evaluatorConfidence || 0.8,
      });

      if (!result.success) {
        sendError(res, result.error || 'Failed to submit evaluation', 400);
        return true;
      }

      sendJSON(res, {
        success: true,
        evaluationId: result.evaluationId,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // GET /api/v1/admin/bth/blind-panel/results/:scenarioId - Get scenario results
    if (subPath.startsWith('/blind-panel/results/') && method === 'GET') {
      const scenarioId = subPath.replace('/blind-panel/results/', '');

      if (!scenarioId) {
        sendError(res, 'scenarioId is required', 400);
        return true;
      }

      const results = await getScenarioEvaluationResults(scenarioId);

      sendJSON(res, {
        results,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // GET /api/v1/admin/bth/validation/gaps - Identify capability gaps
    if (subPath === '/validation/gaps' && method === 'GET') {
      const benchmarkResults = await runFullBenchmark();

      // Extract gaps from benchmark results
      type GapEntry = {
        capability: string;
        category: string;
        examples: string[];
        priority: 'critical' | 'high' | 'medium' | 'low';
        currentF1: number;
        severity: 'high' | 'medium' | 'low';
      };

      // Helper to determine severity based on F1 score
      const getSeverity = (f1Score: number): 'high' | 'medium' | 'low' => {
        if (f1Score < 0.7) return 'high';
        if (f1Score < 0.85) return 'medium';
        return 'low';
      };

      const gaps: GapEntry[] = benchmarkResults.capabilities.flatMap((result) =>
        result.knownGaps.map((gap) => ({
          capability: result.capability,
          category: gap.category,
          examples: gap.examples,
          priority: gap.priority,
          currentF1: result.f1Score,
          severity: getSeverity(result.f1Score),
        }))
      );

      // Sort by severity then priority
      const severityOrder: Record<'high' | 'medium' | 'low', number> = {
        high: 0,
        medium: 1,
        low: 2,
      };
      const priorityOrder: Record<'critical' | 'high' | 'medium' | 'low', number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      gaps.sort((a, b) => {
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      sendJSON(res, {
        totalGaps: gaps.length,
        gaps,
        summary: {
          bySeverity: {
            high: gaps.filter((g) => g.severity === 'high').length,
            medium: gaps.filter((g) => g.severity === 'medium').length,
            low: gaps.filter((g) => g.severity === 'low').length,
          },
          byPriority: {
            critical: gaps.filter((g) => g.priority === 'critical').length,
            high: gaps.filter((g) => g.priority === 'high').length,
            medium: gaps.filter((g) => g.priority === 'medium').length,
            low: gaps.filter((g) => g.priority === 'low').length,
          },
        },
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'BTH Analytics API error');
    sendError(res, 'Internal server error');
    return true;
  }
}

// ============================================================================
// CAPABILITY CATEGORIES
// ============================================================================

const ORIGINAL_10: SuperhumanCapability[] = [
  'commitment_keeper',
  'capacity_guardian',
  'values_alignment',
  'dream_keeper',
  'life_narrative',
  'relationship_network',
  'seasonal_awareness',
  'relationship_milestones',
  'emotional_first_aid',
  'predictive_coaching',
];

const ENHANCED_9: SuperhumanCapability[] = [
  'silence_interpreter',
  'contradiction_comfort',
  'perfect_timing',
  'pattern_mirror',
  'first_time_vulnerability',
  'ambient_context',
  'protective_memory',
  'voice_biomarkers',
  'inside_joke_memory',
];

const LEGACY_12: SuperhumanCapability[] = [
  'emotional_memory',
  'anticipatory_presence',
  'linguistic_mirroring',
  'visible_vulnerability',
  'spontaneous_delight',
  'protective_instincts',
  'evolving_jokes',
  'team_coherence',
  'temporal_emotional',
  'meta_relationship',
  'somatic_presence',
  'superhuman_observations',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getOverallStats(): Promise<{
  summary: {
    totalCapabilities: number;
    capabilitiesWithData: number;
    totalUsageEvents: number;
    totalFeedbackEvents: number;
    overallEffectivenessRate: number;
  };
  recentActivity: {
    period: string;
    usageCount: number;
    appliedCount: number;
  };
  topPerformers: Array<{
    capability: string;
    effectivenessRate: number;
  }>;
}> {
  const stats = getCapabilityStats();
  const activity = getRecentActivitySummary(60);
  const top = getMostEffectiveCapabilities();

  const totalUsage = stats.reduce((sum, s) => sum + s.totalUsage, 0);
  const totalFeedback = stats.reduce(
    (sum, s) => sum + s.positiveReactions + s.neutralReactions + s.negativeReactions,
    0
  );
  const totalPositive = stats.reduce((sum, s) => sum + s.positiveReactions, 0);

  return {
    summary: {
      totalCapabilities: ALL_CAPABILITIES.length,
      capabilitiesWithData: stats.filter((s) => s.totalUsage > 0).length,
      totalUsageEvents: totalUsage,
      totalFeedbackEvents: totalFeedback,
      overallEffectivenessRate:
        totalFeedback > 0 ? Math.round((totalPositive / totalFeedback) * 100) : 0,
    },
    recentActivity: {
      period: '1 hour',
      usageCount: activity.totalUsage,
      appliedCount: activity.appliedCount,
    },
    topPerformers: top.slice(0, 5).map((t) => ({
      capability: t.capability,
      effectivenessRate: Math.round(t.effectivenessRate * 100),
    })),
  };
}

function formatCapabilityStat(stat: {
  capability: SuperhumanCapability;
  totalUsage: number;
  appliedCount: number;
  positiveReactions: number;
  neutralReactions: number;
  negativeReactions: number;
  averagePriority: number;
}): {
  capability: string;
  usage: number;
  applied: number;
  applicationRate: number;
  positive: number;
  neutral: number;
  negative: number;
  effectivenessRate: number;
  priority: number;
} {
  const totalFeedback = stat.positiveReactions + stat.neutralReactions + stat.negativeReactions;

  return {
    capability: stat.capability,
    usage: stat.totalUsage,
    applied: stat.appliedCount,
    applicationRate:
      stat.totalUsage > 0 ? Math.round((stat.appliedCount / stat.totalUsage) * 100) : 0,
    positive: stat.positiveReactions,
    neutral: stat.neutralReactions,
    negative: stat.negativeReactions,
    effectivenessRate:
      totalFeedback > 0 ? Math.round((stat.positiveReactions / totalFeedback) * 100) : 0,
    priority: Math.round(stat.averagePriority * 10) / 10,
  };
}

function isValidCapability(name: string): boolean {
  return ALL_CAPABILITIES.includes(name as SuperhumanCapability);
}

function summarizeTrends(
  trends: Array<{ date: string; positive: number; neutral: number; negative: number }>
): {
  totalDays: number;
  totalFeedback: number;
  overallPositiveRate: number;
  trend: 'improving' | 'declining' | 'stable';
} {
  const totalFeedback = trends.reduce((sum, t) => sum + t.positive + t.neutral + t.negative, 0);
  const totalPositive = trends.reduce((sum, t) => sum + t.positive, 0);

  // Calculate trend direction
  let trend: 'improving' | 'declining' | 'stable' = 'stable';

  if (trends.length >= 3) {
    const firstHalf = trends.slice(0, Math.floor(trends.length / 2));
    const secondHalf = trends.slice(Math.floor(trends.length / 2));

    const firstRate = calculatePositiveRate(firstHalf);
    const secondRate = calculatePositiveRate(secondHalf);

    if (secondRate - firstRate > 0.1) trend = 'improving';
    else if (firstRate - secondRate > 0.1) trend = 'declining';
  }

  return {
    totalDays: trends.length,
    totalFeedback,
    overallPositiveRate: totalFeedback > 0 ? Math.round((totalPositive / totalFeedback) * 100) : 0,
    trend,
  };
}

function calculatePositiveRate(
  data: Array<{ positive: number; neutral: number; negative: number }>
): number {
  const total = data.reduce((sum, d) => sum + d.positive + d.neutral + d.negative, 0);
  const positive = data.reduce((sum, d) => sum + d.positive, 0);
  return total > 0 ? positive / total : 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { handleBTHAnalyticsRoutes };
