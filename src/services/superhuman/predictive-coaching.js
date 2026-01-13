/**
 * Predictive Coaching Engine - Better Than Human Service
 *
 * What no human friend can do: See your struggle before you do.
 *
 * SEMANTIC NOTE: Called "coaching" because it COACHES through prediction.
 * The service anticipates struggles and surfaces insights at optimal moments -
 * this is coaching behavior (proactive guidance), even though the mechanism
 * is pattern recognition. Compare to a coach who studies your game film and
 * predicts where you'll struggle before practice.
 *
 * Alternative names considered:
 * - predictive-patterns.ts (describes mechanism, not purpose)
 * - anticipatory-support.ts (too abstract)
 * - predictive-coaching.ts (describes PURPOSE - coaching through prediction) ✓
 *
 * ---
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
import { onPredictiveInsightChange } from '../data-layer/hooks/superhuman-hooks.js';
const log = createLogger({ module: 'predictive-coaching' });
let redisCache = null;
let redisInitialized = false;
const REDIS_KEY_PREFIX = 'predictions:';
const REDIS_PATTERN_TTL = 60 * 15; // 15 minutes - patterns don't change fast
const REDIS_PREDICTIONS_TTL = 60 * 5; // 5 minutes - predictions update per session
/**
 * Initialize Redis caching for cross-instance pattern sharing.
 * Falls back to memory-only if Redis unavailable.
 */
export async function initializeRedisCache() {
    if (redisInitialized)
        return;
    try {
        const { getRedisCache } = await import('../../memory/redis-cache.js');
        const cache = getRedisCache();
        await cache.initialize();
        // Verify it's working
        redisCache = cache;
        redisInitialized = true;
        log.info('🚀 Predictive coaching Redis cache initialized');
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Redis unavailable for predictive coaching - using memory only');
        redisInitialized = true; // Mark as initialized so we don't retry
    }
}
/**
 * Get patterns from Redis cache
 */
async function getFromRedis(key) {
    if (!redisCache)
        return null;
    try {
        const data = await redisCache.get(`${REDIS_KEY_PREFIX}${key}`);
        if (data) {
            return JSON.parse(data);
        }
    }
    catch (error) {
        log.debug({ error: String(error), key }, 'Redis get failed (non-fatal)');
    }
    return null;
}
/**
 * Save patterns to Redis cache
 */
async function saveToRedis(key, patterns, ttlSeconds = REDIS_PATTERN_TTL) {
    if (!redisCache)
        return;
    try {
        await redisCache.setex(`${REDIS_KEY_PREFIX}${key}`, ttlSeconds, JSON.stringify(patterns));
    }
    catch (error) {
        log.debug({ error: String(error), key }, 'Redis set failed (non-fatal)');
    }
}
/**
 * Invalidate Redis cache for a user
 */
