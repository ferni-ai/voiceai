/**
 * Relationship Arc API Routes
 *
 * Serves relationship stage and arc data for frontend visualization and E2E tests.
 * Powers the "Better Than Human" relationship progression system:
 * - Current relationship stage (stranger → acquaintance → friend → trusted_advisor)
 * - First meeting data (first words, detected energy)
 * - Key moments (vulnerabilities, breakthroughs, celebrations)
 * - Stage transitions
 *
 * PRIVACY: All data is user-scoped and requires authentication.
 *
 * @module api/relationship-arc-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth, type AuthContext } from './auth-middleware.js';
import {
  loadRelationshipArcData,
  saveRelationshipArcData,
  recordFirstMeeting,
  recordKeyMoment,
  forceStageTransition,
  incrementSessionStats,
  getCurrentStage,
  markFirstWordsCallbackMade,
} from '../intelligence/context-builders/relationship/arc/storage.js';
import {
  createDefaultRelationshipArcData,
  determineStage,
  type RelationshipStage,
  type FirstMeetingData,
  type KeyMoment,
} from '../intelligence/context-builders/relationship/arc/types.js';

const log = createLogger({ module: 'RelationshipArc' });

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

/**
 * Get userId from authenticated context
 * SECURITY: userId should come from auth, not query params (to prevent IDOR)
 */
