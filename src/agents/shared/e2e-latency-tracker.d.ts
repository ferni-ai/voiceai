/**
 * E2E Latency Tracker
 *
 * Tracks the complete timeline from user speech to agent response.
 * Helps diagnose whether latency issues are from:
 * - OpenAI/LLM (TTFB - time to first token)
 * - TTS (Cartesia)
 * - Our code (processing time)
 *
 * Timeline tracked:
 * 1. userSpeechEnded - When user stops speaking
 * 2. processingStarted - When we start processing the transcript
 * 3. llmRequestSent - When we call generateReply
 * 4. llmFirstToken - When we receive first LLM output (TTFB)
 * 5. llmComplete - When LLM finishes
 * 6. ttsFirstAudio - When TTS starts sending audio
 * 7. audioStarted - When audio actually starts playing
 *
 * @module agents/shared/e2e-latency-tracker
 */
export interface LatencyTimeline {
    turnId: string;
    sessionId: string;
    userTranscript?: string;
    userSpeechEnded?: number;
    processingStarted?: number;
    llmRequestSent?: number;
    llmFirstToken?: number;
    llmComplete?: number;
    ttsFirstAudio?: number;
    audioStarted?: number;
    processingLatency?: number;
    llmTTFB?: number;
    llmTotal?: number;
    ttsLatency?: number;
    e2eTotal?: number;
    context?: string;
    isOpenAISlow?: boolean;
    isTTSSlow?: boolean;
    isProcessingSlow?: boolean;
}
/**
 * Start tracking a new turn.
 * Call this when user speech ends or transcript is received.
 */
export declare function startTurn(sessionId: string, userTranscript?: string): string;
/**
 * Mark when we start processing the transcript.
 */
export declare function markProcessingStarted(sessionIdOrTurnId: string): void;
/**
 * Mark when we send the LLM request.
 */
export declare function markLLMRequestSent(sessionIdOrTurnId: string, context?: string): void;
/**
 * Mark when we receive the first token from LLM.
 * This is the critical TTFB (Time To First Byte) metric.
 */
export declare function markLLMFirstToken(sessionIdOrTurnId: string): void;
/**
 * Mark when LLM completes.
 */
export declare function markLLMComplete(sessionIdOrTurnId: string): void;
/**
 * Mark when TTS starts sending audio.
 */
export declare function markTTSFirstAudio(sessionIdOrTurnId: string): void;
/**
 * Mark when audio actually starts playing.
 * This completes the E2E timeline.
 */
export declare function markAudioStarted(sessionIdOrTurnId: string): void;
/**
 * Force complete a turn (for timeout or error cases).
 */
export declare function completeTurnWithError(sessionIdOrTurnId: string, error: string): void;
/**
 * Get recent latency stats for dashboard.
 */
export declare function getLatencyStats(): {
    avgE2E: number;
    avgLLMTTFB: number;
    avgTTS: number;
    avgProcessing: number;
    slowOpenAIPercent: number;
    slowTTSPercent: number;
    recentTimelines: LatencyTimeline[];
};
/**
 * Get the current turn's timeline for a session.
 */
export declare function getCurrentTimeline(sessionId: string): LatencyTimeline | null;
declare const _default: {
    startTurn: typeof startTurn;
    markProcessingStarted: typeof markProcessingStarted;
    markLLMRequestSent: typeof markLLMRequestSent;
    markLLMFirstToken: typeof markLLMFirstToken;
    markLLMComplete: typeof markLLMComplete;
    markTTSFirstAudio: typeof markTTSFirstAudio;
    markAudioStarted: typeof markAudioStarted;
    completeTurnWithError: typeof completeTurnWithError;
    getLatencyStats: typeof getLatencyStats;
    getCurrentTimeline: typeof getCurrentTimeline;
};
export default _default;
//# sourceMappingURL=e2e-latency-tracker.d.ts.map