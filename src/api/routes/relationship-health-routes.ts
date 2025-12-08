/**
 * Relationship Health Dashboard API Routes
 *
 * Unified API for relationship health metrics, providing:
 * - Overall health score
 * - Individual factor scores
 * - Trends over time
 * - Actionable insights
 * - Milestone tracking
 *
 * This surfaces the "better than human" trust systems to users
 * in a meaningful, non-creepy way.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '../../utils/safe-logger.js';
import { validateAuth, sendSuccess, sendError, parseRequestBody } from '../helpers.js';
import {
  calculateHealthScore,
  getHealthScore,
  getHealthTrend,
  acknowledgeAlert,
  recordMilestone,
  getStageName,
  getStageDescription,
  exportHealthData,
  calculateBoundaryRespect,
  calculateEmotionalAttunement,
  calculateGrowthAcknowledgment,
  calculateCallbackSuccess,
  calculateOutreachReception,
  calculateSessionDepth,
  calculateConsistency,
  type RelationshipHealthScore,
  type HealthTrend,
} from '../../services/trust-systems/relationship-health.js';
import {
  buildInsightContext,
  getInsightsForPersona,
} from '../../services/cross-persona-insights.js';

const log = createLogger({ module: 'RelationshipHealthAPI' });

// ============================================================================
// TYPES
// ============================================================================

export interface HealthDashboardResponse {
  score: number;
  stage: string;
  stageName: string;
  stageDescription: string;
  trend: 'improving' | 'stable' | 'declining';
  factors: Array<{
    name: string;
    displayName: string;
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    description: string;
  }>;
  alerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'concern';
    message: string;
    suggestion: string;
  }>;
  trends: {
    week: HealthTrend | null;
    month: HealthTrend | null;
    quarter: HealthTrend | null;
  };
  insights: Array<{
    category: string;
    summary: string;
    fromPersona: string;
  }>;
  lastUpdated: string;
}

// ============================================================================
// FACTOR DISPLAY CONFIG
// ============================================================================

const FACTOR_DISPLAY: Record<string, { displayName: string; description: string }> = {
  boundaryRespect: {
    displayName: 'Boundary Respect',
    description: 'How well we honor your limits and sensitive topics',
  },
  emotionalAttunement: {
    displayName: 'Emotional Awareness',
    description: 'How well we pick up on how you\'re really feeling',
  },
  growthAcknowledgment: {
    displayName: 'Growth Recognition',
    description: 'How well we notice and celebrate your evolution',
  },
  callbackSuccess: {
    displayName: 'Shared History',
    description: 'How well our references to past conversations land',
  },
  outreachReception: {
    displayName: 'Check-in Reception',
    description: 'How well our proactive messages are received',
  },
  sessionDepth: {
    displayName: 'Conversation Depth',
    description: 'How meaningful our conversations tend to be',
  },
  consistency: {
    displayName: 'Engagement Rhythm',
    description: 'How regular our connection has been',
  },
};

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/relationship/health
 * 
 * Get the full relationship health dashboard
 */
export async function handleGetHealthDashboard(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = await validateAuth(req, res);
  if (!userId) return;

  try {
    // Get current health score
    let healthScore = getHealthScore(userId);
    
    // If no score exists, calculate a fresh one with default metrics
    if (!healthScore) {
      healthScore = calculateHealthScore(userId, {
        boundaryRespect: 100, // Perfect until proven otherwise
        emotionalAttunement: 50, // Neutral start
        growthAcknowledgment: 50,
        callbackSuccess: 50,
        outreachReception: 50,
        sessionDepth: 50,
        consistency: 50,
      });
    }

    // Get trends
    const trends = {
      week: getHealthTrend(userId, 'week'),
      month: getHealthTrend(userId, 'month'),
      quarter: getHealthTrend(userId, 'quarter'),
    };

    // Get cross-persona insights
    const insightResults = getInsightsForPersona(userId, 'ferni', {
      includeAcknowledged: true,
      maxAge: 14,
      minConfidence: 0.5,
    });

    const insights = insightResults.slice(0, 5).map(ir => ({
      category: ir.insight.category,
      summary: ir.insight.summary,
      fromPersona: ir.insight.sourcePersona,
    }));

    // Build response
    const response: HealthDashboardResponse = {
      score: healthScore.overallScore,
      stage: healthScore.stage,
      stageName: getStageName(healthScore.stage),
      stageDescription: getStageDescription(healthScore.stage),
      trend: healthScore.overallTrend,
      factors: healthScore.factors.map(f => ({
        name: f.name,
        displayName: FACTOR_DISPLAY[f.name]?.displayName || f.name,
        score: f.score,
        trend: f.trend,
        description: FACTOR_DISPLAY[f.name]?.description || '',
      })),
      alerts: healthScore.alerts
        .filter(a => !a.acknowledged)
        .map(a => ({
          id: a.id,
          severity: a.severity,
          message: a.message,
          suggestion: a.suggestion,
        })),
      trends,
      insights,
      lastUpdated: healthScore.lastCalculated.toISOString(),
    };

    sendSuccess(res, response);

    log.debug(
      { userId, score: healthScore.overallScore, stage: healthScore.stage },
      'Health dashboard retrieved'
    );
  } catch (error) {
    log.error({ error, userId }, 'Failed to get health dashboard');
    sendError(res, 500, 'Failed to retrieve relationship health');
  }
}

