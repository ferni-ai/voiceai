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
  type LeaderboardPeriod,
  type LeaderboardScope,
} from '../../services/social/leaderboards.js';

const log = getLogger();

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  const method = req.method || 'GET';

  try {
    // ========================================
    // CHALLENGE ROUTES
    // ========================================

    // POST /api/social/challenges/create
    if (pathname === '/api/social/challenges/create' && method === 'POST') {
      const body = await parseBody(req);
      const {
        type,
        gameType,
        challengerId,
        challengerName,
        challengeeId,
        challengerScore,
        challengerTimeMs,
      } = body as {
        type: ChallengeType;
        gameType: string;
        challengerId: string;
        challengerName: string;
        challengeeId: string;
        challengerScore?: number;
        challengerTimeMs?: number;
      };

      if (!type || !gameType || !challengerId || !challengerName || !challengeeId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return true;
      }

      const challenge = createChallenge(
        type,
        gameType,
        challengerId,
        challengerName,
        challengeeId,
        { challengerScore, challengerTimeMs }
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ challenge }));
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

      if (!challengeId || !challengeeId || !challengeeName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return true;
      }

      const challenge = acceptChallenge(challengeId, challengeeId, challengeeName);

      if (!challenge) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Challenge not found or already processed' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ challenge }));
      return true;
    }

    // POST /api/social/challenges/complete
    if (pathname === '/api/social/challenges/complete' && method === 'POST') {
      const body = await parseBody(req);
      const { challengeId, challengeeScore, challengeeTimeMs } = body as {
        challengeId: string;
        challengeeScore: number;
        challengeeTimeMs?: number;
      };

      if (!challengeId || challengeeScore === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return true;
      }

      const challenge = completeChallenge(challengeId, challengeeScore, challengeeTimeMs);

      if (!challenge) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Challenge not found or not accepted' }));
        return true;
      }

      // Record challenge results for both users
      recordChallengeResult(
        challenge.challengerId,
        challenge.winnerId === challenge.challengerId
      );
      recordChallengeResult(
        challenge.challengeeId,
        challenge.winnerId === challenge.challengeeId
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ challenge }));
      return true;
    }

    // POST /api/social/challenges/decline
    if (pathname === '/api/social/challenges/decline' && method === 'POST') {
      const body = await parseBody(req);
      const { challengeId, challengeeId } = body as {
        challengeId: string;
        challengeeId: string;
      };

      const success = declineChallenge(challengeId, challengeeId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return true;
    }

    // GET /api/social/challenges/:id
    if (pathname.match(/^\/api\/social\/challenges\/[^/]+$/) && method === 'GET') {
      const idOrCode = pathname.split('/').pop() || '';

      // Try ID first, then share code
      let challenge = getChallenge(idOrCode);
      if (!challenge) {
        challenge = getChallengeByShareCode(idOrCode);
      }

      if (!challenge) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Challenge not found' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ challenge }));
      return true;
    }

    // GET /api/social/challenges/pending?userId=xxx
    if (pathname === '/api/social/challenges/pending' && method === 'GET') {
      const userId = searchParams.get('userId');

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId' }));
        return true;
      }

      const challenges = getPendingChallenges(userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ challenges }));
      return true;
    }

    // GET /api/social/challenges/history?userId=xxx
    if (pathname === '/api/social/challenges/history' && method === 'GET') {
      const userId = searchParams.get('userId');
      const limit = parseInt(searchParams.get('limit') || '20');

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId' }));
        return true;
      }

      const challenges = getChallengeHistory(userId, limit);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ challenges }));
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

      if (!hostUserId || !hostDisplayName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return true;
      }

      const session = createTasteMatchSession(hostUserId, hostDisplayName, rounds);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session }));
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

      if (!sessionId || !userId || !displayName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return true;
      }

      const session = joinTasteMatchSession(sessionId, userId, displayName);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found or full' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session }));
      return true;
    }

    // POST /api/social/tastematch/ready
    if (pathname === '/api/social/tastematch/ready' && method === 'POST') {
      const body = await parseBody(req);
      const { sessionId, userId } = body as {
        sessionId: string;
        userId: string;
      };

      const session = setParticipantReady(sessionId, userId);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session }));
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

      const session = submitTasteMatchAnswer(sessionId, userId, answer, timeMs);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found or not in progress' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session }));
      return true;
    }

    // GET /api/social/tastematch/:sessionId
    if (pathname.match(/^\/api\/social\/tastematch\/[^/]+$/) && method === 'GET') {
      const sessionId = pathname.split('/').pop() || '';
      const session = getTasteMatchSession(sessionId);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return true;
      }

      const currentQuestion = getCurrentQuestion(sessionId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session, currentQuestion }));
      return true;
    }

    // ========================================
    // LEADERBOARD ROUTES
    // ========================================

    // GET /api/social/leaderboard?period=weekly&gameType=overall&scope=global
    if (pathname === '/api/social/leaderboard' && method === 'GET') {
      const period = (searchParams.get('period') as LeaderboardPeriod) || 'weekly';
      const gameType = searchParams.get('gameType') || 'overall';
      const scope = (searchParams.get('scope') as LeaderboardScope) || 'global';
      const userId = searchParams.get('userId') | undefined;

      const leaderboard = getLeaderboard(period, gameType, scope, userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ leaderboard }));
      return true;
    }

    // GET /api/social/leaderboard/around?userId=xxx
    if (pathname === '/api/social/leaderboard/around' && method === 'GET') {
      const userId = searchParams.get('userId');
      const period = (searchParams.get('period') as LeaderboardPeriod) || 'weekly';
      const gameType = searchParams.get('gameType') || 'overall';

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId' }));
        return true;
      }

      const entries = getLeaderboardAroundUser(userId, period, gameType);
      const rank = getUserRank(userId, period, gameType);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ entries, rank }));
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
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId' }));
        return true;
      }

      const stats = getUserStats(userId, displayName);
      const weeklyRank = getUserRank(userId, 'weekly', 'overall');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stats, weeklyRank }));
      return true;
    }

    // POST /api/social/stats/update
    if (pathname === '/api/social/stats/update' && method === 'POST') {
      const body = await parseBody(req);
      const { userId, gameType, result } = body as {
        userId: string;
        gameType: string;
        result: {
          score: number;
          correctAnswers: number;
          totalQuestions: number;
          timeMs: number;
          usedHints: boolean;
        };
      };

      if (!userId || !gameType || !result) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return true;
      }

      const stats = updateUserStats(userId, gameType, result);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stats }));
      return true;
    }

    // POST /api/social/seed (development only)
    if (pathname === '/api/social/seed' && method === 'POST') {
      seedLeaderboardData();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Leaderboard seeded' }));
      return true;
    }

    // Route not found
    return false;
  } catch (error) {
    log.error({ error, pathname }, '🎮 Social route error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return true;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

