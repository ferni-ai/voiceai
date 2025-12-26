/**
 * Life Context API Routes
 *
 * REST API endpoints for the Phase 6 Life Context Dashboard:
 * - GET /api/life-context - Get current life context snapshot
 * - POST /api/life-context/refresh - Force refresh life context
 *
 * @module LifeContextRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'LifeContextRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface LifeContextResponse {
  snapshot: {
    overallLoadScore: number;
    wellbeingScore: number;
    stressIndicators: Array<{
      domain: string;
      stressLevel: number;
      reason: string;
      sourcePersona: string;
    }>;
    patterns: Array<{
      description: string;
      domains: string[];
      impact: 'positive' | 'negative' | 'neutral';
    }>;
    createdAt: string;
  };
  triggers: Array<{
    id: string;
    category: string;
    suggestedResponse: string;
    reasoning: string;
    confidence: number;
    priority: string;
    contributingDomains: string[];
    recommendedPersona: string;
  }>;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/life-context
 * Returns current life context snapshot and triggers
 */
async function getLifeContext(userId: string, res: ServerResponse): Promise<void> {
  try {
    const { aggregateLifeContext, generateSynthesisTriggers } =
      await import('../intelligence/triggers/index.js');

    const snapshot = await aggregateLifeContext(userId);

    if (!snapshot) {
      sendJSON(res, {
        snapshot: {
          overallLoadScore: 0.5,
          wellbeingScore: 0.5,
          stressIndicators: [],
          patterns: [],
          createdAt: new Date().toISOString(),
        },
        triggers: [],
      });
      return;
    }

    const triggers = generateSynthesisTriggers(snapshot);

    const response: LifeContextResponse = {
      snapshot: {
        overallLoadScore: snapshot.overallLoadScore,
        wellbeingScore: snapshot.wellbeingScore,
        stressIndicators: snapshot.stressIndicators,
        patterns: snapshot.patterns,
        createdAt: snapshot.createdAt.toISOString(),
      },
      triggers: triggers.map((t) => ({
        id: t.id,
        category: t.category,
        suggestedResponse: t.suggestedResponse,
        reasoning: t.reasoning,
        confidence: t.confidence,
        priority: t.priority,
        contributingDomains: t.contributingDomains,
        recommendedPersona: t.recommendedPersona,
      })),
    };

    log.debug(
      { userId, load: snapshot.overallLoadScore, triggers: triggers.length },
      'Life context retrieved'
    );
    sendJSON(res, response);
  } catch (error) {
    log.error({ error, userId }, 'Failed to get life context');
    sendError(res, 'Failed to retrieve life context', 500);
  }
}

/**
 * POST /api/life-context/refresh
 * Force refresh life context data
 */
async function refreshLifeContext(userId: string, res: ServerResponse): Promise<void> {
  try {
    const { triggerLifeContextScan } = await import('../services/life-context-broadcast.js');

    const snapshot = await triggerLifeContextScan(userId);

    if (!snapshot) {
      sendJSON(res, { success: false, message: 'No life context data available' });
      return;
    }

    const { generateSynthesisTriggers } = await import('../intelligence/triggers/index.js');
    const triggers = generateSynthesisTriggers(snapshot);

    log.info({ userId, load: snapshot.overallLoadScore }, 'Life context refreshed');
    sendJSON(res, {
      success: true,
      snapshot: {
        overallLoadScore: snapshot.overallLoadScore,
        wellbeingScore: snapshot.wellbeingScore,
        stressIndicators: snapshot.stressIndicators,
        patterns: snapshot.patterns,
        createdAt: snapshot.createdAt.toISOString(),
      },
      triggers: triggers.map((t) => ({
        id: t.id,
        category: t.category,
        suggestedResponse: t.suggestedResponse,
        reasoning: t.reasoning,
        confidence: t.confidence,
        priority: t.priority,
        contributingDomains: t.contributingDomains,
        recommendedPersona: t.recommendedPersona,
      })),
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to refresh life context');
    sendError(res, 'Failed to refresh life context', 500);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 500): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function getParam(url: URL, name: string): string | null {
  return url.searchParams.get(name);
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleLifeContextRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/life-context')) {
    return false;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
    });
    res.end();
    return true;
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Get userId from query or header
  // SECURITY: Prioritize Firebase auth (x-firebase-uid) over deprecated x-user-id
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const firebaseUid = req.headers['x-firebase-uid'] as string | undefined;
  const userId = firebaseUid || getParam(url, 'userId') || (req.headers['x-user-id'] as string);

  if (!userId) {
    sendError(res, 'userId is required', 400);
    return true;
  }

  try {
    // GET /api/life-context
    if (pathname === '/api/life-context' && req.method === 'GET') {
      await getLifeContext(userId, res);
      return true;
    }

    // POST /api/life-context/refresh
    if (pathname === '/api/life-context/refresh' && req.method === 'POST') {
      await refreshLifeContext(userId, res);
      return true;
    }

    // Not found
    sendError(res, 'Not found', 404);
    return true;
  } catch (err) {
    log.error({ error: err, userId }, 'Life context route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

export default { handleLifeContextRoutes };
