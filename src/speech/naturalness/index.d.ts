/**
 * Unified Naturalness Engine
 *
 * Orchestrates all voice naturalness systems into a single coherent interface:
 * - Stress Auto-Adaptation: Detect user stress, modulate TTS calmingly
 * - Voice Pattern Learning: Remember preferences across sessions
 * - Ambient Sound Reactivity: Adapt to noisy environments
 * - Rapport Scoring: Track conversational health, trigger repairs
 *
 * Key principle: Multiple systems contribute adjustments, but the user
 * experiences ONE coherent, natural voice adaptation - not four.
 *
 * @module naturalness
 */
import type { AudioSignalInput, TurnContextInput, AmbientAudioInput, NaturalnessResult, NaturalnessEngineState } from './types.js';
/**
 * Full input for a turn observation
 */
export interface TurnInput {
    /** Audio signals (stress, breath, tremor) */
    audio?: AudioSignalInput;
    /** Turn context (word counts, emotions, interruptions) */
    context: TurnContextInput;
    /** Ambient audio analysis (if available) */
    ambient?: AmbientAudioInput;
}
interface NaturalnessEngineInstance {
    sessionId: string;
    userId: string;
    turnsProcessed: number;
    sessionStartedAt: number;
    lastResult: NaturalnessResult | null;
    initialized: boolean;
}
/**
 * Get or create naturalness engine for a session
 */
export declare function getNaturalnessEngine(sessionId: string, userId: string): NaturalnessEngineInstance;
/**
 * Reset naturalness engine and all subsystems
 */
export declare function resetNaturalnessEngine(sessionId: string): void;
/**
 * Get count of active engines
 */
export declare function getActiveNaturalnessEngineCount(): number;
/**
 * Initialize naturalness engine at session start
 * Loads persisted voice patterns from Firestore
 */
export declare function initializeNaturalnessEngine(sessionId: string, userId: string): Promise<NaturalnessEngineInstance>;
/**
 * Persist session data at session end
 */
export declare function persistNaturalnessData(sessionId: string): Promise<void>;
/**
 * Process a complete turn and get naturalness adjustments
 *
 * Call this after each user turn to:
 * 1. Record observations to all subsystems
 * 2. Get combined TTS adjustments
 * 3. Get context injections for LLM
 * 4. Get verbal acknowledgments if needed
 */
export declare function processTurn(sessionId: string, input: TurnInput): NaturalnessResult;
/**
 * Get current naturalness engine state
 */
export declare function getNaturalnessEngineState(sessionId: string): NaturalnessEngineState | null;
/**
 * Get last naturalness result
 */
export declare function getLastNaturalnessResult(sessionId: string): NaturalnessResult | null;
/**
 * Process an audio frame for ambient analysis
 * Call this with each audio frame during the conversation
 */
export declare function processAudioFrame(sessionId: string, data: Int16Array | Float32Array, sampleRate: number, isSpeech: boolean): void;
export declare const naturalnessEngine: {
    get: typeof getNaturalnessEngine;
    reset: typeof resetNaturalnessEngine;
    initialize: typeof initializeNaturalnessEngine;
    persist: typeof persistNaturalnessData;
    getActiveCount: typeof getActiveNaturalnessEngineCount;
    processTurn: typeof processTurn;
    processAudioFrame: typeof processAudioFrame;
    getState: typeof getNaturalnessEngineState;
    getLastResult: typeof getLastNaturalnessResult;
};
export type * from './types.js';
export * from './combine-adjustments.js';
//# sourceMappingURL=index.d.ts.map