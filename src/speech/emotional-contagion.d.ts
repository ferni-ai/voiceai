/**
 * Emotional Contagion Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Maintains prosodic and emotional continuity across utterances.
 * Humans don't reset their voice between sentences - if they're comforting
 * someone, warmth carries through. If they're excited, energy builds.
 *
 * This service:
 * 1. Tracks emotional "momentum" across turns
 * 2. Provides SSML hints for TTS to maintain continuity
 * 3. Prevents jarring emotional resets between sentences
 * 4. Enables gradual emotional transitions
 *
 * @module EmotionalContagion
 */
import type { EmotionalArc } from '../conversation/emotional-arc.js';
/**
 * Emotional state for a single utterance
 */
export interface UtteranceEmotionalState {
    /** Timestamp when utterance was generated */
    timestamp: number;
    /** Primary emotion expressed */
    emotion: string;
    /** Valence (-1 to 1) */
    valence: number;
    /** Arousal/energy (0 to 1) */
    arousal: number;
    /** Warmth level */
    warmth: 'high' | 'medium' | 'low';
    /** Was this a response to user distress? */
    wasSupporting: boolean;
}
/**
 * Emotional momentum tracking
 */
export interface EmotionalMomentum {
    /** Current momentum valence (smoothed) */
    valence: number;
    /** Current momentum arousal (smoothed) */
    arousal: number;
    /** Current warmth level */
    warmth: 'high' | 'medium' | 'low';
    /** How many turns at current emotional state */
    turnsAtState: number;
    /** Is momentum building or dissipating? */
    trend: 'building' | 'stable' | 'dissipating';
}
/**
 * SSML continuity hints for TTS
 */
export interface ProsodyContinuityHints {
    /** Opening modifier (affect how utterance starts) */
    opening: {
        /** Pause before speaking (ms) */
        pauseMs: number;
        /** Should start soft/quiet? */
        softStart: boolean;
        /** Should build energy? */
        buildEnergy: boolean;
    };
    /** Overall prosody adjustments */
    prosody: {
        /** Speed adjustment (-0.3 to 0.3) */
        speedAdjust: number;
        /** Volume adjustment (0.8 to 1.2) */
        volumeAdjust: number;
        /** Pitch tendency ('higher' | 'lower' | 'neutral') */
        pitchTendency: 'higher' | 'lower' | 'neutral';
    };
    /** Emotional coloring for TTS */
    emotion: {
        /** Suggested emotion tag */
        tag: string;
        /** Intensity (0-1) */
        intensity: number;
    };
    /** Whether to add closing warmth */
    closingWarmth: boolean;
    /** Reason for these hints (for debugging) */
    reason: string;
}
export declare class EmotionalContagionService {
    private utteranceHistory;
    private momentum;
    private readonly maxHistory;
    private sessionId;
    constructor(sessionId: string);
    /**
     * Record an utterance's emotional state
     * Call this AFTER each agent utterance is generated
     */
    recordUtterance(state: Omit<UtteranceEmotionalState, 'timestamp'>): void;
    /**
     * Get prosody hints for the NEXT utterance
     * Call this BEFORE generating TTS
     */
    getContinuityHints(emotionalArc: EmotionalArc | null, currentEmotion?: string): ProsodyContinuityHints;
    /**
     * Apply continuity hints to SSML
     */
    applyContinuityToSsml(text: string, hints: ProsodyContinuityHints): string;
    /**
     * Get current emotional momentum
     */
    getMomentum(): EmotionalMomentum;
    /**
     * Update momentum based on new utterance
     */
    private updateMomentum;
    /**
     * Create initial momentum state
     */
    private createInitialMomentum;
    /**
     * Reset service state
     */
    reset(): void;
}
/**
 * Get or create emotional contagion service for a session
 */
export declare function getEmotionalContagionService(sessionId: string): EmotionalContagionService;
/**
 * Reset emotional contagion for a session
 */
export declare function resetEmotionalContagion(sessionId: string): void;
/**
 * Reset all instances
 */
export declare function resetAllEmotionalContagion(): void;
/**
 * Check if a session has emotional contagion service
 */
export declare function hasEmotionalContagion(sessionId: string): boolean;
/**
 * Get count of active emotional contagion sessions
 */
export declare function getActiveEmotionalContagionCount(): number;
//# sourceMappingURL=emotional-contagion.d.ts.map