/**
 * GET /api/relationship/health/summary
 * 
 * Get a brief health summary (for quick display)
 */
export async function handleGetHealthSummary(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = await validateAuth(req, res);
  if (!userId) return;

  try {
    const healthScore = getHealthScore(userId);
    
    if (!healthScore) {
      sendSuccess(res, {
        score: 50,
        stage: 'new',
        stageName: 'Just Getting Started',
        trend: 'stable',
        hasAlerts: false,
      });
      return;
    }

    sendSuccess(res, {
      score: healthScore.overallScore,
      stage: healthScore.stage,
      stageName: getStageName(healthScore.stage),
      trend: healthScore.overallTrend,
      hasAlerts: healthScore.alerts.some(a => !a.acknowledged),
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get health summary');
    sendError(res, 500, 'Failed to retrieve health summary');
  }
}

/**
 * POST /api/relationship/health/acknowledge
 * 
 * Acknowledge a health alert
 */
export async function handleAcknowledgeAlert(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = await validateAuth(req, res);
  if (!userId) return;

  try {
    const body = await parseRequestBody<{ alertId: string }>(req);
    
    if (!body?.alertId) {
      sendError(res, 400, 'alertId is required');
      return;
    }

    const success = acknowledgeAlert(userId, body.alertId);
    
    if (success) {
      sendSuccess(res, { acknowledged: true });
      log.info({ userId, alertId: body.alertId }, 'Alert acknowledged');
    } else {
      sendError(res, 404, 'Alert not found');
    }
  } catch (error) {
    log.error({ error, userId }, 'Failed to acknowledge alert');
    sendError(res, 500, 'Failed to acknowledge alert');
  }
}

/**
 * POST /api/relationship/health/recalculate
 * 
 * Force recalculation of health score with provided metrics
 * (Admin/internal use)
 */
export async function handleRecalculateHealth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = await validateAuth(req, res);
  if (!userId) return;

  try {
    const body = await parseRequestBody<{
      metrics?: {
        boundaryRespect?: { boundariesSet: number; boundariesRespected: number; boundariesCrossed: number };
        emotionalAttunement?: { unsaidSignalsDetected: number; unsaidSignalsActedOn: number; emotionalMismatchesCaught: number; supportOffered: number; supportAccepted: number };
        growthAcknowledgment?: { growthPatternsDetected: number; growthReflectionsShared: number; reflectionsReceivedWell: number };
        callbackSuccess?: { callbacksAttempted: number; callbacksLanded: number; callbacksAwkward: number };
        outreachReception?: { outreachSent: number; outreachOpened: number; outreachEngaged: number; outreachIgnored: number };
        sessionDepth?: { avgSessionDurationMinutes: number; deepConversations: number; totalSessions: number; emotionalShares: number };
        consistency?: { sessionDates: string[]; expectedCadenceDays: number };
      };
    }>(req);

    // Calculate individual factors from provided metrics
    const factorScores: Record<string, number> = {};

    if (body?.metrics?.boundaryRespect) {
      factorScores.boundaryRespect = calculateBoundaryRespect(userId, body.metrics.boundaryRespect);
    }
    if (body?.metrics?.emotionalAttunement) {
      factorScores.emotionalAttunement = calculateEmotionalAttunement(userId, body.metrics.emotionalAttunement);
    }
    if (body?.metrics?.growthAcknowledgment) {
      factorScores.growthAcknowledgment = calculateGrowthAcknowledgment(userId, body.metrics.growthAcknowledgment);
    }
    if (body?.metrics?.callbackSuccess) {
      factorScores.callbackSuccess = calculateCallbackSuccess(userId, body.metrics.callbackSuccess);
    }
    if (body?.metrics?.outreachReception) {
      factorScores.outreachReception = calculateOutreachReception(userId, body.metrics.outreachReception);
    }
    if (body?.metrics?.sessionDepth) {
      factorScores.sessionDepth = calculateSessionDepth(userId, body.metrics.sessionDepth);
    }
    if (body?.metrics?.consistency) {
      const sessionDates = body.metrics.consistency.sessionDates.map(d => new Date(d));
      factorScores.consistency = calculateConsistency(userId, { 
        sessionDates, 
        expectedCadenceDays: body.metrics.consistency.expectedCadenceDays 
      });
    }

    // Fill in defaults for any missing factors
    const defaultScore = 50;
    const allFactors = ['boundaryRespect', 'emotionalAttunement', 'growthAcknowledgment', 
                       'callbackSuccess', 'outreachReception', 'sessionDepth', 'consistency'];
    
    for (const factor of allFactors) {
      if (factorScores[factor] === undefined) {
        factorScores[factor] = defaultScore;
      }
    }

    // Calculate new health score
    const healthScore = calculateHealthScore(userId, factorScores);

    sendSuccess(res, {
      score: healthScore.overallScore,
      stage: healthScore.stage,
      stageName: getStageName(healthScore.stage),
      factors: healthScore.factors.map(f => ({
        name: f.name,
        score: f.score,
      })),
    });

    log.info({ userId, newScore: healthScore.overallScore }, 'Health score recalculated');
  } catch (error) {
    log.error({ error, userId }, 'Failed to recalculate health');
    sendError(res, 500, 'Failed to recalculate health');
  }
}

/**
 * POST /api/relationship/milestone
 * 
 * Record a relationship milestone
 */
export async function handleRecordMilestone(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = await validateAuth(req, res);
  if (!userId) return;

  try {
    const body = await parseRequestBody<{
      type: 'first_callback' | 'boundary_respected' | 'growth_noticed' | 'deep_share' | 'trust_level_up';
      description: string;
    }>(req);

    if (!body?.type || !body?.description) {
      sendError(res, 400, 'type and description are required');
      return;
    }

    const milestone = recordMilestone(userId, body.type, body.description);
    sendSuccess(res, { milestone });

    log.info({ userId, type: body.type }, 'Milestone recorded');
  } catch (error) {
    log.error({ error, userId }, 'Failed to record milestone');
    sendError(res, 500, 'Failed to record milestone');
  }
}

/**
 * GET /api/relationship/export
 * 
 * Export all relationship health data
 */
export async function handleExportHealthData(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userId = await validateAuth(req, res);
  if (!userId) return;

  try {
    const data = exportHealthData(userId);
    sendSuccess(res, data);
  } catch (error) {
    log.error({ error, userId }, 'Failed to export health data');
    sendError(res, 500, 'Failed to export health data');
  }
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export async function relationshipHealthRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Match routes
  if (url.startsWith('/api/relationship/health/summary') && method === 'GET') {
    await handleGetHealthSummary(req, res);
    return true;
  }

  if (url.startsWith('/api/relationship/health/acknowledge') && method === 'POST') {
    await handleAcknowledgeAlert(req, res);
    return true;
  }

  if (url.startsWith('/api/relationship/health/recalculate') && method === 'POST') {
    await handleRecalculateHealth(req, res);
    return true;
  }

  if (url.startsWith('/api/relationship/health') && method === 'GET') {
    await handleGetHealthDashboard(req, res);
    return true;
  }

  if (url.startsWith('/api/relationship/milestone') && method === 'POST') {
    await handleRecordMilestone(req, res);
    return true;
  }

  if (url.startsWith('/api/relationship/export') && method === 'GET') {
    await handleExportHealthData(req, res);
    return true;
  }

  return false;
}

export default relationshipHealthRoutes;

