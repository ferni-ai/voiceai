/**
 * Speech Coordinator - Session Integration
 *
 * Wires the SpeechCoordinator into the voice agent session lifecycle.
 * This is the bridge between our coordination system and the actual voice agent.
 *
 * USAGE:
 * 1. Call initializeSpeechCoordination() after session is created
 * 2. Call cleanupSpeechCoordination() on session cleanup
 * 3. Use routeSpeech() instead of direct session.say() calls
 *
 * @module speech/coordination/session-integration
 */
import type { voice } from '@livekit/agents';
import { SpeechPriority, type SpeechRequest } from './speech-coordinator.js';
/** Integration context */
export interface SpeechCoordinationContext {
    session: voice.AgentSession;
    sessionId: string;
    personaId: string;
    userId?: string;
}
/** Speech request options (simplified for callers) */
export interface SpeakOptions {
    /** Priority override (defaults based on source) */
    priority?: SpeechPriority;
    /** Allow user to interrupt */
    allowInterruptions?: boolean;
    /** Source of the speech request */
    source?: SpeechRequest['source'];
    /** Tool ID if this is a tool result */
    toolId?: string;
    /** Callback when speech starts */
    onStart?: () => void;
    /** Callback when speech ends */
    onEnd?: (interrupted: boolean) => void;
}
/**
 * Initialize speech coordination for a session.
 * MUST be called after session is created, before any speech.
 */
export declare function initializeSpeechCoordination(ctx: SpeechCoordinationContext): void;
/**
 * Cleanup speech coordination for a session.
 * MUST be called on session cleanup to prevent memory leaks.
 */
export declare function cleanupSpeechCoordination(sessionId: string): void;
/**
 * Check if speech coordination is initialized for a session
 */
export declare function isCoordinationInitialized(sessionId: string): boolean;
/**
 * Route speech through the coordinator.
 * This is the main entry point for all speech output.
 *
 * Use this INSTEAD of direct session.say() calls.
 */
export declare function routeSpeech(sessionId: string, text: string, options?: SpeakOptions): Promise<{
    accepted: boolean;
    id: string;
    reason?: string;
}>;
/**
 * Route a tool result through the coordinator with optional acknowledgment.
 */
export declare function routeToolResult(sessionId: string, toolId: string, resultText: string, options?: {
    /** Whether tool already took a long time (skip ack if so) */
    alreadyAcknowledged?: boolean;
    /** Speak the result directly without LLM processing */
    speakDirectly?: boolean;
    /** Actual execution time for learning */
    executionTimeMs?: number;
}): Promise<{
    accepted: boolean;
    id: string;
}>;
/**
 * Speak an acknowledgment before a slow tool runs.
 * Uses persona-aware, learned acknowledgments.
 */
export declare function speakToolAcknowledgment(sessionId: string, toolId: string): Promise<{
    accepted: boolean;
    id: string;
    skipped?: boolean;
}>;
/**
 * Speak a backchannel (mm-hmm, yeah, etc.)
 * Low priority - can be dropped if higher priority speech pending.
 */
export declare function speakBackchannel(sessionId: string, text: string): Promise<{
    accepted: boolean;
    id: string;
}>;
/**
 * Record an echo detection event for adaptive learning.
 * Call this when we detect agent audio being picked up as user speech.
 */
export declare function recordEchoDetected(sessionId: string, delayAfterSpeechMs: number): void;
/**
 * Get the adaptive echo prevention window for the current session.
 *
 * CRITICAL FIX: Now accepts userTranscript for content-aware echo detection.
 * Pass the user's transcript to enable intelligent detection of legitimate
 * requests vs echoes (e.g., "Could you check the news?" should NOT be blocked).
 *
 * @param lastUtteranceDurationMs - Duration of last agent utterance in ms
 * @param userTranscript - Optional: the user's transcript for content-aware detection
 */
export declare function getAdaptiveEchoWindow(lastUtteranceDurationMs?: number, userTranscript?: string): number;
/**
 * Get coordinator stats for monitoring
 */
export declare function getCoordinatorStats(): {
    timing: import("./speech-coordinator.js").AdaptiveTiming;
    totalRequests: number;
    requestsSpoken: number;
    requestsDropped: number;
    requestsExpired: number;
    overlapsPrevented: number;
    avgQueueWaitMs: number;
    avgSpeechDurationMs: number;
};
/**
 * Get the session for a coordinated session.
 * Use this only for operations that can't go through the coordinator.
 * Prefer routeSpeech() for all speech output.
 */
export declare function getSessionForCoordination(sessionId: string): voice.AgentSession | null;
/**
 * Wrapper for session.say() that routes through coordinator.
 * Drop-in replacement for direct session.say() calls.
 *
 * @deprecated Prefer routeSpeech() for new code
 */
export declare function coordinatedSay(sessionId: string, text: string, options?: {
    allowInterruptions?: boolean;
}): void;
//# sourceMappingURL=session-integration.d.ts.map