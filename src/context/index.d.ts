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
export { ContextManager } from './context-manager.class.js';
export { clearAllContextManagers, cleanupExpiredSessions, getContextManager, getContextManagerCount, getRegistryStats, hasContextManager, removeContextManager, startRegistryCleanup, stopRegistryCleanup, touchSession, } from './registry.js';
export { buildContinuityContext, buildEmotionalContext, buildHandoffChainDescription, buildPhaseGuidance, buildRelationshipContext, buildSharedContent, buildTopicContext, getFormattedSharedContent, getInvolvedPersonas, } from './context-builders.js';
export type { InjectionOptions, SharedContentOptions } from './context-builders.js';
export { buildSpeechInsightsContext, formatSpeechInsightsForPrompt } from './speech-insights.js';
export type { BuildSpeechInsightsOptions } from './speech-insights.js';
export type { ContextOptions, HandoffRecord, MemoryEntry, MemoryRetrievalResult, PromptContext, SpeechInsightsContext, TrustContextResult, ConversationState, EmotionResult, PhaseGuidance, } from './types.js';
export { getIntegratedContextManager, wireContextIntegrations } from './integrations.js';
export type { ContextIntegrationOptions } from './integrations.js';
export { ContextManager as default } from './context-manager.class.js';
//# sourceMappingURL=index.d.ts.map