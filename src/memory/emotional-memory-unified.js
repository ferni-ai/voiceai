/**
 * Unified Emotional Memory System
 *
 * Coordinates two complementary emotional memory systems:
 *
 * 1. User Emotion Tracking (from intelligence/emotional-memory.ts)
 *    - What emotions the USER has expressed
 *    - Patterns in their emotional state over time
 *    - Check-in suggestions based on past emotions
 *
 * 2. Persona Bonding (from conversation/superhuman/emotional-memory.ts)
 *    - How the PERSONA feels about this user
 *    - Warmth, trust, protectiveness, admiration levels
 *    - Relationship stage progression
 *
 * This module provides a single entry point for all emotional memory operations.
 *
 * Architecture Note: This module uses dependency injection for the emotional memory
 * engines to avoid architecture violations (memory layer importing from intelligence
 * and conversation layers). The engines are injected at runtime by the services layer.
 *
 * @module memory/emotional-memory-unified
 */
import { createLogger } from '../utils/safe-logger.js';
import { fromLegacyStage, } from '../types/relationship-stages.js';
// Engine factories - must be configured before use
let engineFactories = null;
/**
 * Configure the emotional memory engine factories.
 * This MUST be called by the services layer before using UnifiedEmotionalMemory.
 *
 * @example
 * // In services/index.ts or similar:
 * configureEmotionalMemoryEngines({
 *   getUserEmotionEngine: (userId) => getEmotionalMemory(userId),
 *   getBondingEngine: (userId, bond) => getEmotionalMemory(userId, bond),
 *   removeUserEmotionEngine: (userId) => removeEmotionalMemory(userId),
 *   clearBondingEngine: (userId) => clearEmotionalMemory(userId),
 * });
 */
export function configureEmotionalMemoryEngines(factories) {
    engineFactories = factories;
}
/**
 * Check if engines are configured
 */
export function areEmotionalMemoryEnginesConfigured() {
    return engineFactories !== null;
}
const log = createLogger({ module: 'UnifiedEmotionalMemory' });
function getFactories() {
    if (!engineFactories) {
        throw new Error('EmotionalMemoryEngineFactories not configured. ' +
            'Call configureEmotionalMemoryEngines() during service initialization.');
    }
    return engineFactories;
}
// ============================================================================
// UNIFIED EMOTIONAL MEMORY ENGINE
// ============================================================================
/**
 * Unified interface for all emotional memory operations
 */
