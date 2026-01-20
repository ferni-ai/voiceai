/**
 * Cache Manager - Three-Tier Caching for Builder Effectiveness
 *
 * Manages caching of builder effectiveness data with different TTLs:
 * - L1 Session: In-memory, session lifetime
 * - L2 User: 5 minute TTL
 * - L3 Global: 1 minute TTL
 *
 * Performance target: <50ms for cache lookups.
 *
 * @module context-routing/cache-manager
 */

import type {
  BuilderEffectiveness,
  UserBuilderPreferences,
  PredictiveScore,
  CachedUserScores,
  GlobalEffectivenessCache,
  CacheTier,
} from './types.js';
import { CACHE_TTL } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CacheManager' });

// ============================================================================
// CACHE STORES
// ============================================================================

/**
 * L1 Session cache - per-session scores.
 * Key: sessionId
 */
const sessionCache = new Map<string, CachedUserScores>();

/**
 * L2 User cache - per-user preferences and scores.
 * Key: userId
 */
const userCache = new Map<
  string,
  {
    scores: CachedUserScores;
    preferences: UserBuilderPreferences | null;
    cachedAt: Date;
  }
>();

/**
 * L3 Global cache - aggregated builder effectiveness.
 */
let globalCache: GlobalEffectivenessCache | null = null;

// ============================================================================
// CACHE MANAGER CLASS
// ============================================================================

