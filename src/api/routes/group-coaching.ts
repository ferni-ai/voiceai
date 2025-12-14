/**
 * Group Coaching API Routes
 *
 * API endpoints for multi-participant coaching sessions:
 * - POST /api/group/sessions - Create a new group session
 * - GET /api/group/sessions - Get user's group sessions
 * - GET /api/group/sessions/:sessionId - Get a specific session
 * - POST /api/group/sessions/:sessionId/start - Start a session
 * - POST /api/group/sessions/:sessionId/end - End a session
 * - POST /api/group/sessions/:sessionId/join - Request to join
 * - POST /api/group/sessions/:sessionId/approve - Approve join request
 * - DELETE /api/group/sessions/:sessionId/participants/:participantId - Remove participant
 * - POST /api/group/sessions/:sessionId/topics - Add topic
 * - POST /api/group/sessions/:sessionId/goals - Add shared goal
 * - POST /api/group/sessions/:sessionId/goals/:goalIndex/agree - Agree to goal
 * - GET /api/group/sessions/:sessionId/follow-ups - Get follow-ups
 *
 * @module GroupCoachingRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';

import { getGroupSessionManager } from '../../services/group-coaching/index.js';
import type {
  GroupInsight,
  GroupSessionConfig,
  GroupSessionType,
} from '../../services/group-coaching/types.js';
import { parseBody, requireUserId, sendError, sendJSON } from '../helpers.js';

const VALID_SESSION_TYPES: GroupSessionType[] = ['family', 'couple', 'team', 'peer_support'];

/**
 * Handle group coaching routes
 */
