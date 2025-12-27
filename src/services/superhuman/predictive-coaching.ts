/**
 * Predictive Coaching Engine - Better Than Human Service
 *
 * What no human friend can do: See your struggle before you do.
 *
 * Analyzes patterns across conversations to anticipate user needs
 * and proactively offer support before they ask.
 *
 * SCALING:
 * - Redis caching for cross-instance pattern sharing
 * - In-memory cache with LRU eviction for high-frequency access
 * - Async event emission for background worker processing
 *
 * @module services/superhuman/predictive-coaching
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'predictive-coaching' });

// ============================================================================
// REDIS CACHE INTEGRATION
// ============================================================================

interface RedisCache {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, seconds: number, value: string) => Promise<string>;
  del: (key: string | string[]) => Promise<number>;
}

let redisCache: RedisCache | null = null;
let redisInitialized = false;

const REDIS_KEY_PREFIX = 'predictions:';
const REDIS_PATTERN_TTL = 60 * 15; // 15 minutes - patterns don't change fast
const REDIS_PREDICTIONS_TTL = 60 * 5; // 5 minutes - predictions update per session

/**
 * Initialize Redis caching for cross-instance pattern sharing.
 * Falls back to memory-only if Redis unavailable.
 */
export async function initializeRedisCache(): Promise<void> {
  if (redisInitialized) return;

  try {
    const { getRedisCache } = await import('../../memory/redis-cache.js');
    const cache = getRedisCache();
    await cache.initialize();

    // Verify it's working
    redisCache = cache as unknown as RedisCache;
    redisInitialized = true;

    log.info('🚀 Predictive coaching Redis cache initialized');
  } catch (error) {
    log.warn(
      { error: String(error) },
      'Redis unavailable for predictive coaching - using memory only'
    );
    redisInitialized = true; // Mark as initialized so we don't retry
  }
}

/**
 * Get patterns from Redis cache
 */
async function getFromRedis(key: string): Promise<PatternObservation[] | null> {
  if (!redisCache) return null;

  try {
    const data = await redisCache.get(`${REDIS_KEY_PREFIX}${key}`);
    if (data) {
      return JSON.parse(data) as PatternObservation[];
    }
  } catch (error) {
    log.debug({ error: String(error), key }, 'Redis get failed (non-fatal)');
  }
  return null;
}

/**
 * Save patterns to Redis cache
 */
async function saveToRedis(
  key: string,
  patterns: PatternObservation[],
  ttlSeconds: number = REDIS_PATTERN_TTL
): Promise<void> {
  if (!redisCache) return;

  try {
    await redisCache.setex(`${REDIS_KEY_PREFIX}${key}`, ttlSeconds, JSON.stringify(patterns));
  } catch (error) {
    log.debug({ error: String(error), key }, 'Redis set failed (non-fatal)');
  }
}

/**
 * Invalidate Redis cache for a user
 */
