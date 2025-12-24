/**
 * Session Analytics API Routes
 *
 * Admin endpoints for session analytics and quality metrics.
 *
 * Endpoints:
 * - GET /api/admin/analytics/sessions - Get recent sessions
 * - GET /api/admin/analytics/sessions/:sessionId - Get specific session details
 * - GET /api/admin/analytics/quality - Get quality metrics
 * - GET /api/admin/analytics/persona-bonds - Get persona bond statistics
 * - GET /api/admin/analytics/intents - Get intent detection analytics
 * - GET /api/admin/analytics/summary - Get analytics overview
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  handleCorsPreflightIfNeeded,
  sendJSON,
  sendError,
} from './helpers.js';
import { requireAdmin } from './auth-middleware.js';

const log = createLogger({ module: 'SessionAnalyticsAPI' });

/**
 * Handle session analytics routes
 */
export async function handleSessionAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/admin/analytics/* routes (admin session analytics)
  if (!pathname.startsWith('/api/admin/analytics')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Require admin for all analytics routes
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    // GET /api/admin/analytics/sessions - Get recent sessions
    if (pathname === '/api/admin/analytics/sessions' && req.method === 'GET') {
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

      const sessions = await getRecentSessionsData(userId, limit);
      sendJSON(res, sessions);
      log.debug({ userId: auth.userId, targetUser: userId }, 'Sessions fetched');
      return true;
    }

    // GET /api/admin/analytics/sessions/:sessionId - Get specific session
    const sessionMatch = pathname.match(/^\/api\/analytics\/sessions\/([^/]+)$/);
    if (sessionMatch && req.method === 'GET') {
      const sessionId = sessionMatch[1];
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendError(res, 'userId query parameter is required', 400);
        return true;
      }

      const session = await getSessionDetails(userId, sessionId);
      if (!session) {
        sendError(res, 'Session not found', 404);
        return true;
      }

      sendJSON(res, session);
      return true;
    }

    // GET /api/admin/analytics/quality - Get quality metrics
    if (pathname === '/api/admin/analytics/quality' && req.method === 'GET') {
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      const sessionId = url.searchParams.get('sessionId');
      const days = parseInt(url.searchParams.get('days') ?? '7', 10);

      const metrics = await getQualityMetricsData(userId, sessionId, days);
      sendJSON(res, metrics);
      return true;
    }

    // GET /api/admin/analytics/persona-bonds - Get persona bond statistics
    if (pathname === '/api/admin/analytics/persona-bonds' && req.method === 'GET') {
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendError(res, 'userId query parameter is required', 400);
        return true;
      }

      const bonds = await getPersonaBondStats(userId);
      sendJSON(res, bonds);
      return true;
    }

    // GET /api/admin/analytics/intents - Get intent detection analytics
    if (pathname === '/api/admin/analytics/intents' && req.method === 'GET') {
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);

      const intents = await getIntentAnalytics(userId, limit);
      sendJSON(res, intents);
      return true;
    }

    // GET /api/admin/analytics/summary - Get overall analytics summary
    if (pathname === '/api/admin/analytics/summary' && req.method === 'GET') {
      const summary = await getAnalyticsSummary();
      sendJSON(res, summary);
      return true;
    }

    // Unknown analytics route
    sendError(res, 'Analytics endpoint not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err) }, 'Session analytics route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

/**
 * Get recent sessions data
 */
async function getRecentSessionsData(
  userId: string | null,
  limit: number
): Promise<Record<string, unknown>> {
  try {
    const { getRecentSessions } = await import('../memory/firestore-extended-persistence.js');

    if (userId) {
      const sessions = await getRecentSessions(userId, limit);
      return {
        userId,
        sessions,
        count: sessions.length,
      };
    }

    // For admin without userId, return aggregate stats
    return {
      message: 'Provide userId to get specific sessions',
      hint: 'Add ?userId=xxx to the request',
    };
  } catch (err) {
    return { error: 'Session data not available', details: String(err) };
  }
}

/**
 * Get detailed session information
 */
async function getSessionDetails(
  userId: string,
  sessionId: string
): Promise<Record<string, unknown> | null> {
  try {
    const {
      getSessionState,
      getToolExecutions,
      getQualityMetrics,
    } = await import('../memory/firestore-extended-persistence.js');

    const [session, tools, quality] = await Promise.all([
      getSessionState(userId, sessionId),
      getToolExecutions(sessionId, 100),
      getQualityMetrics(sessionId),
    ]);

    if (!session) return null;

    return {
      session,
      toolExecutions: tools,
      toolCount: tools.length,
      qualityMetrics: quality,
    };
  } catch (err) {
    log.error({ error: String(err), sessionId }, 'Error fetching session details');
    return null;
  }
}

/**
 * Get quality metrics data
 */
