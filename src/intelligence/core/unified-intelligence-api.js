/**
 * Unified Intelligence API
 *
 * Single entry point for the unified intelligence system.
 * Coordinates Context Assembly, Cross-Domain Correlation, and Proactive Intelligence.
 *
 * Architecture Levels:
 * - Level 2: Context Assembly (context-assembler.ts)
 * - Level 4: Cross-Domain Correlation (patterns/cross-domain-correlator.ts)
 * - Level 5: Proactive Intelligence (proactive/proactive-engine.ts)
 *
 * @module intelligence/unified-intelligence-api
 */
import { createLogger } from '../../utils/safe-logger.js';
import { assembleContext, clearContextCache, formatAssembledContextForPrompt, selectContextForTurn, } from './context-assembler.js';
import { recordDomainSignal as recordSignal, getCorrelations, getRelevantCorrelations, markCorrelationSurfaced, formatCorrelationsForPrompt, clearCorrelatorState, getDomainSignals as getSignals, } from '../patterns/cross-domain-correlator.js';
import { checkProactiveTriggers, markInsightSurfaced as markSurfaced, recordInsightReaction as recordReaction, wasInsightSurfaced as wasSurfaced, getInsightReaction as getReaction, initProactiveSession, cleanupProactiveSession, clearProactiveState, } from '../proactive/proactive-engine.js';
const log = createLogger({ module: 'unified-intelligence-api' });
// ============================================================================
// SESSION LIFECYCLE
// ============================================================================
/**
 * Initialize intelligence for a new session.
 * Call this at session start.
 */
export function initIntelligenceSession(userId) {
    log.info({ userId }, '🧠 Initializing intelligence session');
    initProactiveSession(userId);
    clearContextCache(userId);
}
/**
 * Clean up intelligence at session end.
 * Call this when a session ends.
 */
export function cleanupIntelligence(userId) {
    log.info({ userId }, '🧹 Cleaning up intelligence session');
    cleanupProactiveSession(userId);
    clearContextCache(userId);
}
// ============================================================================
// MAIN API
// ============================================================================
/**
 * Get all intelligence for a conversation turn.
 *
 * This is the main entry point - call this once per turn to get
 * everything Ferni needs to respond intelligently.
 *
 * @example
 * ```typescript
 * const intelligence = await getIntelligenceForTurn(userId, {
 *   moment: 'session_start',
 *   voiceEmotion: { primary: 'anxious', energy: 0.3 },
 *   recentTopics: ['work stress', 'sleep issues'],
 * });
 *
 * // Use in prompt
 * systemPrompt += intelligence.formattedContext;
 *
 * // Check for proactive insight to surface
 * if (intelligence.proactiveInsights.length > 0) {
 *   const insight = intelligence.proactiveInsights[0];
 *   // Surface it and mark as delivered
 *   markInsightSurfaced(userId, insight.id);
 * }
 * ```
 */
