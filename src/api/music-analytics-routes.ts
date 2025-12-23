/**
 * Music Analytics Admin Routes
 *
 * Admin endpoints for viewing music transition analytics:
 * - GET /api/admin/music-analytics - Dashboard data
 * - GET /api/admin/music-analytics/user/:userId - User-specific stats
 * - GET /api/admin/music-analytics/ab-test - A/B test results
 * - GET /api/admin/music-analytics/persistence - Persistence stats
 *
 * These endpoints require admin authentication.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';

// Import analytics functions
import { getTransitionAnalyticsDashboard } from '../audio/intelligent-music-transitions.js';
import { getTransitionAnalytics } from '../audio/music-transition-analytics.js';

import { getUserLearningStats } from '../audio/music-user-learning.js';
import { getUserMusicMemoryStats } from '../audio/music-memory-integration.js';
import { getMusicLearningStats } from '../audio/music-learning-persistence.js';

const log = createLogger({ module: 'MusicAnalyticsRoutes' });

// ============================================================================
// AUTH
// ============================================================================

const ADMIN_KEY = process.env.ADMIN_API_KEY || process.env.INTERNAL_API_KEY;

/**
 * Verify admin request with proper security.
 *
 * SECURITY: This function properly validates admin access:
 * - In production: REQUIRES valid ADMIN_KEY header
 * - In development: Allows 'dev-mode' key OR no key for easier testing
 *
 * The 'dev-mode' bypass ONLY works when NODE_ENV === 'development'.
 */
function verifyAdmin(req: IncomingMessage): boolean {
  const adminKey = req.headers['x-admin-key'] as string | undefined;
  const isDev = process.env.NODE_ENV === 'development';

  // Primary check: valid ADMIN_KEY from environment
  if (ADMIN_KEY && adminKey === ADMIN_KEY) {
    return true;
  }

  // Dev mode bypass - ONLY works when NODE_ENV is explicitly 'development'
  // SECURITY: Never accept 'dev-mode' string in production
  if (isDev && adminKey === 'dev-mode') {
    return true;
  }

  // In development only, allow without key for easier local testing
  if (isDev && !adminKey) {
    log.debug('Admin endpoint accessed without key in dev mode');
    return true;
  }

  return false;
}

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function sendError(res: ServerResponse, message: string, status = 500): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/admin/music-analytics
 *
 * Returns comprehensive dashboard data:
 * - Global transition stats by type
 * - Recent decisions
 * - A/B test results
 * - Persistence stats
 */