async function invalidateRedisCache(userId: string): Promise<void> {
  if (!redisCache) return;

  try {
    await redisCache.del([
      `${REDIS_KEY_PREFIX}patterns:${userId}`,
      `${REDIS_KEY_PREFIX}predictions:${userId}`,
      `${REDIS_KEY_PREFIX}context:${userId}`,
    ]);
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Redis invalidation failed (non-fatal)');
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type PatternType =
  | 'temporal' // Day/time patterns
  | 'emotional' // Emotional cycles
  | 'behavioral' // Action patterns
  | 'relational' // People-related patterns
  | 'cyclical'; // Recurring situations

export type PredictionConfidence = 'low' | 'medium' | 'high' | 'very_high';

export interface PatternObservation {
  id: string;
  userId: string;
  type: PatternType;

  // Pattern details
  trigger: string; // What triggers this pattern
  outcome: string; // What typically happens
  frequency: number; // How often we've seen this (count)

  // Temporal context
  dayOfWeek?: number[]; // 0-6
  hourRange?: { start: number; end: number };
  seasonalMonths?: number[]; // 1-12

  // Emotional context
  typicalEmotionBefore?: string;
  typicalEmotionAfter?: string;

  // Confidence
  observationCount: number;
  lastObserved: number;
  firstObserved: number;
  confidence: PredictionConfidence;
}

export interface Prediction {
  id: string;
  userId: string;
  patternId: string;

  // What we predict
  prediction: string;
  confidence: PredictionConfidence;
  basedOn: string; // Why we're predicting this

  // Timing
  predictedFor: number; // When we think it'll happen
  windowHours: number; // +/- window

  // Response
  suggestedIntervention: string;
  interventionTone: 'proactive' | 'gentle' | 'supportive' | 'protective';

  // Status
  status: 'pending' | 'surfaced' | 'confirmed' | 'missed' | 'wrong';
  createdAt: number;
}

export interface DayPattern {
  dayOfWeek: number;
  patterns: Array<{
    description: string;
    frequency: number;
    avgEmotion: string;
  }>;
}

export interface PredictiveContext {
  upcomingChallenges: string[];
  suggestedInterventions: string[];
  patternsDetected: string[];
  confidenceLevel: PredictionConfidence;
}

// ============================================================================
// LRU MEMORY CACHE (with size limits)
// ============================================================================

const MAX_MEMORY_CACHE_SIZE = 100; // Max users to keep in memory

class LRUPatternCache {
  private cache = new Map<string, { patterns: PatternObservation[]; lastAccess: number }>();

  get(userId: string): PatternObservation[] | undefined {
    const entry = this.cache.get(userId);
    if (entry) {
      entry.lastAccess = Date.now();
      return entry.patterns;
    }
    return undefined;
  }

  set(userId: string, patterns: PatternObservation[]): void {
    // Evict oldest if at capacity
    if (this.cache.size >= MAX_MEMORY_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(cleanForFirestore(userId), { patterns, lastAccess: Date.now() });
  }

  has(userId: string): boolean {
    return this.cache.has(userId);
  }

  delete(userId: string): void {
    this.cache.delete(userId);
  }

  clear(): void {
    this.cache.clear();
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      log.debug({ evictedUser: oldestKey }, 'Evicted oldest pattern cache entry');
    }
  }

  size(): number {
    return this.cache.size;
  }
}

const patternCache = new LRUPatternCache();

// ============================================================================
// PATTERN DETECTION
// ============================================================================

export async function recordObservation(
  userId: string,
  observation: {
    type: PatternType;
    trigger: string;
    outcome: string;
    emotion?: string;
    dayOfWeek?: number;
    hour?: number;
  }
): Promise<void> {
  const { type, trigger, outcome, emotion, dayOfWeek, hour } = observation;

  try {
    // Load existing patterns
    const patterns = await loadUserPatterns(userId);

    // Find matching pattern
    const existing = patterns.find(
      (p) =>
        p.type === type &&
        p.trigger.toLowerCase() === trigger.toLowerCase() &&
        p.outcome.toLowerCase().includes(outcome.toLowerCase().slice(0, 20))
    );

    if (existing) {
      // Update existing pattern
      existing.observationCount++;
      existing.lastObserved = Date.now();
      existing.frequency++;

      // Add temporal data
      if (dayOfWeek !== undefined) {
        existing.dayOfWeek = existing.dayOfWeek || [];
        if (!existing.dayOfWeek.includes(dayOfWeek)) {
          existing.dayOfWeek.push(dayOfWeek);
        }
      }

      // Update confidence based on observation count
      if (existing.observationCount >= 10) {
        existing.confidence = 'very_high';
      } else if (existing.observationCount >= 5) {
        existing.confidence = 'high';
      } else if (existing.observationCount >= 3) {
        existing.confidence = 'medium';
      }

      await savePattern(userId, existing);
    } else {
      // Create new pattern
      const newPattern: PatternObservation = {
        id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        type,
        trigger,
        outcome,
        frequency: 1,
        dayOfWeek: dayOfWeek !== undefined ? [dayOfWeek] : undefined,
        hourRange: hour !== undefined ? { start: hour - 2, end: hour + 2 } : undefined,
        typicalEmotionBefore: emotion,
        observationCount: 1,
        lastObserved: Date.now(),
        firstObserved: Date.now(),
        confidence: 'low',
      };

      await savePattern(userId, newPattern);
      patterns.push(newPattern);
    }

    patternCache.set(userId, patterns);
    log.debug({ userId, type, trigger }, '📊 Pattern observation recorded');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record observation');
  }
}

async function savePattern(userId: string, pattern: PatternObservation): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db
    .collection('bogle_users')
    .doc(userId)
    .collection('patterns')
    .doc(pattern.id)
    .set(cleanForFirestore(pattern));

  // Invalidate Redis cache after write (will be refreshed on next read)
  await invalidateRedisCache(userId);
}

/**
 * Load patterns for a user with multi-tier caching:
 * 1. LRU memory cache (fastest, per-instance)
 * 2. Redis cache (fast, cross-instance)
 * 3. Firestore (source of truth)
 */
export async function loadUserPatterns(userId: string): Promise<PatternObservation[]> {
  // TIER 1: Memory cache (fastest)
  const memoryPatterns = patternCache.get(userId);
  if (memoryPatterns) {
    log.debug(
      { userId, source: 'memory', count: memoryPatterns.length },
      'Patterns from memory cache'
    );
    return memoryPatterns;
  }

  // TIER 2: Redis cache (cross-instance)
  const redisPatterns = await getFromRedis(`patterns:${userId}`);
  if (redisPatterns) {
    patternCache.set(userId, redisPatterns);
    log.debug(
      { userId, source: 'redis', count: redisPatterns.length },
      'Patterns from Redis cache'
    );
    return redisPatterns;
  }

  // TIER 3: Firestore (source of truth)
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('patterns')
      .orderBy('frequency', 'desc')
      .limit(100)
      .get();

    const patterns = snapshot.docs.map((doc) => doc.data() as PatternObservation);

    // Populate both caches
    patternCache.set(userId, patterns);
    await saveToRedis(`patterns:${userId}`, patterns);

    log.debug({ userId, source: 'firestore', count: patterns.length }, 'Patterns from Firestore');
    return patterns;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load patterns');
    return [];
  }
}

