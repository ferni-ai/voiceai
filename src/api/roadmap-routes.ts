/**
 * Roadmap API Routes (Seed Economy)
 *
 * Handles the "What's Growing" feature voting and suggestion system.
 * Users earn and spend "seeds" to vote on features and submit suggestions.
 *
 * Routes:
 * - GET /api/roadmap/stats - Get feature vote counts (public)
 * - GET /api/roadmap/seeds - Get user's seed balance
 * - POST /api/roadmap/vote - Plant seeds on a feature
 * - DELETE /api/roadmap/vote/:featureId - Unvote (50% seed refund)
 * - GET /api/roadmap/votes - Get user's votes
 * - POST /api/roadmap/suggest - Submit a new feature suggestion
 * - GET /api/roadmap/suggestions - Browse community suggestions
 *
 * @see apps/BETTER-THAN-HUMAN-PLAN.md for full architecture
 */

import admin from 'firebase-admin';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { optionalAuthAsync, rateLimit } from './auth-middleware.js';
import {
  claimRitualStreakRewards,
  readSeedSummary,
  RITUAL_STREAK_REWARDS,
  suggestWithSeeds,
  unvoteWithRefund,
  voteWithSeeds,
} from './roadmap-seeds.js';
import { API_ERRORS } from './error-messages.js';
import {
  getUserId,
  handleCorsPreflightIfNeeded,
  parseBody,
  sendError,
  sendJSON,
} from './helpers.js';

const log = createLogger({ module: 'RoadmapAPI' });

// =============================================================================
// TYPES
// =============================================================================

