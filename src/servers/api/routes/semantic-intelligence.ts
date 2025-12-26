/**
 * Semantic Intelligence API Routes
 *
 * Endpoints for accessing the "Better Than Human" semantic intelligence
 * capabilities including insights, patterns, and user context.
 *
 * @module servers/api/routes/semantic-intelligence
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  buildSemanticIntelligenceContext,
  formatSemanticIntelligenceContext,
  getSemanticIntelligenceSummary,
} from '../../../services/superhuman/semantic-intelligence/index.js';
import {
  getInsightsToSurface,
  markInsightSurfaced,
  dismissInsight,
  getPendingInsightCount,
} from '../../../services/superhuman/semantic-intelligence/insight-broker.js';
import { getAllOpenLoops, resolveLoop } from '../../../services/superhuman/semantic-intelligence/open-loops.js';
import {
  getPendingCommitments,
  getRememberedThings,
  fulfillCommitment,
} from '../../../services/superhuman/semantic-intelligence/ferni-commitments.js';
import { getGraphSummary, getAllPeople } from '../../../services/superhuman/semantic-intelligence/relationship-graph.js';
import { getTemporalContext } from '../../../services/superhuman/semantic-intelligence/temporal-patterns.js';
import { getSabotagePatterns, getBaseline } from '../../../services/superhuman/semantic-intelligence/behavioral-intelligence.js';
import { getEffectivenessProfile, getLearningStyle, getResistancePattern } from '../../../services/superhuman/semantic-intelligence/coaching-intelligence.js';
import { getBlindSpots, getGaps, getValuesAlignment } from '../../../services/superhuman/semantic-intelligence/self-awareness.js';

const log = createLogger({ module: 'SemanticIntelligenceRoutes' });

// Helper to parse JSON body
function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

// Helper to send JSON response
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Helper to get userId from headers or query
function getUserId(req: IncomingMessage, pathname: string): string | null {
  // Check header first
  const headerUserId = req.headers['x-user-id'] as string | undefined;
  if (headerUserId) return headerUserId;

  // Check query param
  const url = new URL(pathname, 'http://localhost');
  const queryUserId = url.searchParams.get('userId');
  if (queryUserId) return queryUserId;

  return null;
}

/**
 * Handle semantic intelligence routes
 */