function getUserIdFromAuth(auth: AuthContext, parsedUrl: URL): string | null {
  // Primary: use authenticated userId
  if (auth.userId) return auth.userId;

  // Fallback for admin accessing another user's data
  const queryUserId = parsedUrl.searchParams.get('userId');
  if (queryUserId && auth.isAdmin) return queryUserId;

  return null;
}

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleRelationshipArcRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith('/api/relationship')) {
    return false;
  }

  // Apply rate limiting (60 requests per minute)
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000, keyPrefix: 'relationship-arc' })) {
    return true; // Rate limited
  }

  // Require authentication
  const auth = (await requireAuth(req, res, { allowDevMode: true })) as AuthContext | null;
  if (!auth) {
    return true; // 401 already sent
  }

  const userId = getUserIdFromAuth(auth, parsedUrl);
  if (!userId) {
    sendError(res, 'User ID required', 401);
    return true;
  }

  // ============================================================================
  // GET /api/relationship/stage - Get current stage
  // ============================================================================
  if (pathname === '/api/relationship/stage' && req.method === 'GET') {
    try {
      const stage = await getCurrentStage(userId);
      sendJson(res, { userId, stage });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error getting stage');
      sendError(res, 'Failed to get relationship stage', 500);
      return true;
    }
  }

  // ============================================================================
  // GET /api/relationship/arc - Get full relationship arc data
  // ============================================================================
  if (pathname === '/api/relationship/arc' && req.method === 'GET') {
    try {
      const data = await loadRelationshipArcData(userId);
      sendJson(res, {
        userId,
        arc: data || createDefaultRelationshipArcData(userId),
        generatedAt: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error getting arc');
      sendError(res, 'Failed to get relationship arc', 500);
      return true;
    }
  }

  // ============================================================================
  // GET /api/relationship/first-meeting - Get first meeting data
  // ============================================================================
  if (pathname === '/api/relationship/first-meeting' && req.method === 'GET') {
    try {
      const data = await loadRelationshipArcData(userId);
      sendJson(res, {
        userId,
        firstMeeting: data?.firstMeeting || null,
        hasFirstMeeting: !!data?.firstMeeting,
      });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error getting first meeting');
      sendError(res, 'Failed to get first meeting', 500);
      return true;
    }
  }

  // ============================================================================
  // POST /api/relationship/first-meeting - Record first meeting (for testing)
  // ============================================================================
  if (pathname === '/api/relationship/first-meeting' && req.method === 'POST') {
    try {
      const body = await parseBody<FirstMeetingData>(req);

      if (!body.firstWords) {
        sendError(res, 'firstWords is required', 400);
        return true;
      }

      const firstMeetingData: FirstMeetingData = {
        firstWords: body.firstWords,
        detectedEnergy: body.detectedEnergy || 'neutral',
        timestamp: body.timestamp || Date.now(),
        speechRate: body.speechRate,
        observations: body.observations || [],
        firstWordsCallbackMade: body.firstWordsCallbackMade || false,
      };

      await recordFirstMeeting(userId, firstMeetingData);
      sendJson(res, { success: true, firstMeeting: firstMeetingData }, 201);
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error recording first meeting');
      sendError(res, 'Failed to record first meeting', 500);
      return true;
    }
  }

  // ============================================================================
  // GET /api/relationship/moments - Get key moments
  // ============================================================================
  if (pathname === '/api/relationship/moments' && req.method === 'GET') {
    try {
      const data = await loadRelationshipArcData(userId);
      const type = parsedUrl.searchParams.get('type') as KeyMoment['type'] | null;
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);

      let moments = data?.keyMoments || [];
      if (type) {
        moments = moments.filter((m) => m.type === type);
      }
      moments = moments.slice(0, limit);

      sendJson(res, {
        userId,
        moments,
        total: data?.keyMoments?.length || 0,
      });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error getting moments');
      sendError(res, 'Failed to get moments', 500);
      return true;
    }
  }

  // ============================================================================
  // POST /api/relationship/moments - Record a key moment
  // ============================================================================
  if (pathname === '/api/relationship/moments' && req.method === 'POST') {
    try {
      const body = await parseBody<Omit<KeyMoment, 'id' | 'referencedCount'>>(req);

      if (!body.type || !body.summary) {
        sendError(res, 'type and summary are required', 400);
        return true;
      }

      const id = await recordKeyMoment(userId, {
        type: body.type,
        summary: body.summary,
        quote: body.quote,
        timestamp: body.timestamp || Date.now(),
        sessionId: body.sessionId || 'manual',
        personaId: body.personaId || 'ferni',
      });

      sendJson(res, { success: true, momentId: id }, 201);
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error recording moment');
      sendError(res, 'Failed to record moment', 500);
      return true;
    }
  }

  // ============================================================================
  // GET /api/relationship/transitions - Get stage transitions
  // ============================================================================
  if (pathname === '/api/relationship/transitions' && req.method === 'GET') {
    try {
      const data = await loadRelationshipArcData(userId);
      sendJson(res, {
        userId,
        transitions: data?.stageTransitions || [],
        currentStage: data?.currentStage || 'stranger',
      });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error getting transitions');
      sendError(res, 'Failed to get transitions', 500);
      return true;
    }
  }

  // ============================================================================
  // POST /api/relationship/transitions - Force stage transition (admin/testing)
  // ============================================================================
  if (pathname === '/api/relationship/transitions' && req.method === 'POST') {
    try {
      const body = await parseBody<{ stage: RelationshipStage; trigger?: string }>(req);

      if (!body.stage) {
        sendError(res, 'stage is required', 400);
        return true;
      }

      const validStages: RelationshipStage[] = [
        'stranger',
        'acquaintance',
        'friend',
        'trusted_advisor',
      ];
      if (!validStages.includes(body.stage)) {
        sendError(res, `Invalid stage. Must be one of: ${validStages.join(', ')}`, 400);
        return true;
      }

      await forceStageTransition(userId, body.stage, body.trigger || 'Manual transition');
      const newStage = await getCurrentStage(userId);

      sendJson(res, { success: true, stage: newStage }, 201);
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error forcing transition');
      sendError(res, 'Failed to force transition', 500);
      return true;
    }
  }

  // ============================================================================
  // POST /api/relationship/session-complete - Increment session stats
  // ============================================================================
  if (pathname === '/api/relationship/session-complete' && req.method === 'POST') {
    try {
      const body = await parseBody<{ turnCount: number }>(req);

      if (typeof body.turnCount !== 'number' || body.turnCount < 0) {
        sendError(res, 'turnCount must be a non-negative number', 400);
        return true;
      }

      await incrementSessionStats(userId, body.turnCount);
      const data = await loadRelationshipArcData(userId);

      sendJson(res, {
        success: true,
        totalSessions: data?.totalSessions || 0,
        totalTurns: data?.totalTurns || 0,
        currentStage: data?.currentStage || 'stranger',
      });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error updating session stats');
      sendError(res, 'Failed to update session stats', 500);
      return true;
    }
  }

  // ============================================================================
  // POST /api/relationship/first-words-callback - Mark first words callback made
  // ============================================================================
  if (pathname === '/api/relationship/first-words-callback' && req.method === 'POST') {
    try {
      await markFirstWordsCallbackMade(userId);
      sendJson(res, { success: true });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error marking callback');
      sendError(res, 'Failed to mark callback', 500);
      return true;
    }
  }

  // ============================================================================
  // DELETE /api/relationship/arc - Reset relationship arc (for testing)
  // ============================================================================
  if (pathname === '/api/relationship/arc' && req.method === 'DELETE') {
    try {
      // Only allow in dev mode or for admins
      if (!auth.isAdmin) {
        sendError(res, 'Admin access required', 403);
        return true;
      }

      const freshArc = createDefaultRelationshipArcData(userId);
      await saveRelationshipArcData(freshArc);

      sendJson(res, { success: true, message: 'Relationship arc reset' });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error resetting arc');
      sendError(res, 'Failed to reset arc', 500);
      return true;
    }
  }

  // ============================================================================
  // GET /api/relationship/summary - Get summary for UI
  // ============================================================================
  if (pathname === '/api/relationship/summary' && req.method === 'GET') {
    try {
      const data = await loadRelationshipArcData(userId);
      const arc = data || createDefaultRelationshipArcData(userId);

      sendJson(res, {
        userId,
        stage: arc.currentStage,
        stageLabel: getStageLabel(arc.currentStage),
        totalSessions: arc.totalSessions,
        totalTurns: arc.totalTurns,
        hasFirstMeeting: !!arc.firstMeeting,
        firstMeetingEnergy: arc.firstMeeting?.detectedEnergy,
        keyMomentsCount: arc.keyMoments.length,
        vulnerabilityCount: arc.vulnerabilityCount,
        breakthroughCount: arc.breakthroughCount,
        celebrationCount: arc.celebrationCount,
        daysKnown: arc.firstSessionDate
          ? Math.floor((Date.now() - arc.firstSessionDate) / (24 * 60 * 60 * 1000))
          : 0,
        nextStage: getNextStage(arc.currentStage),
        sessionsToNextStage: getSessionsToNextStage(arc.currentStage, arc.totalSessions),
      });
      return true;
    } catch (err) {
      log.error({ error: err, userId }, 'Error getting summary');
      sendError(res, 'Failed to get summary', 500);
      return true;
    }
  }

  return false;
}

// ============================================================================
// HELPERS
// ============================================================================

function getStageLabel(stage: RelationshipStage): string {
  const labels: Record<RelationshipStage, string> = {
    stranger: 'Just Met',
    acquaintance: 'Getting to Know Each Other',
    friend: 'Building Real Connection',
    trusted_advisor: 'Deep Partnership',
  };
  return labels[stage];
}

function getNextStage(stage: RelationshipStage): RelationshipStage | null {
  const progression: Record<RelationshipStage, RelationshipStage | null> = {
    stranger: 'acquaintance',
    acquaintance: 'friend',
    friend: 'trusted_advisor',
    trusted_advisor: null,
  };
  return progression[stage];
}

function getSessionsToNextStage(stage: RelationshipStage, currentSessions: number): number | null {
  const thresholds: Record<RelationshipStage, number> = {
    stranger: 2, // Need 2 sessions to become acquaintance
    acquaintance: 6, // Need 6 sessions to become friend
    friend: 15, // Need 15 sessions to become trusted_advisor
    trusted_advisor: Infinity,
  };

  const target = thresholds[stage];
  if (target === Infinity) return null;

  return Math.max(0, target - currentSessions);
}