export async function handleGroupCoachingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/group/* routes
  if (!pathname.startsWith('/api/group')) {
    return false;
  }

  const method = req.method?.toUpperCase();
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return true;

  const manager = getGroupSessionManager();

  try {
    // POST /api/group/sessions - Create a new session
    if (pathname === '/api/group/sessions' && method === 'POST') {
      const body = (await parseBody(req)) as {
        type: GroupSessionType;
        config?: Partial<GroupSessionConfig>;
      };

      if (!body.type) {
        sendError(res, 'type is required', 400);
        return true;
      }

      if (!VALID_SESSION_TYPES.includes(body.type)) {
        sendError(res, `Invalid session type. Valid types: ${VALID_SESSION_TYPES.join(', ')}`, 400);
        return true;
      }

      const session = manager.createSession(userId, body.type, body.config);

      sendJSON(res, {
        success: true,
        session,
        joinLink: `/join/${session.id}`,
      });
      return true;
    }

    // GET /api/group/sessions - Get user's sessions
    if (pathname === '/api/group/sessions' && method === 'GET') {
      const sessions = manager.getUserSessions(userId);

      sendJSON(res, {
        success: true,
        sessions,
        total: sessions.length,
      });
      return true;
    }

    // Match session-specific routes
    const sessionMatch = pathname.match(/^\/api\/group\/sessions\/([^/]+)$/);
    const sessionActionMatch = pathname.match(/^\/api\/group\/sessions\/([^/]+)\/([^/]+)$/);
    const sessionNestedMatch = pathname.match(
      /^\/api\/group\/sessions\/([^/]+)\/([^/]+)\/([^/]+)$/
    );
    const participantMatch = pathname.match(
      /^\/api\/group\/sessions\/([^/]+)\/participants\/([^/]+)$/
    );
    const goalAgreeMatch = pathname.match(/^\/api\/group\/sessions\/([^/]+)\/goals\/(\d+)\/agree$/);

    // GET /api/group/sessions/:sessionId
    if (sessionMatch && method === 'GET') {
      const sessionId = sessionMatch[1];
      const session = manager.getSession(sessionId);

      if (!session) {
        sendError(res, 'Session not found', 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        session,
      });
      return true;
    }

    // POST /api/group/sessions/:sessionId/start
    if (sessionActionMatch && sessionActionMatch[2] === 'start' && method === 'POST') {
      const sessionId = sessionActionMatch[1];
      const success = manager.startSession(sessionId);

      if (!success) {
        sendError(res, 'Failed to start session', 400);
        return true;
      }

      sendJSON(res, {
        success: true,
        session: manager.getSession(sessionId),
      });
      return true;
    }

    // POST /api/group/sessions/:sessionId/end
    if (sessionActionMatch && sessionActionMatch[2] === 'end' && method === 'POST') {
      const sessionId = sessionActionMatch[1];
      const result = manager.endSession(sessionId);

      if (!result.success) {
        sendError(res, 'Failed to end session', 400);
        return true;
      }

      sendJSON(res, {
        success: true,
        summary: result.summary,
      });
      return true;
    }

    // POST /api/group/sessions/:sessionId/join
    if (sessionActionMatch && sessionActionMatch[2] === 'join' && method === 'POST') {
      const sessionId = sessionActionMatch[1];
      const body = (await parseBody(req)) as { displayName: string };

      if (!body.displayName) {
        sendError(res, 'displayName is required', 400);
        return true;
      }

      const result = manager.requestJoin(sessionId, userId, body.displayName);

      if (!result.success) {
        sendError(res, result.error || 'Failed to join', 400);
        return true;
      }

      sendJSON(res, {
        success: true,
        needsApproval: result.needsApproval,
        session: result.needsApproval ? undefined : manager.getSession(sessionId),
      });
      return true;
    }

    // POST /api/group/sessions/:sessionId/approve
    if (sessionActionMatch && sessionActionMatch[2] === 'approve' && method === 'POST') {
      const sessionId = sessionActionMatch[1];
      const body = (await parseBody(req)) as { participantUserId: string };

      if (!body.participantUserId) {
        sendError(res, 'participantUserId is required', 400);
        return true;
      }

      const success = manager.approveJoin(sessionId, body.participantUserId, userId);

      if (!success) {
        sendError(res, 'Failed to approve', 400);
        return true;
      }

      sendJSON(res, {
        success: true,
        session: manager.getSession(sessionId),
      });
      return true;
    }

    // DELETE /api/group/sessions/:sessionId/participants/:participantId
    if (participantMatch && method === 'DELETE') {
      const sessionId = participantMatch[1];
      const participantId = participantMatch[2];

      const success = manager.removeParticipant(sessionId, participantId, userId);

      if (!success) {
        sendError(res, 'Failed to remove participant', 400);
        return true;
      }

      sendJSON(res, { success: true });
      return true;
    }

    // POST /api/group/sessions/:sessionId/topics
    if (sessionActionMatch && sessionActionMatch[2] === 'topics' && method === 'POST') {
      const sessionId = sessionActionMatch[1];
      const body = (await parseBody(req)) as { topic: string };

      if (!body.topic) {
        sendError(res, 'topic is required', 400);
        return true;
      }

      manager.addTopic(sessionId, body.topic, userId);

      sendJSON(res, {
        success: true,
        session: manager.getSession(sessionId),
      });
      return true;
    }

    // POST /api/group/sessions/:sessionId/goals
    if (sessionActionMatch && sessionActionMatch[2] === 'goals' && method === 'POST') {
      const sessionId = sessionActionMatch[1];
      const body = (await parseBody(req)) as { goal: string };

      if (!body.goal) {
        sendError(res, 'goal is required', 400);
        return true;
      }

      manager.addSharedGoal(sessionId, body.goal, userId);

      sendJSON(res, {
        success: true,
        session: manager.getSession(sessionId),
      });
      return true;
    }

    // POST /api/group/sessions/:sessionId/goals/:goalIndex/agree
    if (goalAgreeMatch && method === 'POST') {
      const sessionId = goalAgreeMatch[1];
      const goalIndex = parseInt(goalAgreeMatch[2], 10);

      const success = manager.agreeToGoal(sessionId, goalIndex, userId);

      if (!success) {
        sendError(res, 'Failed to agree to goal', 400);
        return true;
      }

      sendJSON(res, {
        success: true,
        session: manager.getSession(sessionId),
      });
      return true;
    }

    // POST /api/group/sessions/:sessionId/insights
    if (sessionActionMatch && sessionActionMatch[2] === 'insights' && method === 'POST') {
      const sessionId = sessionActionMatch[1];
      const body = (await parseBody(req)) as Omit<GroupInsight, 'id' | 'createdAt'>;

      if (!body.type || !body.content) {
        sendError(res, 'type and content are required', 400);
        return true;
      }

      manager.addGroupInsight(sessionId, body);

      sendJSON(res, {
        success: true,
        session: manager.getSession(sessionId),
      });
      return true;
    }

    // GET /api/group/sessions/:sessionId/follow-ups
    if (sessionNestedMatch && sessionNestedMatch[2] === 'follow-ups' && method === 'GET') {
      const sessionId = sessionNestedMatch[1];
      const followUps = manager.generateFollowUps(sessionId);

      // Convert Map to object
      const followUpsObj: Record<string, unknown> = {};
      for (const [key, value] of followUps) {
        followUpsObj[key] = value;
      }

      sendJSON(res, {
        success: true,
        followUps: followUpsObj,
        count: followUps.size,
      });
      return true;
    }

    // GET /api/group/active - Get all active sessions (for admin/monitoring)
    if (pathname === '/api/group/active' && method === 'GET') {
      const sessions = manager.getActiveSessions();

      sendJSON(res, {
        success: true,
        sessions,
        count: sessions.length,
      });
      return true;
    }

    // Route not handled by this module
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, errorMessage, 500);
    return true;
  }
}
