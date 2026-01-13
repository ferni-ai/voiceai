/**
 * Semantic Intelligence Context Builder
 *
 * This builder integrates the V3.0-V3.7 Semantic Intelligence capabilities
 * into the LLM context injection system.
 *
 * Capabilities injected:
 * - V3.0: Correlation Mining, Emotional Trajectories, Relational Semantics,
 *         Counter-Factual Memory, Growth Fingerprint, Cross-Session Threading
 * - V3.2: Proactive Insights, Open Loops, Ferni Commitments
 * - V3.3: Relationship Graph
 * - V3.4: Temporal Patterns
 * - V3.5: Behavioral Intelligence
 * - V3.6: Coaching Intelligence
 * - V3.7: Self-Awareness Coaching
 *
 * @module intelligence/context-builders/superhuman/semantic-intelligence-integration
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory, createStandardInjection, registerContextBuilder, } from '../index.js';
const log = createLogger({ module: 'context:semantic-intelligence' });
const contextCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache
function getCacheKey(userId, topics, emotion, person) {
    return `${userId}:${topics?.join(',') || ''}:${emotion || ''}:${person || ''}`;
}
function getCachedContext(userId, topics, emotion, person) {
    const key = getCacheKey(userId, topics, emotion, person);
    const cached = contextCache.get(key);
    if (!cached)
        return null;
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
        contextCache.delete(key);
        return null;
    }
    return cached.context;
}
function setCachedContext(userId, context, topics, emotion, person) {
    const key = getCacheKey(userId, topics, emotion, person);
    contextCache.set(key, {
        context,
        timestamp: Date.now(),
        topics,
        emotion,
        person,
    });
    // Prevent unbounded cache growth
    if (contextCache.size > 100) {
        const oldestKey = contextCache.keys().next().value;
        if (oldestKey)
            contextCache.delete(oldestKey);
    }
}
// ============================================================================
// BUILDER
// ============================================================================
export const semanticIntelligenceBuilder = {
    name: 'semantic-intelligence',
    description: 'Injects V3.0-V3.7 Semantic Intelligence insights into LLM context',
    priority: 45, // Mid-priority - after memory but before humanizing
    category: BuilderCategory.MEMORY,
    build: async (input) => {
        const { services, userData, analysis, userText, voiceEmotion } = input;
        const userId = services?.userId;
        // Only for authenticated users
        if (!userId) {
            return [];
        }
        const turnCount = userData?.turnCount || 0;
        const isSessionStart = turnCount <= 1;
        // On session start, we want semantic intelligence even without prior context
        // This enables "I remember from last time..." moments on first turn
        // MEMORY category handles when this runs: first 3 turns + every 5th turn + returning users
        try {
            // Extract current context signals
            const currentTopics = analysis?.topics?.detected || [];
            const currentEmotion = analysis?.emotion?.primary || voiceEmotion?.emotion;
            const currentPerson = extractMentionedPerson(userText || '');
            // Check cache first
            const cachedContext = getCachedContext(userId, currentTopics, currentEmotion, currentPerson);
            if (cachedContext) {
                log.debug({ userId, cached: true }, 'Using cached semantic intelligence context');
                return [
                    createStandardInjection('semantic_intelligence', cachedContext, {
                        category: 'semantic',
                        confidence: 0.9,
                    }),
                ];
            }
            // Build fresh context
            const { buildSemanticIntelligenceContext, formatSemanticIntelligenceContext } = await import('../../../services/superhuman/semantic-intelligence/index.js');
            const semanticContext = await buildSemanticIntelligenceContext(userId, {
                topics: currentTopics,
                emotion: currentEmotion,
                personMentioned: currentPerson,
                isSessionStart,
                content: userText,
            });
            const formatted = formatSemanticIntelligenceContext(semanticContext);
            // Skip if no meaningful content
            if (!formatted || formatted.length < 100) {
                return [];
            }
            // Cache the result
            setCachedContext(userId, formatted, currentTopics, currentEmotion, currentPerson);
            log.debug({ userId, contextLength: formatted.length, turnCount }, 'Semantic intelligence context built');
            return [
                createStandardInjection('semantic_intelligence', formatted, {
                    category: 'semantic',
                    confidence: 0.9,
                }),
            ];
        }
        catch (error) {
            // Non-fatal - semantic intelligence is an enhancement
            log.debug({ error: String(error), userId }, 'Semantic intelligence build failed (non-fatal)');
            return [];
        }
    },
};
/**
 * Extract mentioned person from text using simple regex.
 * This is a fast fallback; the full person extraction runs separately.
 */
function extractMentionedPerson(text) {
    // Common relationship mentions
    const relationshipPatterns = [
        /\bmy (mom|dad|mother|father|wife|husband|partner|boss|manager|sister|brother|friend)\b/i,
        /\b(mom|dad|wife|husband|boss) (said|told|asked|mentioned|thinks|wants)\b/i,
    ];
    for (const pattern of relationshipPatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1].toLowerCase();
        }
    }
    // Named person pattern (simplified)
    const namedMatch = text.match(/\b(my friend|my colleague|my coworker) (\w+)\b/i);
    if (namedMatch) {
        return namedMatch[2];
    }
    return undefined;
}
// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
/**
 * Clear cached context for a user (call when session ends or data changes).
 */
export function clearSemanticIntelligenceCache(userId) {
    if (userId) {
        for (const [key] of contextCache) {
            if (key.startsWith(`${userId}:`)) {
                contextCache.delete(key);
            }
        }
    }
    else {
        contextCache.clear();
    }
}
/**
 * Get cache statistics for monitoring.
 */
export function getSemanticIntelligenceCacheStats() {
    return {
        size: contextCache.size,
        maxSize: 100,
        ttlMs: CACHE_TTL_MS,
    };
}
// ============================================================================
// REGISTRATION
// ============================================================================
// Register the builder on module load
registerContextBuilder(semanticIntelligenceBuilder);
export default semanticIntelligenceBuilder;
//# sourceMappingURL=semantic-intelligence-integration.js.map