export interface RoadmapVote {
  id: string;
  userId: string;
  featureId: string;
  seedsPlanted: number;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapSuggestion {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: 'connect' | 'personalize' | 'platform';
  seedsPlanted: number;
  communitySeeds: number;
  status: 'submitted' | 'under_review' | 'accepted' | 'declined' | 'merged';
  mergedIntoFeatureId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Import UserSeeds from service layer (clean architecture)
// Re-export for backward compatibility
import { type UserSeeds } from '../services/seed-economy.js';
export type { UserSeeds };

export interface FeatureStats {
  featureId: string;
  totalSeeds: number;
  uniqueVoters: number;
  topReasons: string[];
}

// Request/Response types
interface VoteRequest {
  featureId: string;
  seeds: number;
  reason?: string;
}

interface SuggestionRequest {
  title: string;
  description: string;
  category: 'connect' | 'personalize' | 'platform';
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Max seeds per vote */
const MAX_SEEDS_PER_VOTE = 10;

/** Min seeds per vote */
const MIN_SEEDS_PER_VOTE = 1;

// =============================================================================
// FIRESTORE
// =============================================================================

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  try {
    // Check if admin.apps exists and has length (handles undefined case)
    const { apps } = admin;
    if (!apps || apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for roadmap routes');
      } else {
        admin.initializeApp();
        log.info('Firebase initialized with default credentials');
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for roadmap routes');
    return null;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/** Ritual streak milestones and their seeds. */
export function getAvailableStreakRewards(): Array<{ milestone: number; seeds: number }> {
  return Object.entries(RITUAL_STREAK_REWARDS).map(([milestone, seeds]) => ({
    milestone: Number(milestone),
    seeds,
  }));
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * GET /api/roadmap/stats
 * Get aggregated vote counts per feature (public)
 */
async function handleGetStats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const db = getFirestore();

    // Fallback when database unavailable
    if (!db) {
      log.warn('Firestore unavailable - returning roadmap fallback');
      sendJSON(res, { features: [], lastUpdated: new Date().toISOString() });
      return;
    }

    // Get all feature stats
    const statsSnapshot = await db.collection('roadmap_feature_stats').get();

    const features: FeatureStats[] = [];
    statsSnapshot.forEach((doc) => {
      const data = doc.data();
      features.push({
        featureId: doc.id,
        totalSeeds: data.totalSeeds || 0,
        uniqueVoters: data.uniqueVoters || 0,
        topReasons: data.topReasons || [],
      });
    });

    sendJSON(res, {
      features,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get roadmap stats');
    sendJSON(res, { features: [], lastUpdated: new Date().toISOString() });
  }
}

/**
 * GET /api/roadmap/seeds
 * Get user's seed balance
 */
async function handleGetSeeds(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    sendJSON(res, await readSeedSummary(db, userId));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user seeds');
    sendError(res, 'Failed to get seed balance');
  }
}

/**
 * POST /api/roadmap/vote
 * Plant seeds on a feature
 */
async function handleVote(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<VoteRequest>(req);
    const { featureId, seeds, reason } = body;

    if (!featureId) {
      sendError(res, 'Feature ID required', 400);
      return;
    }

    if (!seeds || seeds < MIN_SEEDS_PER_VOTE || seeds > MAX_SEEDS_PER_VOTE) {
      sendError(res, `Seeds must be between ${MIN_SEEDS_PER_VOTE} and ${MAX_SEEDS_PER_VOTE}`, 400);
      return;
    }

    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    const result = await voteWithSeeds(db, userId, {
      featureId,
      seeds,
      reason,
      requestId: (body as { requestId?: unknown }).requestId,
    });

    if (!result.success) {
      sendError(res, result.error || 'Vote failed', 400);
      return;
    }

    log.info({ userId, featureId, seeds }, 'Vote recorded');
    sendJSON(res, result);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record vote');
    sendError(res, 'Failed to record vote');
  }
}

/**
 * DELETE /api/roadmap/vote/:featureId
 * Remove vote and get 50% seeds back
 */
async function handleUnvote(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  featureId: string
): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    const result = await unvoteWithRefund(db, userId, featureId);

    if (!result.success) {
      sendError(res, result.error || 'Unvote failed', 400);
      return;
    }

    log.info({ userId, featureId, refund: result.seedsRefunded }, 'Vote removed');
    sendJSON(res, result);
  } catch (error) {
    log.error({ error: String(error), userId, featureId }, 'Failed to remove vote');
    sendError(res, 'Failed to remove vote');
  }
}

/**
 * GET /api/roadmap/votes
 * Get user's votes
 */
async function handleGetUserVotes(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    // Query feature_votes using a prefix scan on the deterministic ID pattern
    // IDs are formatted as `${userId}_${featureId}`, so we can filter by prefix
    const votesSnapshot = await db
      .collection('feature_votes')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const votes: Array<{
      featureId: string;
      seedsPlanted: number;
      reason?: string;
      createdAt: string;
    }> = [];

    votesSnapshot.forEach((doc) => {
      const data = doc.data();
      votes.push({
        featureId: data.featureId,
        seedsPlanted: data.seedsPlanted,
        reason: data.reason,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      });
    });

    sendJSON(res, { votes });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user votes');
    sendError(res, 'Failed to get votes');
  }
}

/**
 * POST /api/roadmap/suggest
 * Submit a new feature suggestion (costs seeds)
 */
async function handleSuggest(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<SuggestionRequest>(req);
    const { title, description, category } = body;

    if (!title || title.length < 5) {
      sendError(res, 'Title must be at least 5 characters', 400);
      return;
    }

    if (!description || description.length < 20) {
      sendError(res, 'Description must be at least 20 characters', 400);
      return;
    }

    if (!['connect', 'personalize', 'platform'].includes(category)) {
      sendError(res, 'Invalid category', 400);
      return;
    }

    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    const result = await suggestWithSeeds(db, userId, { title, description, category });

    if (!result.success) {
      sendError(res, result.error || 'Suggestion failed', 400);
      return;
    }

    log.info({ userId, title, category }, 'Suggestion submitted');
    sendJSON(res, result);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to submit suggestion');
    sendError(res, 'Failed to submit suggestion');
  }
}

/**
 * GET /api/roadmap/suggestions
 * Browse community suggestions
 */