export async function handleSemanticIntelligenceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // =========================================================================
  // GET /api/semantic-intelligence/summary
  // Quick overview of semantic intelligence state
  // =========================================================================
  if (pathname === '/api/semantic-intelligence/summary' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const summary = await getSemanticIntelligenceSummary(userId);
      sendJson(res, 200, {
        ...summary,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get summary');
      sendJson(res, 500, { error: 'Failed to get summary' });
    }
    return true;
  }

  // =========================================================================
  // GET /api/semantic-intelligence/context
  // Get full formatted context for LLM injection
  // =========================================================================
  if (pathname === '/api/semantic-intelligence/context' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const url = new URL(pathname + (req.url?.includes('?') ? req.url.split('?')[1] : ''), 'http://localhost');
      const context = await buildSemanticIntelligenceContext(userId, {
        topics: url.searchParams.get('topics')?.split(',') || undefined,
        emotion: url.searchParams.get('emotion') || undefined,
        personMentioned: url.searchParams.get('person') || undefined,
        isSessionStart: url.searchParams.get('sessionStart') === 'true',
      });
      
      const formatted = formatSemanticIntelligenceContext(context);
      
      sendJson(res, 200, {
        context,
        formatted,
        formattedLength: formatted.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to build context');
      sendJson(res, 500, { error: 'Failed to build context' });
    }
    return true;
  }

  // =========================================================================
  // PROACTIVE INSIGHTS (V3.2)
  // =========================================================================
  
  // GET /api/semantic-intelligence/insights
  if (pathname === '/api/semantic-intelligence/insights' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const url = new URL(req.url || '', 'http://localhost');
      const insights = await getInsightsToSurface(userId, {
        currentTopic: url.searchParams.get('topic') || undefined,
        currentPerson: url.searchParams.get('person') || undefined,
        currentEmotion: url.searchParams.get('emotion') || undefined,
        isSessionStart: url.searchParams.get('sessionStart') === 'true',
        hourOfDay: new Date().getHours(),
      });

      sendJson(res, 200, {
        insights,
        count: insights.length,
        pendingTotal: await getPendingInsightCount(userId),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get insights');
      sendJson(res, 500, { error: 'Failed to get insights' });
    }
    return true;
  }

  // POST /api/semantic-intelligence/insights/:id/surfaced
  if (pathname.match(/^\/api\/semantic-intelligence\/insights\/[^/]+\/surfaced$/) && req.method === 'POST') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    const insightId = pathname.split('/')[4];
    
    try {
      await markInsightSurfaced(userId, insightId);
      sendJson(res, 200, { success: true });
    } catch (error) {
      log.error({ error: String(error), userId, insightId }, 'Failed to mark insight surfaced');
      sendJson(res, 500, { error: 'Failed to mark insight surfaced' });
    }
    return true;
  }

  // POST /api/semantic-intelligence/insights/:id/dismiss
  if (pathname.match(/^\/api\/semantic-intelligence\/insights\/[^/]+\/dismiss$/) && req.method === 'POST') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    const insightId = pathname.split('/')[4];
    
    try {
      await dismissInsight(userId, insightId);
      sendJson(res, 200, { success: true });
    } catch (error) {
      log.error({ error: String(error), userId, insightId }, 'Failed to dismiss insight');
      sendJson(res, 500, { error: 'Failed to dismiss insight' });
    }
    return true;
  }

  // =========================================================================
  // OPEN LOOPS (V3.2)
  // =========================================================================

  // GET /api/semantic-intelligence/open-loops
  if (pathname === '/api/semantic-intelligence/open-loops' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const loops = await getAllOpenLoops(userId);
      sendJson(res, 200, {
        loops,
        count: loops.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get open loops');
      sendJson(res, 500, { error: 'Failed to get open loops' });
    }
    return true;
  }

  // POST /api/semantic-intelligence/open-loops/:id/resolve
  if (pathname.match(/^\/api\/semantic-intelligence\/open-loops\/[^/]+\/resolve$/) && req.method === 'POST') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    const loopId = pathname.split('/')[4];
    
    try {
      const body = await parseJsonBody(req);
      await resolveLoop(userId, loopId, body.resolution as string);
      sendJson(res, 200, { success: true });
    } catch (error) {
      log.error({ error: String(error), userId, loopId }, 'Failed to resolve loop');
      sendJson(res, 500, { error: 'Failed to resolve loop' });
    }
    return true;
  }

  // =========================================================================
  // FERNI COMMITMENTS (V3.2)
  // =========================================================================

  // GET /api/semantic-intelligence/commitments
  if (pathname === '/api/semantic-intelligence/commitments' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const [pending, remembered] = await Promise.all([
        getPendingCommitments(userId),
        getRememberedThings(userId),
      ]);
      
      sendJson(res, 200, {
        pending,
        remembered,
        pendingCount: pending.length,
        rememberedCount: remembered.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get commitments');
      sendJson(res, 500, { error: 'Failed to get commitments' });
    }
    return true;
  }

  // POST /api/semantic-intelligence/commitments/:id/fulfill
  if (pathname.match(/^\/api\/semantic-intelligence\/commitments\/[^/]+\/fulfill$/) && req.method === 'POST') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    const commitmentId = pathname.split('/')[4];
    
    try {
      await fulfillCommitment(userId, commitmentId);
      sendJson(res, 200, { success: true });
    } catch (error) {
      log.error({ error: String(error), userId, commitmentId }, 'Failed to fulfill commitment');
      sendJson(res, 500, { error: 'Failed to fulfill commitment' });
    }
    return true;
  }

  // =========================================================================
  // RELATIONSHIP GRAPH (V3.3)
  // =========================================================================

  // GET /api/semantic-intelligence/relationships
  if (pathname === '/api/semantic-intelligence/relationships' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const [summary, people] = await Promise.all([
        getGraphSummary(userId),
        getAllPeople(userId),
      ]);
      
      sendJson(res, 200, {
        summary,
        people,
        totalPeople: people.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get relationships');
      sendJson(res, 500, { error: 'Failed to get relationships' });
    }
    return true;
  }

  // =========================================================================
  // TEMPORAL PATTERNS (V3.4)
  // =========================================================================

  // GET /api/semantic-intelligence/temporal
  if (pathname === '/api/semantic-intelligence/temporal' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const context = await getTemporalContext(userId);
      sendJson(res, 200, {
        ...context,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get temporal patterns');
      sendJson(res, 500, { error: 'Failed to get temporal patterns' });
    }
    return true;
  }

  // =========================================================================
  // BEHAVIORAL INTELLIGENCE (V3.5)
  // =========================================================================

  // GET /api/semantic-intelligence/behavioral
  if (pathname === '/api/semantic-intelligence/behavioral' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const [patterns, baseline] = await Promise.all([
        getSabotagePatterns(userId),
        getBaseline(userId),
      ]);
      
      sendJson(res, 200, {
        sabotagePatterns: patterns,
        emotionalBaseline: baseline,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get behavioral intelligence');
      sendJson(res, 500, { error: 'Failed to get behavioral intelligence' });
    }
    return true;
  }

  // =========================================================================
  // COACHING INTELLIGENCE (V3.6)
  // =========================================================================

  // GET /api/semantic-intelligence/coaching
  if (pathname === '/api/semantic-intelligence/coaching' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const [effectiveness, learningStyle, resistance] = await Promise.all([
        getEffectivenessProfile(userId),
        getLearningStyle(userId),
        getResistancePattern(userId),
      ]);
      
      sendJson(res, 200, {
        effectiveness,
        learningStyle,
        resistance,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get coaching intelligence');
      sendJson(res, 500, { error: 'Failed to get coaching intelligence' });
    }
    return true;
  }

  // =========================================================================
  // SELF-AWARENESS (V3.7)
  // =========================================================================

  // GET /api/semantic-intelligence/self-awareness
  if (pathname === '/api/semantic-intelligence/self-awareness' && req.method === 'GET') {
    const userId = getUserId(req, pathname);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const [blindSpots, gaps, valuesAlignment] = await Promise.all([
        getBlindSpots(userId),
        getGaps(userId),
        getValuesAlignment(userId),
      ]);
      
      sendJson(res, 200, {
        blindSpots,
        selfPerceptionGaps: gaps,
        valuesAlignment,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get self-awareness data');
      sendJson(res, 500, { error: 'Failed to get self-awareness data' });
    }
    return true;
  }

  // Not handled
  return false;
}

