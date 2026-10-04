/**
 * 🎮 Social API Routes
 *
 * Endpoints for:
 * - Challenges (create, accept, complete)
 * - Taste Match game
 * - Leaderboards
 * - User stats
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import { claimedUserFor, type VerifiedCaller } from '../acting-user.js';
import { rateLimit, requireAuth } from '../auth-middleware.js';
import { LimitReachedError } from '../../services/social/open-challenge-slots.js';
import { parseBody } from '../helpers.js';
import { challengeCreateLimit, resultRecordLimit } from './challenge-limits.js';
import { isRecordableGame, publicEntries, socialBoardFrom } from './leaderboard-view.js';
import { gameResultFrom, isOptionalTime, isScore, isValidNewChallenge } from './score-input.js';
import {
  createChallenge,
  acceptChallenge,
  completeChallenge,
  declineChallenge,
  getChallenge,
  getChallengeByShareCode,
  getPendingChallenges,
  getChallengeHistory,
  createTasteMatchSession,
  joinTasteMatchSession,
  setParticipantReady,
  submitTasteMatchAnswer,
  getTasteMatchSession,
  getCurrentQuestion,
  type Challenge,
  type ChallengeType,
} from '../../services/social/multiplayer-games.js';
import {
  getUserStats,
  updateUserStats,
  recordChallengeResult,
  getLeaderboard,
  getUserRank,
  getLeaderboardAroundUser,
  seedLeaderboardData,
} from '../../services/social/leaderboards.js';

const log = getLogger();

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** The challenge, if the caller is its challengee (or an admin); else sends 404/403. */
async function challengeFor(
  caller: VerifiedCaller,
  id: unknown,
  res: ServerResponse
): Promise<Challenge | null> {
  const challenge = typeof id === 'string' ? await getChallenge(id) : null;
  if (!challenge) send(res, 404, { error: 'Challenge not found' });
  else if (challenge.challengeeId === caller.userId || caller.isAdmin) return challenge;
  else send(res, 403, { error: "That challenge isn't yours to answer" });
  return null;
}

/**
 * Handle Social API routes
 */