async function handleGetSuggestions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendJSON(res, { suggestions: [] });
      return;
    }

    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const status = url.searchParams.get('status') || 'submitted';
    const category = url.searchParams.get('category');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    let query: admin.firestore.Query = db.collection('roadmap_suggestions');

    if (status !== 'all') {
      query = query.where('status', '==', status);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    query = query.orderBy('communitySeeds', 'desc').limit(limit);

    const snapshot = await query.get();

    const suggestions: Array<{
      id: string;
      title: string;
      description: string;
      category: string;
      seedsPlanted: number;
      communitySeeds: number;
      status: string;
      createdAt: string;
    }> = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      suggestions.push({
        id: doc.id,
        title: data.title,
        description: data.description,
        category: data.category,
        seedsPlanted: data.seedsPlanted,
        communitySeeds: data.communitySeeds,
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      });
    });

    sendJSON(res, { suggestions });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get suggestions');
    sendJSON(res, { suggestions: [] });
  }
}

/**
 * POST /api/roadmap/streak-reward
 * Check and claim streak reward based on current streak
 */
async function handleStreakReward(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }
    // The server's own ritual streaks decide; a posted count is ignored (it was forgeable)
    const { getEngagementStore } = await import('../services/engagement/engagement-store.js');
    const streaks = await (await getEngagementStore()).getAllStreaks(userId);
    const longest = Math.max(0, ...streaks.map((s) => s.currentStreak ?? 0));
    const result = await claimRitualStreakRewards(db, userId, longest);

    sendJSON(
      res,
      result.awarded
        ? {
            success: true,
            awarded: true,
            milestone: result.milestone,
            seedsAwarded: result.seeds,
            newBalance: result.newBalance,
            message: `🎉 Congratulations! ${result.milestone}-day streak earned you ${result.seeds} seeds!`,
          }
        : { success: true, awarded: false, message: 'No streak milestone reached' }
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check streak reward');
    sendError(res, 'Failed to check streak reward');
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Main route handler for roadmap routes
 */
export async function handleRoadmapRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/roadmap routes
  if (!pathname.startsWith('/api/roadmap')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  const method = req.method || 'GET';

  // GET /api/roadmap/stats - Public endpoint
  if (pathname === '/api/roadmap/stats' && method === 'GET') {
    await handleGetStats(req, res);
    return true;
  }

  // GET /api/roadmap/suggestions - Public endpoint
  if (pathname === '/api/roadmap/suggestions' && method === 'GET') {
    await handleGetSuggestions(req, res);
    return true;
  }

  // Auth required for remaining endpoints
  const auth = await optionalAuthAsync(req);
  const userId = auth?.userId || getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return true;
  }

  // GET /api/roadmap/seeds - Get user's seed balance
  if (pathname === '/api/roadmap/seeds' && method === 'GET') {
    await handleGetSeeds(req, res, userId);
    return true;
  }

  // POST /api/roadmap/vote - Plant seeds on a feature
  if (pathname === '/api/roadmap/vote' && method === 'POST') {
    await handleVote(req, res, userId);
    return true;
  }

  // DELETE /api/roadmap/vote/:featureId - Unvote
  if (pathname.startsWith('/api/roadmap/vote/') && method === 'DELETE') {
    const featureId = pathname.split('/').pop();
    if (!featureId) {
      sendError(res, 'Feature ID required', 400);
      return true;
    }
    await handleUnvote(req, res, userId, featureId);
    return true;
  }

  // GET /api/roadmap/votes - Get user's votes
  if (pathname === '/api/roadmap/votes' && method === 'GET') {
    await handleGetUserVotes(req, res, userId);
    return true;
  }

  // POST /api/roadmap/suggest - Submit a suggestion
  if (pathname === '/api/roadmap/suggest' && method === 'POST') {
    await handleSuggest(req, res, userId);
    return true;
  }

  // POST /api/roadmap/streak-reward - Check and claim streak reward
  if (pathname === '/api/roadmap/streak-reward' && method === 'POST') {
    await handleStreakReward(req, res, userId);
    return true;
  }

  // GET /api/roadmap/streak-rewards - Get available streak milestones
  if (pathname === '/api/roadmap/streak-rewards' && method === 'GET') {
    sendJSON(res, { rewards: getAvailableStreakRewards() });
    return true;
  }

  // No matching route
  return false;
}

// =============================================================================
// SEED EARNING - Re-exported from service layer (clean architecture)
// =============================================================================

// Re-export for backward compatibility - callers should import from services/seed-economy.js directly
export { awardSeedsForConversation } from '../services/seed-economy.js';

export default handleRoadmapRoutes;
