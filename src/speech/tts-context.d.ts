/**
 * TTS Context Service - Prosody Continuity Across Turns
 *
 * Maintains conversation context for TTS to ensure natural prosody
 * continuity between utterances. Without this, each TTS call is
 * independent and prosody can feel disconnected.
 *
 * Key insight from Sesame's research:
 * "Without additional context—including tone, rhythm, and history
 * of the conversation—models lack the information to choose the best option."
 *
 * Cartesia's WebSocket API supports "contexts" which maintain prosody
 * between inputs using the same context_id.
 *
 * @see https://docs.cartesia.ai/api-reference/tts/working-with-web-sockets/contexts
 * @see https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice
 */
import type { EmotionResult } from '../intelligence/emotion-detector.js';
export interface TtsContextState {
    /** Unique context ID for Cartesia API */
    contextId: string;
    /** Session this context belongs to */
    sessionId: string;
    /** Persona this context is for */
    personaId: string;
    /** Recent turns for prosody reference */
    recentTurns: TurnProsodyRecord[];
    /** Current emotional arc state */
    emotionalArc: 'escalating' | 'stable' | 'de-escalating';
    /** Overall conversation energy (0-1) */
    conversationEnergy: number;
    /** Rapport level (0-1) */
    rapport: number;
    /** Last agent utterance end timestamp */
    lastAgentUtteranceEnd?: number;
    /** Was last turn interrupted? */
    wasInterrupted: boolean;
}
export interface TurnProsodyRecord {
    speaker: 'user' | 'agent';
    timestamp: number;
    emotion: string;
    energy: number;
    wasInterrupted: boolean;
    durationMs: number;
}
export interface ProsodyGuidance {
    /** Should add opening pause */
    openingPause: boolean;
    /** Opening pause duration (ms) */
    openingPauseDuration: number;
    /** Warmth level adjustment */
    warmth: 'high' | 'medium' | 'low';
    /** Pace adjustment relative to previous */
    pace: 'faster' | 'match' | 'slower';
    /** Specific words to emphasize */
    emphasisWords: string[];
    /** SSML prefix to add */
    ssmlPrefix: string;
    /** Energy level (0-1) */
    targetEnergy: number;
}
export declare class TtsContextService {
    private contexts;
    /**
     * Create or get context for a session
     */
    getOrCreateContext(sessionId: string, personaId: string): TtsContextState;
    /**
     * Record an agent turn for prosody tracking
     */
    recordAgentTurn(sessionId: string, personaId: string, options: {
        emotion: string;
        energy: number;
        durationMs: number;
        wasInterrupted: boolean;
    }): void;
    /**
     * Record a user turn for context
     */
    recordUserTurn(sessionId: string, personaId: string, emotion: EmotionResult, durationMs: number): void;
    /**
     * Get prosody guidance for next agent utterance
     */
    getProsodyGuidance(sessionId: string, personaId: string): ProsodyGuidance;
    /**
     * Get the context ID for Cartesia API
     */
    getContextId(sessionId: string, personaId: string): string;
    /**
     * Apply prosody guidance to text via SSML
     */
    applyProsodyGuidance(text: string, guidance: ProsodyGuidance): string;
    /**
     * Update emotional arc based on recent turns
     */
    private updateEmotionalArc;
    /**
     * Generate unique context ID
     */
    private generateContextId;
    /**
     * Clear context for a session (e.g., on disconnect)
     */
    clearSession(sessionId: string): void;
    /**
     * Reset all contexts
     */
    reset(): void;
}
export declare function getTtsContextService(): TtsContextService;
export declare function resetTtsContextService(): void;
//# sourceMappingURL=tts-context.d.ts.map