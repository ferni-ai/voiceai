/**
 * Humanizer Integration
 *
 * Provides a bridge between the new ConversationOrchestrator and the
 * existing ConversationHumanizer API. This allows gradual migration
 * while maintaining backward compatibility.
 *
 * Usage:
 *   import { createOrchestratedHumanizer } from './orchestrator/humanizer-integration.js';
 *
 *   const humanizer = createOrchestratedHumanizer(sessionId, personaId);
 *   const result = await humanizer.humanizeResponseAsync(response, context);
 *
 * @module @ferni/conversation/orchestrator/humanizer-integration
 */
import { createLogger } from '../../utils/safe-logger.js';
import { orchestratorConfig } from './config-adapter.js';
import { getConversationOrchestrator, resetConversationOrchestrator, } from './conversation-orchestrator.js';
import { logMetricsSummary } from './metrics.js';
const log = createLogger({ module: 'HumanizerIntegration' });
// ============================================================================
// ORCHESTRATED HUMANIZER FACTORY
// ============================================================================
/**
 * Create an orchestrated humanizer that uses the new ConversationOrchestrator
 * but provides the same API as ConversationHumanizer.
 *
 * This enables gradual migration by allowing you to swap implementations.
 */
export function createOrchestratedHumanizer(sessionId, personaId, userId) {
    // Get orchestrator
    const orchestrator = getConversationOrchestrator(sessionId);
    orchestrator.setPersona(personaId);
    // Apply recommended preset for persona
    const recommendedPreset = orchestratorConfig.getRecommendedPreset(personaId);
    orchestratorConfig.applyPreset(recommendedPreset);
    // Track context
    let currentUserId = userId;
    const humanizer = {
        async humanizeResponseAsync(response, context) {
            // Map legacy context to orchestrator input
            const input = {
                personaId: context.personaId,
                sessionId: context.sessionId || sessionId,
                userId: context.userId || currentUserId,
                turnNumber: context.turnNumber,
                sessionMinutes: orchestrator.getSessionMinutes(),
                sessionCount: context.sessionCount,
                userMessage: context.userMessage,
                userEmotion: context.userEmotion,
                topic: context.topic,
                rawResponse: context.rawResponse || response,
                wasPersonalSharing: context.wasPersonalSharing,
                isSeriousContext: context.isSeriousContext,
                relationshipStage: context.relationshipStage,
                sessionData: context.sessionData,
            };
            // Run orchestration
            const result = await orchestrator.orchestrate(input);
            // Map orchestrator output to legacy response format
            return mapToLegacyResponse(result);
        },
        setPersona(newPersonaId) {
            orchestrator.setPersona(newPersonaId);
            const preset = orchestratorConfig.getRecommendedPreset(newPersonaId);
            orchestratorConfig.applyPreset(preset);
        },
        setSessionContext(newSessionId, newUserId) {
            currentUserId = newUserId;
            // Note: sessionId is fixed for this orchestrator instance
            log.debug({ sessionId: newSessionId, userId: newUserId }, 'Session context updated');
        },
        getSessionMinutes() {
            return orchestrator.getSessionMinutes();
        },
        reset() {
            resetConversationOrchestrator(sessionId);
            orchestratorConfig.reset();
        },
        logMetrics() {
            logMetricsSummary(sessionId);
        },
        getOrchestrator() {
            return orchestrator;
        },
    };
    return humanizer;
}
// ============================================================================
// RESPONSE MAPPING
// ============================================================================
/**
 * Map orchestrator output to legacy HumanizedResponse format
 */
function mapToLegacyResponse(output) {
    // Determine pacing
    const pacing = output.pacing;
    // Build legacy response
    const response = {
        text: output.text,
        ssml: output.ssml,
        appliedFeatures: output.appliedFeatures,
        pacing,
        // Emotional guidance - pass through as-is (already typed correctly)
        emotionalGuidance: output.emotionalGuidance,
        // Memory callback
        memoryCallback: output.memoryCallback,
        // Follow-up question
        followUpQuestion: output.followUpQuestion,
        // Orchestrator metadata
        orchestratorMetadata: {
            timing: output.metadata.timing,
            confidence: output.metadata.confidence,
            appliedFeatures: output.appliedFeatures,
            skippedFeatures: output.metadata.debug?.humanizationResult.skippedFeatures,
        },
    };
    return response;
}
// ============================================================================
// DROP-IN REPLACEMENT HELPER
// ============================================================================
/**
 * Create a humanizer that can be used as a drop-in replacement.
 * Automatically determines whether to use orchestrator based on feature flag.
 */
export function createHumanizer(sessionId, personaId, userId, options) {
    const useOrchestrator = options?.useOrchestrator ?? true;
    if (useOrchestrator) {
        const humanizer = createOrchestratedHumanizer(sessionId, personaId, userId);
        if (options?.preset) {
            orchestratorConfig.applyPreset(options.preset);
        }
        return humanizer;
    }
    // Could return legacy humanizer here for A/B testing
    // For now, always return orchestrated version
    return createOrchestratedHumanizer(sessionId, personaId, userId);
}
// ============================================================================
// SINGLETON HELPERS
// ============================================================================
const humanizers = new Map();
/**
 * Get or create an orchestrated humanizer (singleton per session)
 */
export function getOrchestratedHumanizer(sessionId, personaId, userId) {
    const key = `${sessionId}:${personaId}`;
    if (!humanizers.has(key)) {
        humanizers.set(key, createOrchestratedHumanizer(sessionId, personaId, userId));
    }
    return humanizers.get(key);
}
/**
 * Reset orchestrated humanizer for a session
 */
export function resetOrchestratedHumanizer(sessionId, personaId) {
    if (personaId) {
        const key = `${sessionId}:${personaId}`;
        const humanizer = humanizers.get(key);
        if (humanizer) {
            humanizer.reset();
            humanizers.delete(key);
        }
    }
    else {
        // Reset all humanizers for this session
        for (const [key, humanizer] of humanizers) {
            if (key.startsWith(`${sessionId}:`)) {
                humanizer.reset();
                humanizers.delete(key);
            }
        }
    }
}
/**
 * Reset all orchestrated humanizers
 */
export function resetAllOrchestratedHumanizers() {
    for (const humanizer of humanizers.values()) {
        humanizer.reset();
    }
    humanizers.clear();
}
//# sourceMappingURL=humanizer-integration.js.map