async function invalidateRedisCache(userId) {
    if (!redisCache)
        return;
    try {
        await redisCache.del([
            `${REDIS_KEY_PREFIX}patterns:${userId}`,
            `${REDIS_KEY_PREFIX}predictions:${userId}`,
            `${REDIS_KEY_PREFIX}context:${userId}`,
        ]);
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Redis invalidation failed (non-fatal)');
    }
}
// ============================================================================
// LRU MEMORY CACHE (with size limits)
// ============================================================================
const MAX_MEMORY_CACHE_SIZE = 100; // Max users to keep in memory
class LRUPatternCache {
    cache = new Map();
    get(userId) {
        const entry = this.cache.get(userId);
        if (entry) {
            entry.lastAccess = Date.now();
            return entry.patterns;
        }
        return undefined;
    }
    set(userId, patterns) {
        // Evict oldest if at capacity
        if (this.cache.size >= MAX_MEMORY_CACHE_SIZE) {
            this.evictOldest();
        }
        this.cache.set(cleanForFirestore(userId), { patterns, lastAccess: Date.now() });
    }
    has(userId) {
        return this.cache.has(userId);
    }
    delete(userId) {
        this.cache.delete(userId);
    }
    clear() {
        this.cache.clear();
    }
    evictOldest() {
        let oldestKey = null;
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
    size() {
        return this.cache.size;
    }
}
const patternCache = new LRUPatternCache();
// ============================================================================
// PATTERN DETECTION
// ============================================================================
export async function recordObservation(userId, observation) {
    const { type, trigger, outcome, emotion, dayOfWeek, hour } = observation;
    try {
        // Load existing patterns
        const patterns = await loadUserPatterns(userId);
        // Find matching pattern
        const existing = patterns.find((p) => p.type === type &&
            p.trigger.toLowerCase() === trigger.toLowerCase() &&
            p.outcome.toLowerCase().includes(outcome.toLowerCase().slice(0, 20)));
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
            }
            else if (existing.observationCount >= 5) {
                existing.confidence = 'high';
            }
            else if (existing.observationCount >= 3) {
                existing.confidence = 'medium';
            }
            await savePattern(userId, existing);
        }
        else {
            // Create new pattern
            const newPattern = {
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
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to record observation');
    }
}
async function savePattern(userId, pattern) {
    const db = getFirestoreDb();
    if (!db)
        return;
    await db
        .collection('bogle_users')
        .doc(userId)
        .collection('patterns')
        .doc(pattern.id)
        .set(cleanForFirestore(pattern));
    // Index to semantic memory for cross-domain awareness
    void onPredictiveInsightChange(userId, pattern.id, {
        prediction: pattern.type,
        basis: pattern.trigger,
        confidence: pattern.observationCount >= 5 ? 'high' : pattern.observationCount >= 2 ? 'medium' : 'low',
        timeframe: undefined,
        actionSuggestion: pattern.outcome,
    }, 'update');
    // Invalidate Redis cache after write (will be refreshed on next read)
    await invalidateRedisCache(userId);
}
/**
 * Load patterns for a user with multi-tier caching:
 * 1. LRU memory cache (fastest, per-instance)
 * 2. Redis cache (fast, cross-instance)
 * 3. Firestore (source of truth)
 */
export async function loadUserPatterns(userId) {
    // TIER 1: Memory cache (fastest)
    const memoryPatterns = patternCache.get(userId);
    if (memoryPatterns) {
        log.debug({ userId, source: 'memory', count: memoryPatterns.length }, 'Patterns from memory cache');
        return memoryPatterns;
    }
    // TIER 2: Redis cache (cross-instance)
    const redisPatterns = await getFromRedis(`patterns:${userId}`);
    if (redisPatterns) {
        patternCache.set(userId, redisPatterns);
        log.debug({ userId, source: 'redis', count: redisPatterns.length }, 'Patterns from Redis cache');
        return redisPatterns;
    }
    // TIER 3: Firestore (source of truth)
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('patterns')
            .orderBy('frequency', 'desc')
            .limit(100)
            .get();
        const patterns = snapshot.docs.map((doc) => doc.data());
        // Populate both caches
        patternCache.set(userId, patterns);
        await saveToRedis(`patterns:${userId}`, patterns);
        log.debug({ userId, source: 'firestore', count: patterns.length }, 'Patterns from Firestore');
        return patterns;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load patterns');
        return [];
    }
}
// ============================================================================
// CONFIDENCE DECAY
// ============================================================================
// Patterns decay if not observed within these windows
const CONFIDENCE_DECAY_CONFIG = {
    very_high: { daysToDecay: 30, decayTo: 'high' },
    high: { daysToDecay: 21, decayTo: 'medium' },
    medium: { daysToDecay: 14, decayTo: 'low' },
    low: { daysToDecay: 30, decayTo: null }, // Low stays low until removed
};
/**
 * Apply confidence decay to patterns that haven't been observed recently.
 * This prevents stale patterns from dominating predictions.
 */
