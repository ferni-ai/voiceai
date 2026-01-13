/**
 * Speech Coordination Module
 *
 * Centralized, intelligent speech output coordination to prevent overlap
 * and ensure human-like conversational flow.
 *
 * KEY COMPONENTS:
 * - SpeechCoordinator: Priority queue + adaptive timing
 * - StreamStateMachine: Clean state transitions for stream processing
 * - PersonaAcknowledgments: Persona-aware, learned acknowledgments
 *
 * @module speech/coordination
 */
export { SpeechCoordinator, getSpeechCoordinator, resetSpeechCoordinator, SpeechPriority, CoordinatorState, type SpeechRequest, type AdaptiveTiming, type CoordinatorStats, } from './speech-coordinator.js';
export { StreamStateMachine, createStreamStateMachine, StreamState, StreamEvent, type StreamContext, type StateMachineConfig, type TransitionResult, } from './stream-state-machine.js';
export { generateAcknowledgment, shouldAcknowledge, getToolCategory, recordAcknowledgmentFeedback, loadUserAcknowledgmentPreferences, DEFAULT_ACKNOWLEDGMENTS, TOOL_CATEGORIES, type AcknowledgmentCategory, type AcknowledgmentContext, type PersonaAcknowledgments, type UserAcknowledgmentPreferences, } from './persona-acknowledgments.js';
export { saveAcknowledgmentPreferences, loadAcknowledgmentPreferences, deleteAcknowledgmentPreferences, getAcknowledgmentPreferences, updateAcknowledgmentPreferences, flushPendingSaves, clearUserPreferencesCache, type StoredAcknowledgmentPreferences, } from './acknowledgment-persistence.js';
export { executeToolWithCoordination, getEstimatedDuration, recordToolDuration, isSlowTool, getToolTimingStats, type ToolExecutionRequest, type ToolExecutionResult, type ToolExecutor, } from './coordinated-tool-executor.js';
export { initializeSpeechCoordination, cleanupSpeechCoordination, isCoordinationInitialized, routeSpeech, routeToolResult, speakToolAcknowledgment, speakBackchannel, recordEchoDetected, getAdaptiveEchoWindow, getCoordinatorStats, getSessionForCoordination, coordinatedSay, type SpeechCoordinationContext, type SpeakOptions, } from './session-integration.js';
export { initializeSanitizerIntegration, cleanupSanitizerIntegration, getSanitizerIntegration, notifyJsonStart, notifyJsonComplete, notifyToolStarted, notifyToolCompleted, notifySentenceBoundary, notifyLeakageDetected, shouldSuppressOutput, getCurrentState, getStateMetrics, processChunkWithStateMachine, type SanitizerStateSync, } from './sanitizer-integration.js';
//# sourceMappingURL=index.d.ts.map