async function handleDashboard(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const dashboard = getTransitionAnalyticsDashboard();
    const persistenceStats = getMusicLearningStats();

    sendJson(res, {
      timestamp: new Date().toISOString(),
      dashboard,
      persistence: persistenceStats,
      meta: {
        description: 'Music transition analytics dashboard',
        refreshRate: 'Real-time (in-memory) + 10-15s sync to Firestore',
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get music analytics dashboard');
    sendError(res, 'Failed to get analytics dashboard');
  }
}

/**
 * GET /api/admin/music-analytics/user/:userId
 *
 * Returns user-specific learning stats
 */
async function handleUserStats(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const learningStats = getUserLearningStats(userId);
    const memoryStats = getUserMusicMemoryStats(userId);

    sendJson(res, {
      userId,
      timestamp: new Date().toISOString(),
      learning: {
        totalTransitions: learningStats.totalTransitions,
        topTransitionTypes: learningStats.topTransitionTypes,
        hasContextPreferences: learningStats.hasContextPreferences,
        description: 'Thompson Sampling arms - shows which transitions work for this user',
      },
      memory: {
        totalMemories: memoryStats.totalMemories,
        oldestMemory: memoryStats.oldestMemory
          ? new Date(memoryStats.oldestMemory).toISOString()
          : null,
        mostCommonEmotionalState: memoryStats.mostCommonEmotionalState,
        preferredMood: memoryStats.preferredMood,
        hasStrongPreferences: memoryStats.hasStrongPreferences,
        description: 'Music memories - what music helped in what situations',
      },
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get user music stats');
    sendError(res, 'Failed to get user stats');
  }
}

/**
 * GET /api/admin/music-analytics/ab-test
 *
 * Returns A/B test results
 */
async function handleABTestResults(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const analytics = getTransitionAnalytics();
    const results = analytics.getTestResults('intelligent_transitions_v1');

    sendJson(res, {
      timestamp: new Date().toISOString(),
      testName: 'intelligent_transitions_v1',
      description: 'Compares control (static phrases) vs intelligent (context-aware) transitions',
      variants: {
        control: {
          description: '20% of users - Uses old static phrases',
          weight: 0.2,
        },
        intelligent: {
          description: '80% of users - Uses intelligent transition system',
          weight: 0.8,
        },
      },
      results: results || { note: 'Not enough data yet' },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get A/B test results');
    sendError(res, 'Failed to get A/B test results');
  }
}

/**
 * GET /api/admin/music-analytics/persistence
 *
 * Returns persistence layer stats
 */
async function handlePersistenceStats(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const stats = getMusicLearningStats();

    sendJson(res, {
      timestamp: new Date().toISOString(),
      persistence: {
        profiles: {
          cached: stats.profiles.cached,
          pendingWrites: stats.profiles.dirty,
          description: 'User transition profiles (Thompson Sampling)',
        },
        memories: {
          cached: stats.memories.cached,
          pendingWrites: stats.memories.dirty,
          description: 'Music memories (what helped when)',
        },
        loadedUsers: {
          profiles: stats.loadedUsers.profiles,
          memories: stats.loadedUsers.memories,
          description: 'Users with data loaded from Firestore',
        },
      },
      firestoreLocation: 'bogle_users/{userId}/music_learning/',
    });
  } catch (error) {
    log.error({ error }, 'Failed to get persistence stats');
    sendError(res, 'Failed to get persistence stats');
  }
}

/**
 * GET /api/admin/music-analytics/recent
 *
 * Returns recent transition events
 */
async function handleRecentEvents(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  try {
    const count = parseInt(parsedUrl.searchParams.get('count') || '50', 10);
    const analytics = getTransitionAnalytics();
    const events = analytics.getRecentEvents(Math.min(count, 200));

    sendJson(res, {
      timestamp: new Date().toISOString(),
      count: events.length,
      events: events.map((e) => ({
        eventId: e.eventId,
        sessionId: `${e.sessionId.slice(0, 12)}...`, // Truncate for privacy
        personaId: e.personaId,
        transitionType: e.transitionType,
        didSpeak: e.didSpeak,
        confidence: e.confidence,
        startReason: e.startReason,
        context: e.context,
        experimentVariant: e.experimentVariant,
        timestamp: new Date(e.timestamp).toISOString(),
      })),
    });
  } catch (error) {
    log.error({ error }, 'Failed to get recent events');
    sendError(res, 'Failed to get recent events');
  }
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

/**
 * Handle music analytics admin routes
 */
export async function handleMusicAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl?: URL
): Promise<boolean> {
  // Only handle /api/admin/music-analytics routes
  if (!pathname.startsWith('/api/admin/music-analytics')) {
    return false;
  }

  // Verify admin auth (admin key or dev mode)
  if (!verifyAdmin(req)) {
    sendError(res, 'Unauthorized - admin access required', 401);
    return true;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    sendError(res, 'Method not allowed', 405);
    return true;
  }

  // Route to specific handlers
  const subPath = pathname.replace('/api/admin/music-analytics', '');

  if (subPath === '' || subPath === '/') {
    await handleDashboard(req, res);
    return true;
  }

  if (subPath === '/ab-test') {
    await handleABTestResults(req, res);
    return true;
  }

  if (subPath === '/persistence') {
    await handlePersistenceStats(req, res);
    return true;
  }

  if (subPath === '/recent') {
    const url = parsedUrl || new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    await handleRecentEvents(req, res, url);
    return true;
  }

  // User-specific stats: /user/:userId
  const userMatch = subPath.match(/^\/user\/([^/]+)$/);
  if (userMatch) {
    const userId = decodeURIComponent(userMatch[1]);
    await handleUserStats(req, res, userId);
    return true;
  }

  // Unknown sub-path
  sendError(res, 'Not found', 404);
  return true;
}

export default handleMusicAnalyticsRoutes;
