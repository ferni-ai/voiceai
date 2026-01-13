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
// Core coordinator
export { SpeechCoordinator, getSpeechCoordinator, resetSpeechCoordinator, SpeechPriority, CoordinatorState, } from './speech-coordinator.js';
// Stream state machine
export { StreamStateMachine, createStreamStateMachine, StreamState, StreamEvent, } from './stream-state-machine.js';
// Persona acknowledgments
export { generateAcknowledgment, shouldAcknowledge, getToolCategory, recordAcknowledgmentFeedback, loadUserAcknowledgmentPreferences, DEFAULT_ACKNOWLEDGMENTS, TOOL_CATEGORIES, } from './persona-acknowledgments.js';
// Acknowledgment persistence
export { saveAcknowledgmentPreferences, loadAcknowledgmentPreferences, deleteAcknowledgmentPreferences, getAcknowledgmentPreferences, updateAcknowledgmentPreferences, flushPendingSaves, clearUserPreferencesCache, } from './acknowledgment-persistence.js';
// Coordinated tool execution
export { executeToolWithCoordination, getEstimatedDuration, recordToolDuration, isSlowTool, getToolTimingStats, } from './coordinated-tool-executor.js';
// Session integration (main entry point for voice agents)
export { initializeSpeechCoordination, cleanupSpeechCoordination, isCoordinationInitialized, routeSpeech, routeToolResult, speakToolAcknowledgment, speakBackchannel, recordEchoDetected, getAdaptiveEchoWindow, getCoordinatorStats, getSessionForCoordination, coordinatedSay, } from './session-integration.js';
// Sanitizer integration (for tool-call-sanitizer)
export { initializeSanitizerIntegration, cleanupSanitizerIntegration, getSanitizerIntegration, notifyJsonStart, notifyJsonComplete, notifyToolStarted, notifyToolCompleted, notifySentenceBoundary, notifyLeakageDetected, shouldSuppressOutput, getCurrentState, getStateMetrics, processChunkWithStateMachine, } from './sanitizer-integration.js';
//# sourceMappingURL=index.js.map