export async function handleSocialRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  searchParams: URLSearchParams
): Promise<boolean> {
  // Only handle /api/social/* routes
  if (!pathname.startsWith('/api/social')) {
    return false;
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  const method = req.method || 'GET';

  try {
    // Every write acts for the verified caller; users named in a body are checked against it.
    const auth = method === 'POST' ? await requireAuth(req, res) : null;
    if (method === 'POST' && !auth) return true;
    // GET routes don't act for anyone; an empty caller would be refused (401) if they did.
    const caller: VerifiedCaller = auth ?? { userId: '', isAdmin: false };

    // ========================================
    // CHALLENGE ROUTES
    // ========================================

    // POST /api/social/challenges/create
    if (pathname === '/api/social/challenges/create' && method === 'POST') {
      const body = await parseBody<{
        type: ChallengeType;
        gameType: string;
        challengerId?: string;
        challengerName: string;
        challengeeId: string;
        challengerScore?: number;
        challengerTimeMs?: number;
      }>(req);
      const { type, gameType, challengerName, challengeeId, challengerScore, challengerTimeMs } =
        body;
      // The challenger is the caller; the challengee is legitimately someone else.
      const challengerId = claimedUserFor(caller, body.challengerId, res);
      if (!challengerId) return true;

      const fields = {
        type,
        gameType,
        challengeeId,
        score: challengerScore,
        timeMs: challengerTimeMs,
      };
      if (!challengerName || !isValidNewChallenge(fields, challengerId, 'social')) {
        send(res, 400, { error: 'Missing or invalid fields' });
        return true;
      }

      if (rateLimit(req, res, challengeCreateLimit('social', challengerId))) return true;
      try {
        const challenge = await createChallenge(
          type,
          gameType,
          challengerId,
          challengerName,
          challengeeId,
          { challengerScore, challengerTimeMs }
        );
        send(res, 200, { challenge });
      } catch (error) {
        if (!(error instanceof LimitReachedError)) throw error;
        send(res, 429, { error: 'Too many open challenges. Wait for some answers first.' });
      }
      return true;
    }

    // POST /api/social/challenges/accept
    if (pathname === '/api/social/challenges/accept' && method === 'POST') {
      const body = await parseBody(req);
      const { challengeId, challengeeId, challengeeName } = body as {
        challengeId: string;
        challengeeId: string;
        challengeeName: string;
      };

      if (!challengeId || !challengeeName) {
        send(res, 400, { error: 'Missing required fields' });
        return true;
      }
      if (!claimedUserFor(caller, challengeeId, res)) return true;
      if (!(await challengeFor(caller, challengeId, res))) return true;

      const challenge = await acceptChallenge(challengeId, caller, challengeeName);

      if (!challenge) {
        send(res, 404, { error: 'Challenge not found or already processed' });
        return true;
      }

      send(res, 200, { challenge });
      return true;
    }

    // POST /api/social/challenges/complete
    if (pathname === '/api/social/challenges/complete' && method === 'POST') {
      const body = await parseBody<{
        challengeId?: string;
        challengeeScore?: unknown;
        challengeeTimeMs?: unknown;
      }>(req);
      const { challengeId, challengeeScore, challengeeTimeMs } = body;

      if (!challengeId || !isScore(challengeeScore) || !isOptionalTime(challengeeTimeMs)) {
        send(res, 400, { error: 'Missing or invalid fields' });
        return true;
      }

      if (!(await challengeFor(caller, challengeId, res))) return true;

      const challenge = await completeChallenge(
        challengeId,
        caller,
        challengeeScore,
        challengeeTimeMs
      );

      if (!challenge) {
        send(res, 404, { error: 'Challenge not found or not accepted' });
        return true;
      }

      // Record challenge results for both users
      await Promise.all([
        recordChallengeResult(
          challenge.challengerId,
          challenge.winnerId === challenge.challengerId
        ),
        recordChallengeResult(
          challenge.challengeeId,
          challenge.winnerId === challenge.challengeeId
        ),
      ]);

      send(res, 200, { challenge });
      return true;
    }

    // POST /api/social/challenges/decline
    if (pathname === '/api/social/challenges/decline' && method === 'POST') {
      const body = await parseBody(req);
      const { challengeId, challengeeId } = body as {
        challengeId: string;
        challengeeId: string;
      };

      if (!claimedUserFor(caller, challengeeId, res)) return true;
      if (!(await challengeFor(caller, challengeId, res))) return true;

      send(res, 200, { success: await declineChallenge(challengeId, caller) });
      return true;
    }

    // GET /api/social/challenges/pending and /history: the caller's own challenges.
    // Matched before /challenges/:id, which would otherwise take "pending" as an id.
    const own = pathname.match(/^\/api\/social\/challenges\/(pending|history)$/);
    if (own && method === 'GET') {
      const viewer = await requireAuth(req, res);
      if (!viewer) return true;
      const userId = claimedUserFor(viewer, searchParams.get('userId'), res);
      if (!userId) return true;
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '', 10) || 20, 1), 100);
      const challenges =
        own[1] === 'pending'
          ? await getPendingChallenges(userId)
          : await getChallengeHistory(userId, limit);
      send(res, 200, { challenges });
      return true;
    }

    // GET /api/social/challenges/:id
    if (pathname.match(/^\/api\/social\/challenges\/[^/]+$/) && method === 'GET') {
      const idOrCode = pathname.split('/').pop() || '';

      // Try ID first, then share code
      let challenge = await getChallenge(idOrCode);
      if (!challenge) {
        challenge = await getChallengeByShareCode(idOrCode);
      }

      if (!challenge) {
        send(res, 404, { error: 'Challenge not found' });
        return true;
      }

      send(res, 200, { challenge });
      return true;
    }

    // ========================================
    // TASTE MATCH ROUTES
    // ========================================

    // POST /api/social/tastematch/create
    if (pathname === '/api/social/tastematch/create' && method === 'POST') {
      const body = await parseBody(req);
      const { hostUserId, hostDisplayName, rounds } = body as {
        hostUserId: string;
        hostDisplayName: string;
        rounds?: number;
      };

      const host = claimedUserFor(caller, hostUserId, res);
      if (!host) return true;
      if (!hostDisplayName) {
        send(res, 400, { error: 'Missing required fields' });
        return true;
      }

      if (rateLimit(req, res, challengeCreateLimit('tastematch', host))) return true;
      const session = await createTasteMatchSession(host, hostDisplayName, rounds);

      send(res, 200, { session });
      return true;
    }

    // POST /api/social/tastematch/join
    if (pathname === '/api/social/tastematch/join' && method === 'POST') {
      const body = await parseBody(req);
      const { sessionId, userId, displayName } = body as {
        sessionId: string;
        userId: string;
        displayName: string;
      };

      const joiner = claimedUserFor(caller, userId, res);
      if (!joiner) return true;
      if (!sessionId || !displayName) {
        send(res, 400, { error: 'Missing required fields' });
        return true;
      }

      const session = await joinTasteMatchSession(sessionId, joiner, displayName);

      if (!session) {
        send(res, 404, { error: 'Session not found or full' });
        return true;
      }

      send(res, 200, { session });
      return true;
    }

    // POST /api/social/tastematch/ready
    if (pathname === '/api/social/tastematch/ready' && method === 'POST') {
      const body = await parseBody(req);
      const { sessionId, userId } = body as {
        sessionId: string;
        userId: string;
      };

      const participant = claimedUserFor(caller, userId, res);
      if (!participant) return true;
      const session = await setParticipantReady(sessionId, participant);

      if (!session) {
        send(res, 404, { error: 'Session not found' });
        return true;
      }

      send(res, 200, { session });
      return true;
    }

    // POST /api/social/tastematch/answer
    if (pathname === '/api/social/tastematch/answer' && method === 'POST') {
      const body = await parseBody(req);
      const { sessionId, userId, answer, timeMs } = body as {
        sessionId: string;
        userId: string;
        answer: string;
        timeMs: number;
      };

      const player = claimedUserFor(caller, userId, res);
      if (!player) return true;
      if (typeof answer !== 'string' || answer.length > 500 || !isOptionalTime(timeMs)) {
        send(res, 400, { error: 'Invalid answer' });
        return true;
      }
      const session = await submitTasteMatchAnswer(sessionId, player, answer, timeMs);

      if (!session) {
        send(res, 404, { error: 'Session not found or not in progress' });
        return true;
      }

      send(res, 200, { session });
      return true;
    }

    // GET /api/social/tastematch/:sessionId
    if (pathname.match(/^\/api\/social\/tastematch\/[^/]+$/) && method === 'GET') {
      const sessionId = pathname.split('/').pop() || '';
      const session = await getTasteMatchSession(sessionId);

      if (!session) {
        send(res, 404, { error: 'Session not found' });
        return true;
      }

      const currentQuestion = await getCurrentQuestion(sessionId);

      send(res, 200, { session, currentQuestion });
      return true;
    }

    // ========================================
    // LEADERBOARD ROUTES
    // ========================================

    // GET /api/social/leaderboard?period=weekly&gameType=overall&scope=global
    if (pathname === '/api/social/leaderboard' && method === 'GET') {
      const board = socialBoardFrom(searchParams);
      if (!board) {
        send(res, 400, { error: 'Unknown leaderboard' });
        return true;
      }
      const leaderboard = await getLeaderboard(board.period, board.gameType, board.scope);
      send(res, 200, {
        leaderboard: { ...leaderboard, entries: publicEntries(leaderboard.entries, req) },
      });
      return true;
    }

    // GET /api/social/leaderboard/around?userId=xxx
    if (pathname === '/api/social/leaderboard/around' && method === 'GET') {
      const userId = searchParams.get('userId');
      const board = socialBoardFrom(searchParams);
      if (!userId || !board) {
        send(res, 400, { error: userId ? 'Unknown leaderboard' : 'Missing userId' });
        return true;
      }

      const entries = await getLeaderboardAroundUser(userId, board.period, board.gameType);
      const rank = await getUserRank(userId, board.period, board.gameType);

      send(res, 200, { entries: publicEntries(entries, req), rank });
      return true;
    }

    // ========================================
    // USER STATS ROUTES
    // ========================================

    // GET /api/social/stats?userId=xxx
    if (pathname === '/api/social/stats' && method === 'GET') {
      const userId = searchParams.get('userId');
      const displayName = searchParams.get('displayName') || undefined;

      if (!userId) {
        send(res, 400, { error: 'Missing userId' });
        return true;
      }

      const stats = await getUserStats(userId, displayName);
      const weeklyRank = await getUserRank(userId, 'weekly', 'overall');

      send(res, 200, { stats, weeklyRank });
      return true;
    }

    // POST /api/social/stats/update
    if (pathname === '/api/social/stats/update' && method === 'POST') {
      const body = await parseBody<{ userId?: string; gameType?: unknown; result?: unknown }>(req);
      const statsUser = claimedUserFor(caller, body.userId, res);
      if (!statsUser) return true;
      const result = gameResultFrom(body.result);
      if (!isRecordableGame(body.gameType) || !result) {
        send(res, 400, { error: 'Missing or invalid fields' });
        return true;
      }
      if (rateLimit(req, res, resultRecordLimit('social', statsUser))) return true;

      const stats = await updateUserStats(statsUser, body.gameType, result);

      send(res, 200, { stats });
      return true;
    }

    // POST /api/social/seed: fills the leaderboard with made-up players, so admins only.
    if (pathname === '/api/social/seed' && method === 'POST') {
      if (!caller.isAdmin) {
        send(res, 403, { error: 'Not authorized' });
        return true;
      }
      try {
        await seedLeaderboardData();
      } catch {
        send(res, 403, { error: 'Seeding is for development only' });
        return true;
      }
      send(res, 200, { success: true, message: 'Leaderboard seeded' });
      return true;
    }

    // Route not found
    return false;
  } catch (error) {
    log.error({ error, pathname }, '🎮 Social route error');
    send(res, 500, { error: 'Internal server error' });
    return true;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

// parseBody imported from '../helpers.js'
