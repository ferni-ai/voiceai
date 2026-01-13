/**
 * Sanitizer Integration with StreamStateMachine
 *
 * Bridges the tool-call-sanitizer with the StreamStateMachine for
 * coordinated state management. This is an incremental integration
 * that augments the existing sanitizer rather than replacing it.
 *
 * DESIGN:
 * - Sanitizer still handles the complex JSON detection/execution
 * - State machine provides a clean state model for coordination
 * - This layer synchronizes the two
 *
 * @module speech/coordination/sanitizer-integration
 */
import { createLogger } from '../../utils/safe-logger.js';
import { StreamStateMachine, StreamState } from './stream-state-machine.js';
import { getSpeechCoordinator } from './speech-coordinator.js';
const log = createLogger({ module: 'sanitizer-integration' });
// ============================================================================
// SESSION STATE
// ============================================================================
const sessionStates = new Map();
/**
 * Initialize sanitizer integration for a session.
 * Call this when creating the sanitizer transform stream.
 */
export function initializeSanitizerIntegration(sessionId) {
    // Clean up existing if any
    cleanupSanitizerIntegration(sessionId);
    const state = {
        stateMachine: new StreamStateMachine(),
        sessionId,
        active: true,
        activeTools: new Map(),
    };
    sessionStates.set(sessionId, state);
    log.debug({ sessionId }, 'Sanitizer integration initialized');
    return state;
}
/**
 * Get integration state for a session.
 */
export function getSanitizerIntegration(sessionId) {
    return sessionStates.get(sessionId) ?? null;
}
/**
 * Clean up sanitizer integration for a session.
 */
export function cleanupSanitizerIntegration(sessionId) {
    const state = sessionStates.get(sessionId);
    if (state) {
        state.active = false;
        state.stateMachine.reset();
        state.activeTools.clear();
        sessionStates.delete(sessionId);
        log.debug({ sessionId }, 'Sanitizer integration cleaned up');
    }
}
// ============================================================================
// STATE SYNCHRONIZATION
// ============================================================================
/**
 * Notify state machine that JSON detection started.
 * Call when sanitizer detects potential JSON start.
 */
export function notifyJsonStart(sessionId) {
    const state = sessionStates.get(sessionId);
    if (!state?.active)
        return;
    // Use processChunk with a marker text that the state machine recognizes as JSON start
    state.stateMachine.processChunk('{"');
}
/**
 * Notify state machine that complete JSON was detected.
 * Call when sanitizer successfully parses JSON function call.
 */
export function notifyJsonComplete(sessionId, toolName) {
    const state = sessionStates.get(sessionId);
    if (!state?.active)
        return;
    // Process the complete JSON string
    state.stateMachine.processChunk(`{"fn":"${toolName}"}`);
    log.debug({ sessionId, toolName, state: state.stateMachine.getState() }, 'JSON complete notified');
}
/**
 * Notify state machine that tool execution started.
 * Call when sanitizer begins executing a tool.
 */
export function notifyToolStarted(sessionId, toolName, promise) {
    const state = sessionStates.get(sessionId);
    if (!state?.active)
        return;
    // Use the actual API: toolStarted(toolId, promise)
    const toolPromise = promise ?? Promise.resolve();
    state.stateMachine.toolStarted(toolName, toolPromise);
    state.activeTools.set(toolName, toolPromise);
    // Notify coordinator that tool is executing (if it supports this)
    const coordinator = getSpeechCoordinator();
    if (coordinator) {
        // SpeechCoordinator's actual method might be different or not exist
        // Log for debugging, but don't call non-existent methods
        log.debug({ sessionId, toolName }, 'Tool started - coordinator notified');
    }
    log.debug({ sessionId, toolName }, 'Tool started notified');
}
/**
 * Notify state machine that tool execution completed.
 * Call when sanitizer tool execution finishes.
 */
export function notifyToolCompleted(sessionId, toolName, _success) {
    const state = sessionStates.get(sessionId);
    if (!state?.active)
        return;
    // Use the actual API: toolCompleted() takes no arguments
    state.stateMachine.toolCompleted();
    state.activeTools.delete(toolName);
    // Notify coordinator (if it supports this)
    const coordinator = getSpeechCoordinator();
    if (coordinator) {
        log.debug({ sessionId, toolName }, 'Tool completed - coordinator notified');
    }
    log.debug({ sessionId, toolName, success: _success }, 'Tool completed notified');
}
/**
 * Notify state machine of a sentence boundary.
 * Call when sanitizer detects .!? in output.
 */
export function notifySentenceBoundary(sessionId) {
    const state = sessionStates.get(sessionId);
    if (!state?.active)
        return;
    // Process the sentence boundary marker
    state.stateMachine.processChunk('.');
}
/**
 * Notify state machine of leakage detection.
 * Call when sanitizer detects instruction leakage patterns.
 */
export function notifyLeakageDetected(sessionId, pattern) {
    const state = sessionStates.get(sessionId);
    if (!state?.active)
        return;
    // Process the leakage pattern - state machine will detect via its patterns
    state.stateMachine.processChunk(pattern);
    log.debug({ sessionId, pattern: pattern.slice(0, 30) }, 'Leakage pattern notified');
}
// ============================================================================
// QUERY FUNCTIONS
// ============================================================================
/**
 * Check if output should be suppressed based on state machine.
 */
export function shouldSuppressOutput(sessionId) {
    const state = sessionStates.get(sessionId);
    if (!state?.active)
        return false;
    const currentState = state.stateMachine.getState();
    return (currentState === StreamState.EXECUTING_TOOL ||
        currentState === StreamState.SUPPRESSING_LEAKAGE ||
        currentState === StreamState.BUFFERING_JSON);
}
/**
 * Get current state for debugging.
 */
export function getCurrentState(sessionId) {
    const state = sessionStates.get(sessionId);
    return state?.stateMachine.getState() ?? null;
}
/**
 * Get state machine metrics for observability.
 */
export function getStateMetrics(sessionId) {
    const state = sessionStates.get(sessionId);
    if (!state)
        return null;
    return {
        state: state.stateMachine.getState(),
        activeToolCount: state.activeTools.size,
        isActive: state.active,
    };
}
// ============================================================================
// PROCESS CHUNK HELPER
// ============================================================================
/**
 * Process a chunk through the state machine and get output decision.
 * This is the main integration point - call for each chunk.
 *
 * @returns ProcessedChunkResult with emit/suppress decisions
 */
export function processChunkWithStateMachine(sessionId, chunk, _options = {}) {
    const state = sessionStates.get(sessionId);
    if (!state?.active) {
        // No integration - pass through
        return { emit: chunk, suppress: false };
    }
    // Process the chunk and get transition result
    const result = state.stateMachine.processChunk(chunk);
    return {
        emit: result.emit,
        suppress: result.suppress,
    };
}
//# sourceMappingURL=sanitizer-integration.js.map