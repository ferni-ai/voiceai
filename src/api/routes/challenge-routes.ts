/**
 * 🎯 Daily Challenge API Routes
 *
 * Endpoints for the Daily Challenge system.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import {
  getTodaysChallenge,
  getUpcomingChallenges,
  startChallenge,
  completeChallenge,
  getChallengeStats,
  hasCompletedTodaysChallenge,
  getChallengeHistory,
  isStreakAtRisk,
  useStreakFreeze,
  getChallengeNotificationContent,
} from '../../services/engagement/daily-challenges.js';

const log = getLogger();

/**
 * Handle challenge-related API routes
 */
export async function handleChallengeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  searchParams: URLSearchParams
): Promise<boolean> {
  // Only handle /api/challenges/* routes
  if (!pathname.startsWith('/api/challenges')) {
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
    // GET /api/challenges/today?userId=xxx
    if (pathname === '/api/challenges/today' && method === 'GET') {
      const userId = searchParams.get('userId') || '';
      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const stats = getChallengeStats(userId);
      const challenge = getTodaysChallenge(userId, stats);
      const completed = hasCompletedTodaysChallenge(userId);
      const streakStatus = isStreakAtRisk(userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          challenge,
          completed,
          stats: {
            currentStreak: stats.currentStreak,
            longestStreak: stats.longestStreak,
            totalXp: stats.totalXpEarned,
          },
          streakAtRisk: streakStatus.atRisk,
          hoursRemaining: streakStatus.hoursRemaining,
        })
      );
      return true;
    }

    // GET /api/challenges/upcoming?userId=xxx&days=7
    if (pathname === '/api/challenges/upcoming' && method === 'GET') {
      const userId = searchParams.get('userId') || '';
      const days = parseInt(searchParams.get('days') || '7');

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const challenges = getUpcomingChallenges(userId, days);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ challenges }));
      return true;
    }

    // GET /api/challenges/stats?userId=xxx
    if (pathname === '/api/challenges/stats' && method === 'GET') {
      const userId = searchParams.get('userId') || '';

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const stats = getChallengeStats(userId);
      const history = getChallengeHistory(userId, 10);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stats, recentHistory: history }));
      return true;
    }

    // POST /api/challenges/start
    if (pathname === '/api/challenges/start' && method === 'POST') {
      const body = await parseBody(req);
      const userId = body.userId as string | undefined;
      const challengeId = body.challengeId as string | undefined;

      if (!userId || !challengeId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId or challengeId' }));
        return true;
      }

      const progress = startChallenge(userId, challengeId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, progress }));
      return true;
    }

    // POST /api/challenges/complete
    if (pathname === '/api/challenges/complete' && method === 'POST') {
      const body = await parseBody(req);
      const userId = body.userId as string | undefined;
      const challengeId = body.challengeId as string | undefined;
      const score = (body.score as number) || 0;

      if (!userId || !challengeId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId or challengeId' }));
        return true;
      }

      const stats = getChallengeStats(userId);
      const challenge = getTodaysChallenge(userId, stats);
      const progress = completeChallenge(userId, challengeId, score, challenge);
      const updatedStats = getChallengeStats(userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          progress,
          stats: {
            currentStreak: updatedStats.currentStreak,
            longestStreak: updatedStats.longestStreak,
            totalXp: updatedStats.totalXpEarned,
            xpEarned: progress.xpEarned,
          },
          milestones: checkMilestones(updatedStats),
        })
      );
      return true;
    }

    // POST /api/challenges/streak-freeze
    if (pathname === '/api/challenges/streak-freeze' && method === 'POST') {
      const body = await parseBody(req);
      const userId = body.userId as string | undefined;

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId' }));
        return true;
      }

      const success = useStreakFreeze(userId);
      const stats = getChallengeStats(userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success,
          currentStreak: stats.currentStreak,
          message: success ? 'Streak protected for today!' : 'No streak to protect',
        })
      );
      return true;
    }

    // GET /api/challenges/notification-content?userId=xxx
    if (pathname === '/api/challenges/notification-content' && method === 'GET') {
      const userId = searchParams.get('userId') || '';

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const stats = getChallengeStats(userId);
      const challenge = getTodaysChallenge(userId, stats);
      const notification = getChallengeNotificationContent(challenge, stats);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ notification }));
      return true;
    }

    // Route not found
    return false;
  } catch (error) {
    log.error({ error, pathname }, '🎯 Challenge route error');
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

/**
 * Check for milestone achievements
 */
function checkMilestones(stats: {
  currentStreak: number;
  totalChallengesCompleted: number;
}): string[] {
  const milestones: string[] = [];

  // Streak milestones
  if (stats.currentStreak === 3) milestones.push('🔥 3 Day Streak!');
  if (stats.currentStreak === 7) milestones.push('🔥 Week Streak!');
  if (stats.currentStreak === 14) milestones.push('🔥 Two Week Streak!');
  if (stats.currentStreak === 30) milestones.push('🏆 Month Streak!');
  if (stats.currentStreak === 100) milestones.push('💎 100 Day Legend!');

  // Total challenges milestones
  if (stats.totalChallengesCompleted === 10) milestones.push('⭐ 10 Challenges Complete!');
  if (stats.totalChallengesCompleted === 50) milestones.push('⭐ 50 Challenges Complete!');
  if (stats.totalChallengesCompleted === 100) milestones.push('🏆 100 Challenges Complete!');

  return milestones;
}