export class CacheManager {
  private readonly sessionId: string;
  private readonly userId: string;

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId;
    this.userId = userId;
  }

  // --------------------------------------------------------------------------
  // L1 SESSION CACHE
  // --------------------------------------------------------------------------

  /**
   * Get scores from session cache.
   */
  getSessionScore(builderId: string): PredictiveScore | undefined {
    const cached = sessionCache.get(this.sessionId);
    if (!cached) return undefined;
    return cached.scores.get(builderId);
  }

  /**
   * Set a score in session cache.
   */
  setSessionScore(builderId: string, score: PredictiveScore): void {
    let cached = sessionCache.get(this.sessionId);
    if (!cached) {
      cached = {
        userId: this.userId,
        scores: new Map(),
        cachedAt: new Date(),
        tier: 'session',
      };
      sessionCache.set(this.sessionId, cached);
    }
    cached.scores.set(builderId, score);
  }

  /**
   * Get all session scores.
   */
  getAllSessionScores(): Map<string, PredictiveScore> {
    const cached = sessionCache.get(this.sessionId);
    return cached?.scores ?? new Map();
  }

  /**
   * Clear session cache (call on session end).
   */
  clearSession(): void {
    sessionCache.delete(this.sessionId);
    log.debug({ sessionId: this.sessionId }, 'Cleared session cache');
  }

  // --------------------------------------------------------------------------
  // L2 USER CACHE
  // --------------------------------------------------------------------------

  /**
   * Check if user cache is valid (within TTL).
   */
  isUserCacheValid(): boolean {
    const cached = userCache.get(this.userId);
    if (!cached) return false;

    const age = Date.now() - cached.cachedAt.getTime();
    return age < CACHE_TTL.user;
  }

  /**
   * Get scores from user cache.
   */
  getUserScore(builderId: string): PredictiveScore | undefined {
    if (!this.isUserCacheValid()) return undefined;

    const cached = userCache.get(this.userId);
    return cached?.scores.scores.get(builderId);
  }

  /**
   * Get user preferences from cache.
   */
  getUserPreferences(): UserBuilderPreferences | null {
    if (!this.isUserCacheValid()) return null;

    const cached = userCache.get(this.userId);
    return cached?.preferences ?? null;
  }

  /**
   * Set user cache data.
   */
  setUserCache(
    scores: Map<string, PredictiveScore>,
    preferences: UserBuilderPreferences | null
  ): void {
    userCache.set(this.userId, {
      scores: {
        userId: this.userId,
        scores,
        cachedAt: new Date(),
        tier: 'user',
      },
      preferences,
      cachedAt: new Date(),
    });
    log.debug({ userId: this.userId, scoreCount: scores.size }, 'Updated user cache');
  }

  /**
   * Invalidate user cache.
   */
  invalidateUserCache(): void {
    userCache.delete(this.userId);
    log.debug({ userId: this.userId }, 'Invalidated user cache');
  }

  // --------------------------------------------------------------------------
  // L3 GLOBAL CACHE
  // --------------------------------------------------------------------------

  /**
   * Check if global cache is valid (within TTL).
   */
  static isGlobalCacheValid(): boolean {
    if (!globalCache) return false;

    const age = Date.now() - globalCache.refreshedAt.getTime();
    return age < CACHE_TTL.global;
  }

  /**
   * Get builder effectiveness from global cache.
   */
  static getGlobalEffectiveness(builderId: string): BuilderEffectiveness | undefined {
    if (!CacheManager.isGlobalCacheValid()) return undefined;
    return globalCache?.effectiveness.get(builderId);
  }

  /**
   * Get all global effectiveness data.
   */
  static getAllGlobalEffectiveness(): Map<string, BuilderEffectiveness> {
    if (!CacheManager.isGlobalCacheValid()) return new Map();
    return globalCache?.effectiveness ?? new Map();
  }

  /**
   * Set global cache data.
   */
  static setGlobalCache(effectiveness: Map<string, BuilderEffectiveness>): void {
    globalCache = {
      effectiveness,
      refreshedAt: new Date(),
    };
    log.debug({ builderCount: effectiveness.size }, 'Updated global cache');
  }

  /**
   * Invalidate global cache.
   */
  static invalidateGlobalCache(): void {
    globalCache = null;
    log.debug('Invalidated global cache');
  }

  // --------------------------------------------------------------------------
  // MULTI-TIER LOOKUP
  // --------------------------------------------------------------------------

  /**
   * Get score using tiered lookup (L1 → L2 → L3).
   * Returns the score and which tier it came from.
   */
  getScore(builderId: string): { score: PredictiveScore | undefined; tier: CacheTier | null } {
    // L1: Session cache (fastest)
    const sessionScore = this.getSessionScore(builderId);
    if (sessionScore) {
      return { score: sessionScore, tier: 'session' };
    }

    // L2: User cache
    const userScore = this.getUserScore(builderId);
    if (userScore) {
      // Promote to session cache for faster subsequent lookups
      this.setSessionScore(builderId, userScore);
      return { score: userScore, tier: 'user' };
    }

    // L3: Global cache (convert effectiveness to score)
    const effectiveness = CacheManager.getGlobalEffectiveness(builderId);
    if (effectiveness) {
      const score = this.effectivenessToScore(builderId, effectiveness);
      // Promote to session cache
      this.setSessionScore(builderId, score);
      return { score, tier: 'global' };
    }

    return { score: undefined, tier: null };
  }

  /**
   * Convert BuilderEffectiveness to PredictiveScore.
   */
  private effectivenessToScore(
    builderId: string,
    effectiveness: BuilderEffectiveness
  ): PredictiveScore {
    // Use ROI score as the base
    const roiScore = effectiveness.roiScore;

    // Default mode relevance (will be overridden by scorer)
    const modeRelevance = 50;

    // Recency boost based on sample count
    const recencyBoost = Math.min(effectiveness.sampleCount / 100, 1) * 100;

    // No user affinity from global data
    const userAffinity = 50;

    // Compute composite score
    const score =
      roiScore * 0.4 + modeRelevance * 0.3 + recencyBoost * 0.15 + userAffinity * 0.15;

    return {
      builderId,
      score,
      confidence: Math.min(effectiveness.sampleCount / 100, 1),
      factors: {
        roiScore,
        modeRelevance,
        recencyBoost,
        userAffinity,
      },
      source: effectiveness.sampleCount >= 100 ? 'ml' : 'heuristic',
    };
  }

  // --------------------------------------------------------------------------
  // CACHE WARMING
  // --------------------------------------------------------------------------

  /**
   * Warm all cache tiers for this user/session.
   * Should be called at session start.
   *
   * @param loadUserData - Function to load user data from Firestore
   * @param loadGlobalData - Function to load global data from Firestore
   */
  async warmCache(
    loadUserData?: () => Promise<{
      scores: Map<string, PredictiveScore>;
      preferences: UserBuilderPreferences | null;
    }>,
    loadGlobalData?: () => Promise<Map<string, BuilderEffectiveness>>
  ): Promise<void> {
    const startTime = Date.now();

    const promises: Promise<void>[] = [];

    // Warm user cache if not valid and loader provided
    if (!this.isUserCacheValid() && loadUserData) {
      promises.push(
        loadUserData().then(({ scores, preferences }) => {
          this.setUserCache(scores, preferences);
        })
      );
    }

    // Warm global cache if not valid and loader provided
    if (!CacheManager.isGlobalCacheValid() && loadGlobalData) {
      promises.push(
        loadGlobalData().then((effectiveness) => {
          CacheManager.setGlobalCache(effectiveness);
        })
      );
    }

    await Promise.all(promises);

    const duration = Date.now() - startTime;
    log.info(
      {
        sessionId: this.sessionId,
        userId: this.userId,
        durationMs: duration,
      },
      'Warmed cache'
    );
  }

  // --------------------------------------------------------------------------
  // CACHE STATS
  // --------------------------------------------------------------------------

  /**
   * Get cache statistics.
   */
  getStats(): {
    session: { size: number; age: number | null };
    user: { size: number; age: number | null; valid: boolean };
    global: { size: number; age: number | null; valid: boolean };
  } {
    const sessionCached = sessionCache.get(this.sessionId);
    const userCached = userCache.get(this.userId);

    return {
      session: {
        size: sessionCached?.scores.size ?? 0,
        age: sessionCached ? Date.now() - sessionCached.cachedAt.getTime() : null,
      },
      user: {
        size: userCached?.scores.scores.size ?? 0,
        age: userCached ? Date.now() - userCached.cachedAt.getTime() : null,
        valid: this.isUserCacheValid(),
      },
      global: {
        size: globalCache?.effectiveness.size ?? 0,
        age: globalCache ? Date.now() - globalCache.refreshedAt.getTime() : null,
        valid: CacheManager.isGlobalCacheValid(),
      },
    };
  }
}

// ============================================================================
// FACTORY & UTILITIES
// ============================================================================

/**
 * Create a cache manager for a session.
 */
export function createCacheManager(sessionId: string, userId: string): CacheManager {
  return new CacheManager(sessionId, userId);
}

/**
 * Clear all caches (for testing or emergency reset).
 */
export function clearAllCaches(): void {
  sessionCache.clear();
  userCache.clear();
  globalCache = null;
  log.warn('Cleared all caches');
}

/**
 * Get overall cache statistics.
 */
export function getGlobalCacheStats(): {
  sessionCacheSize: number;
  userCacheSize: number;
  globalCacheValid: boolean;
  globalCacheSize: number;
} {
  return {
    sessionCacheSize: sessionCache.size,
    userCacheSize: userCache.size,
    globalCacheValid: CacheManager.isGlobalCacheValid(),
    globalCacheSize: globalCache?.effectiveness.size ?? 0,
  };
}