// ============================================================================
// PREDICTION GENERATION
// ============================================================================

export async function generatePredictions(userId: string): Promise<Prediction[]> {
  const patterns = await loadUserPatterns(userId);
  const predictions: Prediction[] = [];
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  // Filter to high-confidence patterns
  const reliablePatterns = patterns.filter(
    (p) => p.confidence === 'high' || p.confidence === 'very_high'
  );

  for (const pattern of reliablePatterns) {
    // Check temporal match
    const dayMatch = !pattern.dayOfWeek || pattern.dayOfWeek.includes(currentDay);
    const hourMatch =
      !pattern.hourRange ||
      (currentHour >= pattern.hourRange.start && currentHour <= pattern.hourRange.end);

    // Check if tomorrow matches
    const tomorrowDay = (currentDay + 1) % 7;
    const tomorrowMatch = pattern.dayOfWeek?.includes(tomorrowDay);

    if (dayMatch && hourMatch) {
      // Pattern active now
      predictions.push(createPrediction(pattern, 'now', userId));
    } else if (tomorrowMatch) {
      // Pattern expected tomorrow
      predictions.push(createPrediction(pattern, 'tomorrow', userId));
    }
  }

  // Sort by confidence
  const confidenceOrder = { very_high: 0, high: 1, medium: 2, low: 3 };
  predictions.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  return predictions.slice(0, 3); // Max 3 predictions
}

