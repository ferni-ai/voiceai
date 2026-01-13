/**
 * Handoff Module
 *
 * Agent handoff system for transitioning between team members.
 *
 * ## Recommended: Unified Handoff Module
 *
 * For state management, use the new unified module:
 * ```typescript
 * import {
 *   getCurrentAgent,
 *   startHandoff,
 *   completeHandoff,
 *   isHandoffAllowed,
 *   handoffEvents,
 * } from '../../handoff/index.js';
 * ```
 *
 * ## This Module: Specialized Functionality
 *
 * This module provides specialized handoff functionality:
 * - Tool building: `buildHandoffTools()`, `getHandoffToolsForAgent()`
 * - Detection: `shouldHandoffToAlex()`, `shouldHandoffToMaya()`, etc.
 * - Coordination: `HandoffCoordinator`, `HandoffTransaction`
 * - Validation: `validateHandoffPreconditions()`, `quickValidate()`
 *
 * @see src/handoff/index.ts for unified state management
 */
// =============================================================================
// NEW AGENT-AGNOSTIC SYSTEM
// =============================================================================
// Executor - Generic handoff execution
// NOTE: handoffEvents is no longer exported from executor.js - it's imported from state.js
// This ensures a single shared EventEmitter instance across the entire handoff system
export { captureHandoffContext as captureHandoffContextNew, clearHandoffHistory as clearHandoffHistoryNew, executeHandoff, 
// handoffEvents removed - use the one from state.js exports below
getCurrentAgent as getCurrentAgentNew, getHandoffContext as getHandoffContextNew, getHandoffHistory as getHandoffHistoryNew, getLastHandoff as getLastHandoffNew, isHandoffAllowed as isHandoffAllowedNew, isSameAgent as isSameAgentNew, resetHandoffState as resetHandoffStateNew, setCurrentAgent as setCurrentAgentNew, } from './executor.js';
// Factory - Dynamic tool generation
export { buildHandoffTools, clearHandoffToolCache, createHandoffTools as createHandoffToolDefinitions, findHandoffTarget, getAgentNameFromToolName, getHandoffTool, getHandoffToolForAgent, getHandoffToolNames, getHandoffToolsForAgent, isHandoffToolName, } from './handoff-factory.js';
// =============================================================================
// NOTE: Phrase exports have been removed
// Agent-specific phrases are now stored in persona manifests
// =============================================================================
// Detection exports
export { shouldHandoffToAlex, shouldHandoffToFerni, shouldHandoffToJordan, shouldHandoffToMaya, shouldHandoffToNayan, shouldHandoffToPeter, } from './detection.js';
// State management exports (all from state.js - no more legacy re-exports!)
export { cameoUnlockEvents, 
// Context
captureHandoffContext, clearHandoffHistory, formatHandoffContextForAgent, getAgentContext, getAgentContextAsync, getAgentDisplayName, 
// Current agent state
getCurrentAgent, 
// Analytics
getHandoffAnalytics, getHandoffContext, getHandoffHistory, getLastEmotionAnalysis, getLastHandoff, getLastTopicForPersona, getLastTopicsPerPersona, getLastUserMessage, getMeetingCount, getMeetingCounts, getMetPersonas, getTeamForHandoff, 
// Event emitters
handoffEvents, 
// Met personas tracking
hasMetPersona, incrementMeetingCount, initializeHandoffContext, isCurrentAgent, isHandoffAllowed, isSameAgent, logHandoffAnalytics, markPersonaAsMet, normalizeAgentId, 
// Handoff history
recordHandoff, resetHandoffState, resetMetPersonas, setCurrentAgent, setLastTopicForPersona, 
// Handoff suggestions
suggestHandoff, // CAMEO UNLOCK: For team member introductions
// ID utilities
toCanonicalId, 
// User context functions
updateUserContextForHandoff, } from './state.js';
// Tool creation (from factory)
export { createHandoffTools } from './handoff-factory.js';
// Re-export types and utilities
export { createHandoffEvent } from './types.js';
// =============================================================================
// SESSION-SCOPED STATE (NEW - Preferred for new code)
// =============================================================================
/**
 * Session-scoped state management for multi-session isolation.
 * Use these functions when you have access to a sessionId.
 *
 * @example
 * import { getSessionState } from './handoff/index.js';
 * const state = getSessionState(sessionId);
 * const agent = state.currentAgent;
 */
export { captureHandoffContext as captureHandoffContextSession, exportForPersistence, getActiveSessionIds, getCurrentAgent as getCurrentAgentSession, getLastTopic as getLastTopicSession, getMeetingCount as getMeetingCountSession, getSessionAnalytics, 
// Session state management
getSessionState, hasMetPersona as hasMetPersonaSession, hasSessionState, incrementMeetingCount as incrementMeetingCountSession, initializeFromPersistent, isHandoffAllowed as isHandoffAllowedSession, isSameAgent as isSameAgentSession, markPersonaAsMet as markPersonaAsMetSession, recordHandoff as recordHandoffSession, removeSessionState, resetSessionState, setCurrentAgent as setCurrentAgentSession, setLastTopic as setLastTopicSession, 
// Session-scoped operations
toCanonicalId as toCanonicalIdSession, updateUserContext as updateUserContextSession, } from './session-state.js';
// =============================================================================
// NEW UNIFIED HANDOFF SYSTEM (v2 - December 2024)
// =============================================================================
/**
 * New unified handoff system that addresses the "massive transfer issues":
 * - Voice ID resolution: Single source of truth
 * - Pre-validation: Fail fast before starting
 * - Transaction pattern: Atomic commit/rollback
 * - Event sequencing: Guaranteed order
 * - State management: Session-scoped only
 * - Coordinator: Single orchestration point
 *
 * @example
 * import { HandoffCoordinator, validateHandoffPreconditions } from './handoff/index.js';
 *
 * // Create coordinator for session
 * const coordinator = new HandoffCoordinator({
 *   sessionId,
 *   // IMPORTANT: Use personaId (not voiceUUID) for VoiceManager.switchVoice()!
 *   onVoiceSwitch: async (voiceUUID, personaId) => voiceManager.switchVoice(personaId),
 *   onLLMUpdate: async (personaId, instructions) => agent.setPersona(personaId, instructions),
 *   onUINotify: (event) => sendDataMessage(event),
 * });
 *
 * // Execute handoff
 * const result = await coordinator.execute({
 *   targetAgent: 'peter-john',
 *   reason: 'User wants research help',
 *   userProfile,
 * });
 */
// Voice ID Resolution
export { resolveVoiceId, resolveVoiceIdOrThrow, canResolveVoiceId, getAllVoiceIds, } from './voice-id-resolver.js';
// Pre-Handoff Validation
export { validateHandoffPreconditions, quickValidate, getValidationErrorMessage, areErrorsRecoverable, } from './pre-validation.js';
// Transaction Pattern
export { HandoffTransaction, createTransaction, createStateStep, createVoiceSwitchStep, createInstructionsStep, createNotificationStep, } from './handoff-transaction.js';
// Event Sequencing
export { EventSequencer, createEventSequencer, SequenceGenerator, sequenceGenerator, EVENT_ORDER, TERMINAL_EVENTS, getExpectedPreviousEvent, isTerminalEvent, } from './event-sequencer.js';
// Unified State Management (replaces global state.ts)
export { HandoffStateManager, getHandoffManager, hasHandoffManager, removeHandoffManager, } from './handoff-state-manager.js';
// Handoff Coordinator (single orchestration point)
export { HandoffCoordinator, createHandoffCoordinator, } from './handoff-coordinator.js';
//# sourceMappingURL=index.js.map