export class UnifiedEmotionalMemory {
    userId;
    personaId;
    userEmotions;
    bonding;
    constructor(config) {
        this.userId = config.userId;
        this.personaId = config.personaId || 'ferni';
        // Get or create the underlying engines via dependency injection
        const factories = getFactories();
        this.userEmotions = factories.getUserEmotionEngine(config.userId);
        this.bonding = factories.getBondingEngine(config.userId, config.existingBond);
        if (config.personaId) {
            this.bonding.setPersonaId(config.personaId);
        }
        log.debug({ userId: config.userId, personaId: this.personaId }, 'UnifiedEmotionalMemory created');
    }
    // ============================================================================
    // SESSION LIFECYCLE
    // ============================================================================
    /**
     * Start a new session
     */
    startSession(sessionId) {
        this.userEmotions.startSession(sessionId);
        log.debug({ sessionId }, 'Emotional memory session started');
    }
    /**
     * End current session
     */
    endSession() {
        this.bonding.recordSessionEnd();
        log.debug('Emotional memory session ended');
    }
    // ============================================================================
    // USER EMOTION TRACKING
    // ============================================================================
    /**
     * Record a user's emotional moment
     */
    recordUserEmotion(emotion, topic, trigger, userStatement, intensity = 'moderate') {
        // Record in user emotion system
        const momentId = this.userEmotions.recordMoment(emotion, topic, trigger, userStatement, intensity);
        // Update bonding system based on emotion type
        if (['fear', 'anxiety', 'sadness'].includes(emotion)) {
            this.bonding.recordEvent('struggle_shared', { topic, description: trigger });
        }
        else if (['joy', 'anticipation'].includes(emotion)) {
            if (intensity === 'strong') {
                this.bonding.recordEvent('growth_shown', { topic, description: trigger });
            }
        }
        return momentId;
    }
    /**
     * Mark an emotional concern as resolved
     */
    resolveEmotion(momentId, note) {
        this.userEmotions.resolveEmotion(momentId, note);
    }
    /**
     * Mark that we followed up on an emotion
     */
    markFollowedUp(momentId) {
        this.userEmotions.markFollowedUp(momentId);
    }
    // ============================================================================
    // BONDING EVENTS
    // ============================================================================
    /**
     * Record a bonding event (vulnerability, breakthrough, laughter, etc.)
     */
    recordBondEvent(event, context) {
        this.bonding.recordEvent(event, context);
    }
    /**
     * Update concern level based on detected user state
     */
    updateConcern(concernLevel) {
        this.bonding.updateConcern(concernLevel);
    }
    // ============================================================================
    // STATE ACCESS
    // ============================================================================
    /**
     * Get complete unified emotional state
     */
    getState() {
        const userContext = this.userEmotions.buildEmotionalContext();
        const patterns = this.userEmotions.detectPatterns();
        const bondMetrics = this.bonding.getBondMetrics();
        const checkIns = this.userEmotions.getCheckInSuggestions();
        // Determine suggested approach based on combined state
        let suggestedApproach = 'standard';
        if (bondMetrics.concern > 0.5 || userContext.unresolvedConcerns.length > 0) {
            suggestedApproach = 'supportive';
        }
        else if (bondMetrics.protectiveness > 0.5) {
            suggestedApproach = 'protective';
        }
        else if (userContext.celebratableWins.length > 0) {
            suggestedApproach = 'celebratory';
        }
        else if (patterns.some((p) => p.trend === 'improving')) {
            suggestedApproach = 'celebratory';
        }
        else if (checkIns.length > 0) {
            suggestedApproach = 'curious';
        }
        // Determine emotional trend
        let emotionalTrend = 'unknown';
        const topPattern = patterns[0];
        if (topPattern) {
            emotionalTrend = topPattern.trend;
        }
        return {
            user: {
                recentEmotions: userContext.recentEmotions,
                unresolvedConcerns: userContext.unresolvedConcerns,
                celebratableWins: userContext.celebratableWins,
                checkInSuggestions: checkIns,
                patterns,
            },
            bond: {
                warmth: bondMetrics.warmth,
                trust: bondMetrics.trust,
                protectiveness: bondMetrics.protectiveness,
                admiration: bondMetrics.admiration,
                concern: bondMetrics.concern,
                sessionCount: this.bonding.getBond().sessionCount,
                stage: fromLegacyStage(bondMetrics.stage),
            },
            insights: {
                suggestedApproach,
                topCheckIn: checkIns[0] || null,
                bondPhrase: this.bonding.getBondPhrase({ turnCount: 10 })?.phrase || null,
                emotionalTrend,
            },
        };
    }
    /**
     * Get formatted context for LLM prompt
     */
    formatForPrompt(turnCount) {
        const lines = [];
        // User emotion context
        const userPrompt = this.userEmotions.formatForPrompt();
        if (userPrompt) {
            lines.push(userPrompt);
        }
        // Bond-aware greeting/phrase
        const greetingMod = this.bonding.getGreetingModifier();
        if (greetingMod && turnCount <= 2) {
            lines.push(`[WARMTH] ${greetingMod}`);
        }
        // Emotional memory callback
        const memoryCallback = this.bonding.getEmotionalMemoryCallback();
        if (memoryCallback && turnCount > 5) {
            lines.push(`[MEMORY] Consider: "${memoryCallback}"`);
        }
        // Bond phrase
        const bondPhrase = this.bonding.getBondPhrase({ turnCount });
        if (bondPhrase) {
            lines.push(`[BOND] ${bondPhrase.phrase}`);
        }
        return lines.join('\n');
    }
    /**
     * Get relationship stage
     */
    getRelationshipStage() {
        return fromLegacyStage(this.bonding.getRelationshipStage());
    }
    /**
     * Get check-in suggestions
     */
    getCheckInSuggestions() {
        return this.userEmotions.getCheckInSuggestions();
    }
    /**
     * Get emotional patterns
     */
    getPatterns() {
        return this.userEmotions.detectPatterns();
    }
    // ============================================================================
    // PERSISTENCE
    // ============================================================================
    /**
     * Export all emotional memory data for persistence
     */
    export() {
        return {
            userMoments: this.userEmotions.exportMoments(),
            bond: this.bonding.export(),
        };
    }
    /**
     * Import emotional memory data from storage
     */
    import(data) {
        if (data.userMoments) {
            this.userEmotions.importMoments(data.userMoments);
        }
        if (data.bond) {
            this.bonding.import(data.bond);
        }
    }
    /**
     * Get stats for debugging
     */
    getStats() {
        return {
            user: this.userEmotions.getStats(),
            bond: this.bonding.getBondMetrics(),
        };
    }
}
// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================
const unifiedEngines = new Map();
/**
 * Get or create a unified emotional memory for a user
 */
export function getUnifiedEmotionalMemory(config) {
    const key = `${config.userId}:${config.personaId || 'ferni'}`;
    if (!unifiedEngines.has(key)) {
        unifiedEngines.set(key, new UnifiedEmotionalMemory(config));
    }
    return unifiedEngines.get(key);
}
/**
 * Clear unified emotional memory for a user
 */
export function clearUnifiedEmotionalMemory(userId, personaId) {
    const key = `${userId}:${personaId || 'ferni'}`;
    unifiedEngines.delete(key);
    // Clear underlying engines if factories are configured
    if (engineFactories) {
        engineFactories.removeUserEmotionEngine(userId);
        engineFactories.clearBondingEngine(userId);
    }
}
/**
 * Clear all unified emotional memories
 */
export function clearAllUnifiedEmotionalMemories() {
    unifiedEngines.clear();
}
export default {
    getUnifiedEmotionalMemory,
    clearUnifiedEmotionalMemory,
    clearAllUnifiedEmotionalMemories,
    UnifiedEmotionalMemory,
    configureEmotionalMemoryEngines,
    areEmotionalMemoryEnginesConfigured,
};
//# sourceMappingURL=emotional-memory-unified.js.map