/**
 * Realtime Model Preemptive Generation Patch
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * LiveKit's built-in preemptiveGeneration ONLY works with separate STT + LLM pipelines.
 * When using Google's RealtimeModel (Gemini 2.0 speech-to-speech), it's disabled because:
 *
 *   `if (!(this.llm instanceof LLM)) return;`
 *
 * This patch provides preemptive capabilities for RealtimeModel by:
 * 1. Intercepting partial transcripts from the model
 * 2. Running intent prediction and pattern caching
 * 3. Pre-warming context and anticipating likely responses
 * 4. Optionally, starting parallel LLM calls for anticipated intents
 *
 * @module RealtimePreemptivePatch
 */
import { type AnticipatedResponse } from './response-anticipation.js';
import type { ProsodyFeatures } from './audio-prosody.js';
/**
 * Partial transcript event from RealtimeModel
 */
export interface PartialTranscriptEvent {
    itemId: string;
    transcript: string;
    isFinal: boolean;
}
/**
 * Preemptive action to take
 */
export interface PreemptiveAction {
    /** Type of action */
    type: 'cache_hit' | 'context_prepared' | 'anticipation_ready' | 'none';
    /** Anticipated response if available */
    anticipation: AnticipatedResponse | null;
    /** Context hint for LLM */
    contextHint: string | null;
    /** Estimated latency savings (ms) */
    estimatedSavingsMs: number;
    /** Reason for action */
    reason: string;
}
/**
 * Callback for when preemptive action is ready
 */
export type PreemptiveCallback = (action: PreemptiveAction) => void;
export declare class RealtimePreemptiveProcessor {
    private sessionId;
    private lastProcessedTranscript;
    private lastProcessedTime;
    private recentUserMessages;
    private emotionalState;
    private currentTopic;
    private callback;
    private enabled;
    constructor(sessionId: string);
    /**
     * Set callback for preemptive actions
     */
    onPreemptiveAction(callback: PreemptiveCallback): void;
    /**
     * Enable/disable processing
     */
    setEnabled(enabled: boolean): void;
    /**
     * Process partial transcript event
     * Call this when RealtimeModel emits `input_audio_transcription_completed`
     */
    processPartialTranscript(event: PartialTranscriptEvent): PreemptiveAction;
    /**
     * Process with prosody for enhanced turn prediction
     */
    processWithProsody(event: PartialTranscriptEvent, prosody: ProsodyFeatures, silenceDuration: number): PreemptiveAction;
    /**
     * Update context for better anticipation
     */
    updateContext(context: {
        emotionalState?: string;
        currentTopic?: string;
        recentAgentText?: string;
    }): void;
    /**
     * Get the complete response for a cache hit
     */
    getCompleteResponse(): {
        response: string;
        ssml: string;
    } | null;
    /**
     * Report accuracy for learning
     */
    reportAccuracy(wasCorrect: boolean): void;
    /**
     * Get statistics
     */
    getStats(): {
        hitRate: number;
        totalHits: number;
        totalMisses: number;
    };
    /**
     * Reset processor state
     */
    reset(): void;
}
/**
 * Hook into RealtimeModel transcription events
 *
 * Usage in voice-agent.ts:
 * ```typescript
 * import { hookRealtimePreemptive } from '../speech/realtime-preemptive-patch.js';
 *
 * // In session setup, after creating RealtimeModel:
 * const preemptiveProcessor = hookRealtimePreemptive(
 *   sessionId,
 *   session,
 *   (action) => {
 *     if (action.type === 'cache_hit' && action.anticipation) {
 *       // Option 1: Use cached response directly (fastest)
 *       const { response, ssml } = preemptiveProcessor.getCompleteResponse()!;
 *       session.say(ssml, { allowInterruptions: true });
 *
 *       // Option 2: Just log for now, let normal flow continue
 *       diag.state('⚡ Cache hit ready', { intent: action.anticipation.intent });
 *     } else if (action.contextHint) {
 *       // Prepend context hint to LLM (would need custom integration)
 *       diag.state('⚡ Context prepared', { hint: action.contextHint });
 *     }
 *   }
 * );
 * ```
 */
export declare function hookRealtimePreemptive(sessionId: string, session: unknown, // voice.AgentSession - avoid importing
callback?: PreemptiveCallback): RealtimePreemptiveProcessor;
export declare function getRealtimePreemptiveProcessor(sessionId: string): RealtimePreemptiveProcessor;
export declare function resetRealtimePreemptiveProcessor(sessionId: string): void;
export declare function getActiveRealtimePreemptiveCount(): number;
//# sourceMappingURL=realtime-preemptive-patch.d.ts.map