export async function getIntelligenceForTurn(userId, options) {
    const startTime = Date.now();
    log.debug({ userId, moment: options.moment }, '📊 Getting intelligence for turn');
    // Assemble context (Level 2)
    const assemblyOptions = {
        userId,
        voiceEmotion: options.voiceEmotion,
        calendarEvents: options.calendarEvents,
        recentTopics: options.recentTopics,
        forceRefresh: options.forceRefresh,
    };
    const fullContext = await assembleContext(assemblyOptions);
    // Select relevant context for this turn
    const context = selectContextForTurn(fullContext, options.currentTopic || '', options.persona);
    // Get relevant correlations (Level 4)
    const correlations = getRelevantCorrelations(userId, {
        currentTopics: options.recentTopics,
        currentMood: options.voiceEmotion?.primary,
        currentDomains: context.activeDomains,
    });
    // Check proactive triggers (Level 5)
    const proactiveResult = checkProactiveTriggers(userId, context, options.moment, correlations);
    // Format for prompt injection
    const contextStr = formatAssembledContextForPrompt(context);
    const correlationStr = formatCorrelationsForPrompt(correlations);
    const sections = [contextStr];
    if (correlationStr)
        sections.push(correlationStr);
    // Add proactive insight hints (but don't include the actual message - let turn handler decide)
    if (proactiveResult.insights.length > 0) {
        const topInsight = proactiveResult.insights[0];
        sections.push(`[PROACTIVE] Ready to surface: ${topInsight.category} (priority ${topInsight.priority})`);
    }
    const formattedContext = sections.join('\n\n');
    const elapsed = Date.now() - startTime;
    log.debug({
        userId,
        elapsed,
        domains: context.activeDomains.length,
        correlations: correlations.length,
        proactive: proactiveResult.insights.length,
    }, '✅ Intelligence assembled');
    return {
        context,
        correlations,
        proactiveInsights: proactiveResult.insights,
        formattedContext,
    };
}
// ============================================================================
// DOMAIN SIGNALS (Cross-Domain Correlation Input)
// ============================================================================
/**
 * Record a domain signal for cross-domain correlation.
 *
 * Call this whenever you observe a meaningful change in any domain:
 * - User mentions being tired → sleep domain
 * - Habit completed → habits domain
 * - Stress detected in voice → stress domain
 * - Person mentioned → person_mentioned domain
 *
 * @example
 * ```typescript
 * // When user mentions sleep issues
 * recordDomainSignal(userId, {
 *   domain: 'sleep',
 *   store: 'conversation',
 *   metric: 'quality',
 *   direction: 'decreased',
 *   magnitude: 'moderate',
 *   timestamp: new Date(),
 * });
 *
 * // When habit is completed
 * recordDomainSignal(userId, {
 *   domain: 'habits',
 *   store: 'habit-coaching',
 *   metric: 'morning_routine',
 *   direction: 'completed',
 *   magnitude: 'moderate',
 *   timestamp: new Date(),
 * });
 * ```
 */
export function recordDomainSignal(userId, signal) {
    recordSignal(userId, signal);
}
// ============================================================================
// INSIGHT TRACKING
// ============================================================================
/**
 * Mark a proactive insight as surfaced (shown to user).
 * Call this after you've delivered an insight to the user.
 */
export function markInsightSurfaced(userId, insightId) {
    markSurfaced(userId, insightId);
    // Also mark correlation if this was a correlation insight
    if (insightId.startsWith('corr_')) {
        const correlationId = insightId.replace('corr_', '');
        markCorrelationSurfaced(userId, correlationId);
    }
}
/**
 * Record user reaction to a proactive insight.
 * Use this to learn what insights land well.
 */
export function recordInsightReaction(userId, insightId, reaction) {
    recordReaction(userId, insightId, reaction);
}
// ============================================================================
// UTILITY EXPORTS
// ============================================================================
/**
 * Get all domain signals for a user (for debugging/testing).
 */
export function getDomainSignals(userId) {
    return getSignals(userId);
}
/**
 * Check if an insight was surfaced.
 */
export function wasInsightSurfaced(userId, insightId) {
    return wasSurfaced(userId, insightId);
}
/**
 * Get reaction to an insight.
 */
export function getInsightReaction(userId, insightId) {
    return getReaction(userId, insightId);
}
/**
 * Get all correlations for a user (for debugging/advanced use).
 */
export function getAllCorrelations(userId) {
    return getCorrelations(userId);
}
// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
/**
 * Clear all caches for a user.
 * Useful when significant changes occur that invalidate cached data.
 */
export function clearIntelligenceCaches(userId) {
    clearContextCache(userId);
    clearCorrelatorState(userId);
    clearProactiveState(userId);
    log.debug({ userId: userId ?? 'all' }, '🗑️ Intelligence caches cleared');
}
// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================
/**
 * Quick check if there are proactive insights ready for a moment.
 * Lighter weight than full getIntelligenceForTurn.
 */
export async function hasProactiveInsight(userId, moment) {
    const context = await assembleContext({ userId });
    const result = checkProactiveTriggers(userId, context, moment);
    return result.insights.length > 0;
}
/**
 * Get the top proactive insight for a moment without full context assembly.
 */
export async function getTopProactiveInsight(userId, moment) {
    const context = await assembleContext({ userId });
    const result = checkProactiveTriggers(userId, context, moment);
    return result.insights[0] || null;
}
//# sourceMappingURL=unified-intelligence-api.js.map