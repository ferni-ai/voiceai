/**
 * Context Module - Public API
 *
 * This module manages conversation context for:
 * - LLM prompt injection
 * - Conversation continuity
 * - Persona transitions (with full handoff tracking)
 * - Speech insights integration
 * - Trust systems integration (hooks)
 * - Memory/RAG integration (hooks)
 *
 * @module context
 */
// ============================================================================
// CORE EXPORTS
// ============================================================================
// Main class
export { ContextManager } from './context-manager.class.js';
// Registry functions (per-session singleton pattern)
export { clearAllContextManagers, cleanupExpiredSessions, getContextManager, getContextManagerCount, getRegistryStats, hasContextManager, removeContextManager, startRegistryCleanup, stopRegistryCleanup, touchSession, } from './registry.js';
// ============================================================================
// CONTEXT BUILDERS
// ============================================================================
export { buildContinuityContext, buildEmotionalContext, buildHandoffChainDescription, buildPhaseGuidance, buildRelationshipContext, buildSharedContent, buildTopicContext, getFormattedSharedContent, getInvolvedPersonas, } from './context-builders.js';
// ============================================================================
// SPEECH INSIGHTS
// ============================================================================
export { buildSpeechInsightsContext, formatSpeechInsightsForPrompt } from './speech-insights.js';
// ============================================================================
// INTEGRATIONS (Trust + Memory Wiring)
// ============================================================================
export { getIntegratedContextManager, wireContextIntegrations } from './integrations.js';
// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export { ContextManager as default } from './context-manager.class.js';
//# sourceMappingURL=index.js.map