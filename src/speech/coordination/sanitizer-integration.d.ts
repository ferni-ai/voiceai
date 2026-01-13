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
import { StreamStateMachine, StreamState } from './stream-state-machine.js';
export interface SanitizerStateSync {
    /** Current state machine */
    stateMachine: StreamStateMachine;
    /** Session ID for coordinator access */
    sessionId: string;
    /** Whether integration is active */
    active: boolean;
    /** Track active tool executions */
    activeTools: Map<string, Promise<unknown>>;
}
/** Result from processing a chunk */
export interface ProcessedChunkResult {
    /** Text to emit (if any) */
    emit: string | null;
    /** Whether output should be suppressed */
    suppress: boolean;
}
/**
 * Initialize sanitizer integration for a session.
 * Call this when creating the sanitizer transform stream.
 */
export declare function initializeSanitizerIntegration(sessionId: string): SanitizerStateSync;
/**
 * Get integration state for a session.
 */
export declare function getSanitizerIntegration(sessionId: string): SanitizerStateSync | null;
/**
 * Clean up sanitizer integration for a session.
 */
export declare function cleanupSanitizerIntegration(sessionId: string): void;
/**
 * Notify state machine that JSON detection started.
 * Call when sanitizer detects potential JSON start.
 */
export declare function notifyJsonStart(sessionId: string): void;
/**
 * Notify state machine that complete JSON was detected.
 * Call when sanitizer successfully parses JSON function call.
 */
export declare function notifyJsonComplete(sessionId: string, toolName: string): void;
/**
 * Notify state machine that tool execution started.
 * Call when sanitizer begins executing a tool.
 */
export declare function notifyToolStarted(sessionId: string, toolName: string, promise?: Promise<unknown>): void;
/**
 * Notify state machine that tool execution completed.
 * Call when sanitizer tool execution finishes.
 */
export declare function notifyToolCompleted(sessionId: string, toolName: string, _success: boolean): void;
/**
 * Notify state machine of a sentence boundary.
 * Call when sanitizer detects .!? in output.
 */
export declare function notifySentenceBoundary(sessionId: string): void;
/**
 * Notify state machine of leakage detection.
 * Call when sanitizer detects instruction leakage patterns.
 */
export declare function notifyLeakageDetected(sessionId: string, pattern: string): void;
/**
 * Check if output should be suppressed based on state machine.
 */
export declare function shouldSuppressOutput(sessionId: string): boolean;
/**
 * Get current state for debugging.
 */
export declare function getCurrentState(sessionId: string): StreamState | null;
/**
 * Get state machine metrics for observability.
 */
export declare function getStateMetrics(sessionId: string): {
    state: StreamState;
    activeToolCount: number;
    isActive: boolean;
} | null;
/**
 * Process a chunk through the state machine and get output decision.
 * This is the main integration point - call for each chunk.
 *
 * @returns ProcessedChunkResult with emit/suppress decisions
 */
export declare function processChunkWithStateMachine(sessionId: string, chunk: string, _options?: {
    isJsonStart?: boolean;
    isJsonComplete?: boolean;
    isSentenceBoundary?: boolean;
    isLeakagePattern?: boolean;
}): ProcessedChunkResult | null;
//# sourceMappingURL=sanitizer-integration.d.ts.map