async function getQualityMetricsData(
  userId: string | null,
  sessionId: string | null,
  days: number
): Promise<Record<string, unknown>> {
  try {
    const { getQualityMetrics, getRecentSessions } = await import(
      '../memory/firestore-extended-persistence.js'
    );

    if (sessionId) {
      const metrics = await getQualityMetrics(sessionId);
      return {
        sessionId,
        metrics,
      };
    }

    if (userId) {
      // Get metrics for user's recent sessions
      const sessions = await getRecentSessions(userId, 50);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      const recentSessions = sessions.filter(
        (s) => new Date(s.startedAt).getTime() > cutoff
      );

      const metricsPromises = recentSessions.map((s) => getQualityMetrics(s.sessionId));
      const allMetrics = await Promise.all(metricsPromises);
      const validMetrics = allMetrics.filter((m) => m !== null);

      // Calculate aggregates
      const avgAudioQuality =
        validMetrics.length > 0
          ? validMetrics.reduce((sum, m) => sum + (m?.audioQuality?.overall ?? 0), 0) /
            validMetrics.length
          : 0;

      const avgSatisfaction =
        validMetrics.length > 0
          ? validMetrics.reduce((sum, m) => sum + (m?.userSatisfaction?.rating ?? 0), 0) /
            validMetrics.length
          : 0;

      return {
        userId,
        days,
        sessionCount: recentSessions.length,
        metricsCount: validMetrics.length,
        averageAudioQuality: avgAudioQuality.toFixed(2),
        averageSatisfaction: avgSatisfaction.toFixed(2),
        metrics: validMetrics.slice(0, 10), // Return latest 10
      };
    }

    return {
      message: 'Provide userId or sessionId for quality metrics',
      hint: 'Add ?userId=xxx or ?sessionId=yyy to the request',
    };
  } catch (err) {
    return { error: 'Quality metrics not available', details: String(err) };
  }
}

/**
 * Get persona bond statistics
 */
async function getPersonaBondStats(userId: string): Promise<Record<string, unknown>> {
  try {
    const { getAllPersonaBonds } = await import('../memory/firestore-extended-persistence.js');
    const bonds = await getAllPersonaBonds(userId);

    // Calculate summary stats
    const totalConversations = bonds.reduce((sum, b) => sum + b.totalConversations, 0);
    const totalDuration = bonds.reduce((sum, b) => sum + b.totalDurationMinutes, 0);

    // Find most-used persona
    const mostUsed = bonds.length > 0
      ? bonds.reduce((max, b) => (b.totalConversations > max.totalConversations ? b : max))
      : null;

    // Find highest trust
    const highestTrust = bonds.length > 0
      ? bonds.reduce((max, b) => (b.trustLevel > max.trustLevel ? b : max))
      : null;

    return {
      userId,
      personaCount: bonds.length,
      totalConversations,
      totalDurationMinutes: totalDuration,
      totalDurationHours: (totalDuration / 60).toFixed(1),
      mostUsedPersona: mostUsed?.personaId ?? null,
      highestTrustPersona: highestTrust?.personaId ?? null,
      bonds: bonds.map((b) => ({
        personaId: b.personaId,
        conversations: b.totalConversations,
        durationMinutes: b.totalDurationMinutes,
        trustLevel: b.trustLevel,
        lastConversation: b.lastConversation,
      })),
    };
  } catch (err) {
    return { error: 'Persona bonds not available', details: String(err) };
  }
}

/**
 * Get intent detection analytics
 */
async function getIntentAnalytics(
  userId: string | null,
  limit: number
): Promise<Record<string, unknown>> {
  try {
    if (!userId) {
      return {
        message: 'Provide userId for intent analytics',
        hint: 'Add ?userId=xxx to the request',
      };
    }

    const { getRecentIntents } = await import('../memory/firestore-extended-persistence.js');
    const intents = await getRecentIntents(userId, limit);

    // Calculate accuracy
    const successful = intents.filter((i) => i.successful).length;
    const corrected = intents.filter((i) => i.correctedIntent).length;

    // Group by intent type
    const intentCounts: Record<string, number> = {};
    for (const intent of intents) {
      const key = intent.detectedIntent;
      intentCounts[key] = (intentCounts[key] ?? 0) + 1;
    }

    // Top intents
    const topIntents = Object.entries(intentCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([intent, count]) => ({ intent, count }));

    return {
      userId,
      totalIntents: intents.length,
      successfulIntents: successful,
      correctedIntents: corrected,
      successRate: intents.length > 0 ? ((successful / intents.length) * 100).toFixed(1) + '%' : '0%',
      correctionRate:
        intents.length > 0 ? ((corrected / intents.length) * 100).toFixed(1) + '%' : '0%',
      topIntents,
      recentIntents: intents.slice(0, 20),
    };
  } catch (err) {
    return { error: 'Intent analytics not available', details: String(err) };
  }
}

/**
 * Get overall analytics summary (admin overview)
 */
async function getAnalyticsSummary(): Promise<Record<string, unknown>> {
  return {
    timestamp: new Date().toISOString(),
    message: 'Analytics summary',
    availableEndpoints: [
      'GET /api/admin/analytics/sessions?userId=xxx&limit=50',
      'GET /api/admin/analytics/sessions/:sessionId?userId=xxx',
      'GET /api/admin/analytics/quality?userId=xxx&days=7',
      'GET /api/admin/analytics/persona-bonds?userId=xxx',
      'GET /api/admin/analytics/intents?userId=xxx&limit=100',
    ],
    note: 'All endpoints require admin authentication',
  };
}
