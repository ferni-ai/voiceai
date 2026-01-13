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
export type * from './types.js';
export { captureHandoffContext as captureHandoffContextNew, clearHandoffHistory as clearHandoffHistoryNew, executeHandoff, getCurrentAgent as getCurrentAgentNew, getHandoffContext as getHandoffContextNew, getHandoffHistory as getHandoffHistoryNew, getLastHandoff as getLastHandoffNew, isHandoffAllowed as isHandoffAllowedNew, isSameAgent as isSameAgentNew, resetHandoffState as resetHandoffStateNew, setCurrentAgent as setCurrentAgentNew, type ExecuteHandoffOptions, type HandoffResult, } from './executor.js';
export { buildHandoffTools, clearHandoffToolCache, createHandoffTools as createHandoffToolDefinitions, findHandoffTarget, getAgentNameFromToolName, getHandoffTool, getHandoffToolForAgent, getHandoffToolNames, getHandoffToolsForAgent, isHandoffToolName, type BuildHandoffToolsOptions, type HandoffToolDefinition, type HandoffToolSet, } from './handoff-factory.js';
export { shouldHandoffToAlex, shouldHandoffToFerni, shouldHandoffToJordan, shouldHandoffToMaya, shouldHandoffToNayan, shouldHandoffToPeter, } from './detection.js';
export { cameoUnlockEvents, captureHandoffContext, clearHandoffHistory, formatHandoffContextForAgent, getAgentContext, getAgentContextAsync, getAgentDisplayName, getCurrentAgent, getHandoffAnalytics, getHandoffContext, getHandoffHistory, getLastEmotionAnalysis, getLastHandoff, getLastTopicForPersona, getLastTopicsPerPersona, getLastUserMessage, getMeetingCount, getMeetingCounts, getMetPersonas, getTeamForHandoff, handoffEvents, hasMetPersona, incrementMeetingCount, initializeHandoffContext, isCurrentAgent, isHandoffAllowed, isSameAgent, logHandoffAnalytics, markPersonaAsMet, normalizeAgentId, recordHandoff, resetHandoffState, resetMetPersonas, setCurrentAgent, setLastTopicForPersona, suggestHandoff, // CAMEO UNLOCK: For team member introductions
toCanonicalId, updateUserContextForHandoff, } from './state.js';
export { createHandoffTools } from './handoff-factory.js';
export { createHandoffEvent } from './types.js';
export type { HandoffAnalytics, HandoffEventData } from './types.js';
/**
 * Session-scoped state management for multi-session isolation.
 * Use these functions when you have access to a sessionId.
 *
 * @example
 * import { getSessionState } from './handoff/index.js';
 * const state = getSessionState(sessionId);
 * const agent = state.currentAgent;
 */
export { captureHandoffContext as captureHandoffContextSession, exportForPersistence, getActiveSessionIds, getCurrentAgent as getCurrentAgentSession, getLastTopic as getLastTopicSession, getMeetingCount as getMeetingCountSession, getSessionAnalytics, getSessionState, hasMetPersona as hasMetPersonaSession, hasSessionState, incrementMeetingCount as incrementMeetingCountSession, initializeFromPersistent, isHandoffAllowed as isHandoffAllowedSession, isSameAgent as isSameAgentSession, markPersonaAsMet as markPersonaAsMetSession, recordHandoff as recordHandoffSession, removeSessionState, resetSessionState, setCurrentAgent as setCurrentAgentSession, setLastTopic as setLastTopicSession, toCanonicalId as toCanonicalIdSession, updateUserContext as updateUserContextSession, type HandoffSessionState, } from './session-state.js';
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
export { resolveVoiceId, resolveVoiceIdOrThrow, canResolveVoiceId, getAllVoiceIds, type VoiceIdResolutionResult, type VoiceIdResolved, type VoiceIdResolutionError, type VoiceIdSource, type VoiceIdInput, } from './voice-id-resolver.js';
export { validateHandoffPreconditions, quickValidate, getValidationErrorMessage, areErrorsRecoverable, type ValidationResult, type ValidationSuccess, type ValidationFailure, type ValidationError, type ValidationErrorCode, type ValidationOptions, } from './pre-validation.js';
export { HandoffTransaction, createTransaction, createStateStep, createVoiceSwitchStep, createInstructionsStep, createNotificationStep, type TransactionStep, type TransactionState, type TransactionResult, type StepResult, } from './handoff-transaction.js';
export { EventSequencer, createEventSequencer, SequenceGenerator, sequenceGenerator, EVENT_ORDER, TERMINAL_EVENTS, getExpectedPreviousEvent, isTerminalEvent, type SequencedEvent, type HandoffEventType, type EventHandler, type SequencerState, } from './event-sequencer.js';
export { HandoffStateManager, getHandoffManager, hasHandoffManager, removeHandoffManager, type HandoffStateSnapshot, type StateChangeType, type StateChangeEvent, type HandoffRecord, } from './handoff-state-manager.js';
export { HandoffCoordinator, createHandoffCoordinator, type HandoffRequest, type HandoffResult as CoordinatorHandoffResult, type CoordinatorConfig, type VoiceSwitchCallback, type LLMUpdateCallback, type UINotifyCallback, type BanterContext, type BeforeVoiceSwitchCallback, type AfterVoiceSwitchCallback, } from './handoff-coordinator.js';
//# sourceMappingURL=index.d.ts.map