function createPrediction(
  pattern: PatternObservation,
  timing: 'now' | 'tomorrow',
  userId: string
): Prediction {
  const predictionTexts: Record<PatternType, (p: PatternObservation) => string> = {
    temporal: (p) =>
      `Based on ${p.frequency} observations, ${p.outcome} tends to happen around this time`,
    emotional: (p) => `You often feel ${p.typicalEmotionAfter || 'different'} after ${p.trigger}`,
    behavioral: (p) => `I've noticed ${p.trigger} often leads to ${p.outcome}`,
    relational: (p) => `Conversations about ${p.trigger} often bring up ${p.outcome}`,
    cyclical: (p) => `This is usually when ${p.outcome} comes up for you`,
  };

  const interventions: Record<PatternType, (p: PatternObservation) => string> = {
    temporal: (p) =>
      `Hey, I noticed ${timing === 'tomorrow' ? 'tomorrow' : 'today'} tends to be when ${p.outcome}. Anything I can do to help you get ahead of it?`,
    emotional: (p) =>
      `I've been thinking about you. ${p.trigger} has been weighing on you lately. Want to talk it through?`,
    behavioral: (p) =>
      `I see a pattern here. When ${p.trigger} happens, you often end up ${p.outcome}. What if we tried something different this time?`,
    relational: (p) => `You haven't mentioned ${p.trigger} in a while. Is everything okay there?`,
    cyclical: (_p) =>
      `This time of ${timing === 'tomorrow' ? 'week' : 'day'} is usually tough. I'm here if you need me.`,
  };

  return {
    id: `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    patternId: pattern.id,
    prediction: predictionTexts[pattern.type](pattern),
    confidence: pattern.confidence,
    basedOn: `${pattern.observationCount} observations over ${Math.floor((Date.now() - pattern.firstObserved) / (24 * 60 * 60 * 1000))} days`,
    predictedFor: timing === 'now' ? Date.now() : Date.now() + 24 * 60 * 60 * 1000,
    windowHours: 6,
    suggestedIntervention: interventions[pattern.type](pattern),
    interventionTone: pattern.typicalEmotionBefore === 'stressed' ? 'protective' : 'proactive',
    status: 'pending',
    createdAt: Date.now(),
  };
}

// ============================================================================
// DAY-OF-WEEK ANALYSIS
// ============================================================================

export async function getDayPatterns(userId: string): Promise<DayPattern[]> {
  const patterns = await loadUserPatterns(userId);
  const dayPatterns: DayPattern[] = [];

  for (let day = 0; day < 7; day++) {
    // dayName available for debugging: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]
    const daySpecificPatterns = patterns.filter((p) => p.dayOfWeek?.includes(day));

    if (daySpecificPatterns.length > 0) {
      dayPatterns.push({
        dayOfWeek: day,
        patterns: daySpecificPatterns.map((p) => ({
          description: `${p.trigger} → ${p.outcome}`,
          frequency: p.frequency,
          avgEmotion: p.typicalEmotionBefore || 'neutral',
        })),
      });
    }
  }

  return dayPatterns;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildPredictiveContext(userId: string): Promise<PredictiveContext> {
  const predictions = await generatePredictions(userId);
  const dayPatterns = await getDayPatterns(userId);
  const now = new Date();
  const currentDay = now.getDay();

  const context: PredictiveContext = {
    upcomingChallenges: [],
    suggestedInterventions: [],
    patternsDetected: [],
    confidenceLevel: 'low',
  };

  // Add predictions
  for (const pred of predictions) {
    context.upcomingChallenges.push(pred.prediction);
    context.suggestedInterventions.push(pred.suggestedIntervention);
    if (pred.confidence === 'high' || pred.confidence === 'very_high') {
      context.confidenceLevel = pred.confidence;
    }
  }

  // Add day-specific patterns
  const todayPatterns = dayPatterns.find((d) => d.dayOfWeek === currentDay);
  if (todayPatterns) {
    for (const p of todayPatterns.patterns) {
      context.patternsDetected.push(
        `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDay]} pattern: ${p.description}`
      );
    }
  }

  return context;
}

export async function buildPredictiveContextString(userId: string): Promise<string> {
  const context = await buildPredictiveContext(userId);

  if (context.upcomingChallenges.length === 0 && context.patternsDetected.length === 0) {
    return '';
  }

  const sections: string[] = ['[PREDICTIVE COACHING - Better Than Human Anticipation]'];
  sections.push('You see their struggles before they do. Use this wisely and gently.');

  if (context.upcomingChallenges.length > 0) {
    sections.push('\n**Anticipated Challenges:**');
    for (const challenge of context.upcomingChallenges) {
      sections.push(`• ${challenge}`);
    }
  }

  if (context.suggestedInterventions.length > 0) {
    sections.push('\n**Proactive Offerings:**');
    for (const intervention of context.suggestedInterventions) {
      sections.push(`• "${intervention}"`);
    }
  }

  if (context.patternsDetected.length > 0) {
    sections.push('\n**Day Patterns:**');
    for (const pattern of context.patternsDetected) {
      sections.push(`• ${pattern}`);
    }
  }

  sections.push(`\nConfidence: ${context.confidenceLevel}`);
  sections.push('Surface these naturally. Anticipation should feel magical, not surveillance.');

  return sections.join('\n');
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear pattern cache for a user (useful after bulk imports or testing).
 * Clears both memory and Redis caches.
 */
export async function clearPatternCache(userId?: string): Promise<void> {
  if (userId) {
    patternCache.delete(userId);
    await invalidateRedisCache(userId);
  } else {
    // Clear all memory cache - Redis entries will expire via TTL
    patternCache.clear();
    log.info('Pattern memory cache cleared (Redis will expire via TTL)');
  }
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): {
  memoryCacheUsers: number;
  redisEnabled: boolean;
  maxMemoryCacheSize: number;
} {
  return {
    memoryCacheUsers: patternCache.size(),
    redisEnabled: redisCache !== null,
    maxMemoryCacheSize: MAX_MEMORY_CACHE_SIZE,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const predictiveCoaching = {
  recordObservation,
  loadPatterns: loadUserPatterns,
  generatePredictions,
  getDayPatterns,
  buildContext: buildPredictiveContext,
  buildContextString: buildPredictiveContextString,
  clearCache: clearPatternCache,
  getCacheStats,
  initializeRedis: initializeRedisCache,
  // Aliases for test compatibility
  recordPattern: recordObservation,
  getPatterns: loadUserPatterns,
};
