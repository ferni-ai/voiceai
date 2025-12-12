/**
 * Predictive Insights API Routes
 *
 * Endpoints for fetching and managing predictive insights.
 *
 * GET /api/insights/predictions - Get current predictions for user
 * POST /api/insights/dismiss - Dismiss an insight
 * POST /api/insights/feedback - Provide feedback on insight accuracy
 *
 * @module API/PredictiveInsights
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { recordPredictiveInsightFeedback } from '../services/predictive-insights/feedback-store.js';
import { runPredictiveAnalysis } from '../services/predictive-insights/index.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'PredictiveInsightsAPI' });

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 400): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/insights/predictions
 * Fetch current predictive insights for the authenticated user
 */
async function handleGetPredictions(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const insights = await runPredictiveAnalysis(userId);

    // Transform for API response
    const response = insights.map((insight) => ({
      id: insight.id,
      type: insight.type,
      title: insight.title,
      message: insight.message,
      suggestion: insight.suggestion,
      priority: insight.priority,
      confidence: insight.confidence,
      validUntil: insight.validUntil?.toISOString(),
      createdAt: insight.createdAt.toISOString(),
      metadata: insight.metadata,
    }));

    sendJson(res, {
      success: true,
      insights: response,
      count: response.length,
    });

    log.info({ userId, count: response.length }, '📊 Fetched predictive insights');
  } catch (error) {
    log.error({ error, userId }, 'Failed to fetch predictions');
    sendError(res, 'Failed to fetch predictions', 500);
  }
}

/**
 * POST /api/insights/dismiss
 * Dismiss an insight (user doesn't want to see it again)
 */
async function handleDismissInsight(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody(req);
    const insightId = body.insightId as string;

    if (!insightId) {
      sendError(res, 'insightId required', 400);
      return;
    }

    // Store dismissal (could persist to Firestore)
    // For now, just acknowledge
    log.info({ userId, insightId }, '👋 Insight dismissed');

    sendJson(res, { success: true, dismissed: insightId });
  } catch (error) {
    log.error({ error, userId }, 'Failed to dismiss insight');
    sendError(res, 'Failed to dismiss insight', 500);
  }
}

/**
 * POST /api/insights/feedback
 * Provide feedback on insight accuracy
 */
async function handleInsightFeedback(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody(req);
    const insightId = body.insightId as string;
    const helpful = body.helpful as boolean | undefined;
    const accurate = body.accurate as boolean | undefined;
    const notes = body.notes as string | undefined;

    if (!insightId) {
      sendError(res, 'insightId required', 400);
      return;
    }

    log.info({ userId, insightId, helpful, accurate, notes }, '📝 Insight feedback received');

    const result = await recordPredictiveInsightFeedback({
      userId,
      insightId,
      helpful,
      accurate,
      notes,
      source: 'api',
    });

    if (!result.ok) {
      // Graceful fallback: endpoint still acknowledges receipt, but flags storage issue.
      sendJson(res, {
        success: true,
        recorded: false,
        reason: 'reason' in result ? result.reason : 'unknown',
      });
      return;
    }

    sendJson(res, { success: true, recorded: true, id: result.id });
  } catch (error) {
    log.error({ error, userId }, 'Failed to record feedback');
    sendError(res, 'Failed to record feedback', 500);
  }
}

/**
 * GET /api/insights/summary
 * Get a summary of insight activity
 */
async function handleGetSummary(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const insights = await runPredictiveAnalysis(userId);

    const summary = {
      totalInsights: insights.length,
      byType: {} as Record<string, number>,
      byPriority: {
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      topPriority: insights[0] || null,
    };

    for (const insight of insights) {
      summary.byType[insight.type] = (summary.byType[insight.type] || 0) + 1;
      summary.byPriority[insight.priority]++;
    }

    sendJson(res, { success: true, summary });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get summary');
    sendError(res, 'Failed to get summary', 500);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handlePredictiveInsightsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  userId: string
): Promise<boolean> {
  const path = parsedUrl.pathname;

  // Route matching
  if (path === '/api/insights/predictions' && req.method === 'GET') {
    await handleGetPredictions(req, res, userId);
    return true;
  }

  if (path === '/api/insights/dismiss' && req.method === 'POST') {
    await handleDismissInsight(req, res, userId);
    return true;
  }

  if (path === '/api/insights/feedback' && req.method === 'POST') {
    await handleInsightFeedback(req, res, userId);
    return true;
  }

  if (path === '/api/insights/summary' && req.method === 'GET') {
    await handleGetSummary(req, res, userId);
    return true;
  }

  return false;
}

export default {
  handlePredictiveInsightsRequest,
};