export function applyConfidenceDecay(pattern) {
    const daysSinceObserved = (Date.now() - pattern.lastObserved) / (24 * 60 * 60 * 1000);
    const decayConfig = CONFIDENCE_DECAY_CONFIG[pattern.confidence];
    if (daysSinceObserved > decayConfig.daysToDecay && decayConfig.decayTo) {
        return {
            ...pattern,
            confidence: decayConfig.decayTo,
        };
    }
    return pattern;
}
/**
 * Apply decay to all patterns and save updated confidence levels
 */
export async function decayStalePatterns(userId) {
    const patterns = await loadUserPatterns(userId);
    let decayedCount = 0;
    for (const pattern of patterns) {
        const decayed = applyConfidenceDecay(pattern);
        if (decayed.confidence !== pattern.confidence) {
            await savePattern(userId, decayed);
            decayedCount++;
        }
    }
    if (decayedCount > 0) {
        // Invalidate cache after decay updates
        patternCache.delete(userId);
        await invalidateRedisCache(userId);
        log.debug({ userId, decayedCount }, '📉 Decayed stale pattern confidence');
    }
    return decayedCount;
}
// ============================================================================
// PATTERN FEEDBACK (Confirm/Invalidate)
// ============================================================================
/**
 * Confirm a prediction was accurate - boosts pattern confidence
 */
export async function confirmPrediction(userId, patternId) {
    try {
        const patterns = await loadUserPatterns(userId);
        const pattern = patterns.find((p) => p.id === patternId);
        if (!pattern) {
            log.debug({ userId, patternId }, 'Pattern not found for confirmation');
            return;
        }
        // Boost confidence
        const confidenceBoost = {
            low: 'medium',
            medium: 'high',
            high: 'very_high',
            very_high: 'very_high',
        };
        const updated = {
            ...pattern,
            confidence: confidenceBoost[pattern.confidence],
            observationCount: pattern.observationCount + 1,
            lastObserved: Date.now(),
        };
        await savePattern(userId, updated);
        log.info({ userId, patternId, newConfidence: updated.confidence }, '✅ Prediction confirmed - confidence boosted');
    }
    catch (error) {
        log.warn({ error: String(error), userId, patternId }, 'Failed to confirm prediction');
    }
}
/**
 * Invalidate a prediction - reduces pattern confidence
 */
