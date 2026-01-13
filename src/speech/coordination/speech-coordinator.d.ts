/**
 * Speech Coordinator
 *
 * Intelligent, centralized control for ALL speech output to prevent overlap.
 * Uses adaptive timing based on actual speech patterns, not hardcoded values.
 *
 * DESIGN PRINCIPLES:
 * 1. Single source of truth for "who can speak right now"
 * 2. Priority-based queue (crisis > tool result > response > backchannel)
 * 3. Adaptive timing based on actual playout durations
 * 4. Learned patterns for echo prevention and pacing
 *
 * @module speech/coordination/speech-coordinator
 */
import type { voice } from '@livekit/agents';
/** Speech priority levels (higher = more urgent) */
export declare enum SpeechPriority {
    BACKCHANNEL = 10,// "mm-hmm", "yeah" - lowest, can be skipped
    ACKNOWLEDGMENT = 20,// "Let me check on that" - filler while loading
    RESPONSE = 30,// Normal LLM response
    TOOL_RESULT = 40,// Tool execution result
    CLARIFICATION = 50,// Asking for user input
    INTERRUPT_RECOVERY = 60,// After user interrupted us
    CRISIS = 100
}
/** Speech request to be coordinated */
export interface SpeechRequest {
    /** Unique ID for tracking */
    id: string;
    /** Text to speak */
    text: string;
    /** Priority level */
    priority: SpeechPriority;
    /** Source of the request */
    source: 'tool' | 'llm' | 'backchannel' | 'acknowledgment' | 'direct';
    /** Allow user to interrupt this speech */
    allowInterruptions?: boolean;
    /** Callback when speech starts */
    onStart?: () => void;
    /** Callback when speech ends */
    onEnd?: (interrupted: boolean) => void;
    /** Maximum age in queue before expiring (ms) */
    maxAge?: number;
    /** Timestamp when queued */
    queuedAt: number;
}
/** Coordinator state */
export declare enum CoordinatorState {
    IDLE = "idle",
    SPEAKING = "speaking",
    AWAITING_PLAYOUT = "awaiting_playout",
    COOLDOWN = "cooldown"
}
/** Adaptive timing parameters - learned, not hardcoded */
export interface AdaptiveTiming {
    /** Moving average of speech durations */
    avgSpeechDurationMs: number;
    /** Moving average of echo detection delay */
    avgEchoDelayMs: number;
    /** Learned cooldown after speaking (prevents self-echo) */
    postSpeechCooldownMs: number;
    /** Minimum gap between speeches (learned from natural pacing) */
    naturalPacingGapMs: number;
    /** Sample count for statistics */
    sampleCount: number;
}
/** Statistics for monitoring */
export interface CoordinatorStats {
    totalRequests: number;
    requestsSpoken: number;
    requestsDropped: number;
    requestsExpired: number;
    overlapsPrevented: number;
    avgQueueWaitMs: number;
    avgSpeechDurationMs: number;
}
/**
 * Centralized speech coordinator.
 * All speech output MUST go through this to prevent overlaps.
 */
export declare class SpeechCoordinator {
    private state;
    private queue;
    private currentRequest;
    private session;
    private timing;
    private stats;
    private stateChangeTime;
    private queueWaitTimes;
    private requestIdCounter;
    constructor();
    /**
     * Attach a session to the coordinator.
     *
     * HANDOFF FIX: If coordinator is stuck in SPEAKING state from a previous session,
     * reset to IDLE and process queue. This happens during handoffs when the old
     * session is replaced before its onSpeechEnded callback fires.
     */
    attachSession(session: voice.AgentSession): void;
    /**
     * Detach session (on cleanup)
     */
    detachSession(): void;
    /**
     * Request to speak. Returns immediately - speech is async.
     */
    requestSpeak(request: Omit<SpeechRequest, 'id' | 'queuedAt'>): Promise<{
        accepted: boolean;
        id: string;
        reason?: string;
    }>;
    /**
     * Convenience: Speak a tool result
     */
    speakToolResult(text: string, toolId: string): Promise<{
        accepted: boolean;
        id: string;
    }>;
    /**
     * Convenience: Speak an acknowledgment (for slow operations)
     */
    speakAcknowledgment(text: string): Promise<{
        accepted: boolean;
        id: string;
    }>;
    /**
     * Convenience: Speak a backchannel
     */
    speakBackchannel(text: string): Promise<{
        accepted: boolean;
        id: string;
    }>;
    /**
     * Check if we're currently speaking or in cooldown
     */
    isBusy(): boolean;
    /**
     * Get current state
     */
    getState(): CoordinatorState;
    /**
     * Get adaptive timing parameters
     */
    getAdaptiveTiming(): AdaptiveTiming;
    /**
     * Get echo prevention window for current context.
     *
     * CRITICAL FIX: Now content-aware! Pass userTranscript to enable
     * intelligent detection of legitimate requests vs echoes.
     *
     * @param lastUtteranceDurationMs - Duration of last agent utterance
     * @param userTranscript - The user's transcript (for content-aware detection)
     */
    getEchoWindow(lastUtteranceDurationMs?: number, userTranscript?: string): number;
    /**
     * Record that we detected echo (for learning)
     */
    recordEchoDetection(delayAfterSpeechMs: number): void;
    /**
     * Get statistics
     */
    getStats(): CoordinatorStats;
    /**
     * Notify that speech ended (call from session state handler)
     *
     * @param wasInterrupted - Whether the speech was interrupted
     * @param durationMs - Duration of the speech in milliseconds
     * @param spokenText - Optional: the text that was spoken (for echo comparison)
     */
    onSpeechEnded(wasInterrupted: boolean, durationMs: number, spokenText?: string): void;
    private shouldDrop;
    private enqueue;
    private processQueue;
    private speak;
    private expireOldRequests;
    private transitionTo;
    private getDefaultMaxAge;
}
export declare function getSpeechCoordinator(): SpeechCoordinator;
/**
 * Reset coordinator (for testing)
 */
export declare function resetSpeechCoordinator(): void;
//# sourceMappingURL=speech-coordinator.d.ts.map