export async function invalidatePrediction(userId, patternId) {
    try {
        const patterns = await loadUserPatterns(userId);
        const pattern = patterns.find((p) => p.id === patternId);
        if (!pattern) {
            log.debug({ userId, patternId }, 'Pattern not found for invalidation');
            return;
        }
        // Reduce confidence
        const confidenceReduce = {
            very_high: 'high',
            high: 'medium',
            medium: 'low',
            low: null, // Will be removed
        };
        const newConfidence = confidenceReduce[pattern.confidence];
        if (newConfidence === null) {
            // Remove pattern entirely if confidence drops below low
            const db = getFirestoreDb();
            if (db) {
                await db
                    .collection('bogle_users')
                    .doc(userId)
                    .collection('patterns')
                    .doc(patternId)
                    .delete();
                log.info({ userId, patternId }, '🗑️ Low-confidence pattern removed');
            }
        }
        else {
            const updated = {
                ...pattern,
                confidence: newConfidence,
            };
            await savePattern(userId, updated);
            log.info({ userId, patternId, newConfidence }, '❌ Prediction invalidated - confidence reduced');
        }
        // Invalidate cache
        patternCache.delete(userId);
        await invalidateRedisCache(userId);
    }
    catch (error) {
        log.warn({ error: String(error), userId, patternId }, 'Failed to invalidate prediction');
    }
}
// ============================================================================
// PREDICTION GENERATION
// ============================================================================
export async function generatePredictions(userId) {
    // Apply decay before generating predictions
    await decayStalePatterns(userId);
    const patterns = await loadUserPatterns(userId);
    const predictions = [];
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    // Filter to high-confidence patterns
    const reliablePatterns = patterns.filter((p) => p.confidence === 'high' || p.confidence === 'very_high');
    for (const pattern of reliablePatterns) {
        // Check temporal match
        const dayMatch = !pattern.dayOfWeek || pattern.dayOfWeek.includes(currentDay);
        const hourMatch = !pattern.hourRange ||
            (currentHour >= pattern.hourRange.start && currentHour <= pattern.hourRange.end);
        // Check if tomorrow matches
        const tomorrowDay = (currentDay + 1) % 7;
        const tomorrowMatch = pattern.dayOfWeek?.includes(tomorrowDay);
        if (dayMatch && hourMatch) {
            // Pattern active now
            predictions.push(createPrediction(pattern, 'now', userId));
        }
        else if (tomorrowMatch) {
            // Pattern expected tomorrow
            predictions.push(createPrediction(pattern, 'tomorrow', userId));
        }
    }
    // Sort by confidence
    const confidenceOrder = { very_high: 0, high: 1, medium: 2, low: 3 };
    predictions.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);
    return predictions.slice(0, 3); // Max 3 predictions
}
function createPrediction(pattern, timing, userId) {
    const predictionTexts = {
        temporal: (p) => `Based on ${p.frequency} observations, ${p.outcome} tends to happen around this time`,
        emotional: (p) => `You often feel ${p.typicalEmotionAfter || 'different'} after ${p.trigger}`,
        behavioral: (p) => `I've noticed ${p.trigger} often leads to ${p.outcome}`,
        relational: (p) => `Conversations about ${p.trigger} often bring up ${p.outcome}`,
        cyclical: (p) => `This is usually when ${p.outcome} comes up for you`,
    };
    const interventions = {
        temporal: (p) => `Hey, I noticed ${timing === 'tomorrow' ? 'tomorrow' : 'today'} tends to be when ${p.outcome}. Anything I can do to help you get ahead of it?`,
        emotional: (p) => `I've been thinking about you. ${p.trigger} has been weighing on you lately. Want to talk it through?`,
        behavioral: (p) => `I see a pattern here. When ${p.trigger} happens, you often end up ${p.outcome}. What if we tried something different this time?`,
        relational: (p) => `You haven't mentioned ${p.trigger} in a while. Is everything okay there?`,
        cyclical: (_p) => `This time of ${timing === 'tomorrow' ? 'week' : 'day'} is usually tough. I'm here if you need me.`,
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
export async function getDayPatterns(userId) {
    const patterns = await loadUserPatterns(userId);
    const dayPatterns = [];
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
export async function buildPredictiveContext(userId) {
    const predictions = await generatePredictions(userId);
    const dayPatterns = await getDayPatterns(userId);
    const now = new Date();
    const currentDay = now.getDay();
    const context = {
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
            context.patternsDetected.push(`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDay]} pattern: ${p.description}`);
        }
    }
    return context;
}
export async function buildPredictiveContextString(userId) {
    const context = await buildPredictiveContext(userId);
    if (context.upcomingChallenges.length === 0 && context.patternsDetected.length === 0) {
        return '';
    }
    const sections = ['[PREDICTIVE COACHING - Better Than Human Anticipation]'];
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
export async function clearPatternCache(userId) {
    if (userId) {
        patternCache.delete(userId);
        await invalidateRedisCache(userId);
    }
    else {
        // Clear all memory cache - Redis entries will expire via TTL
        patternCache.clear();
        log.info('Pattern memory cache cleared (Redis will expire via TTL)');
    }
}
/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
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
    // Confidence management
    confirmPrediction,
    invalidatePrediction,
    applyConfidenceDecay,
    decayStalePatterns,
    // Aliases for test compatibility
    recordPattern: recordObservation,
    getPatterns: loadUserPatterns,
};
//# sourceMappingURL=predictive-coaching.js.map