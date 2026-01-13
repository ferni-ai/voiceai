/**
 * Word-Timing Rhythm Mirroring
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Improves rhythm mirroring beyond simple word-count estimation by:
 * 1. **Estimating Word Timing**: Using prosody features to infer word durations
 * 2. **Phrase Rhythm Analysis**: Detecting phrase patterns (staccato, flowing, measured)
 * 3. **Pause Pattern Learning**: Learning user's pause habits
 * 4. **SSML Rhythm Generation**: Creating rhythm-matched SSML
 *
 * Note: Without direct word-level timestamps from STT, we use prosody-based
 * estimation which provides ~80% accuracy vs true timing.
 *
 * @module WordTimingRhythm
 */
import type { ProsodyFeatures } from './audio-prosody.js';
/**
 * Estimated word timing
 */
export interface WordTiming {
    /** Word text */
    word: string;
    /** Estimated start time within utterance (ms) */
    estimatedStart: number;
    /** Estimated duration (ms) */
    estimatedDuration: number;
    /** Was this likely a stressed word? */
    likelyStressed: boolean;
}
/**
 * Phrase rhythm analysis
 */
export interface PhraseRhythm {
    /** Average word duration (ms) */
    avgWordDuration: number;
    /** Inter-word pause (ms) */
    avgInterWordPause: number;
    /** Rhythm pattern type */
    pattern: 'staccato' | 'flowing' | 'measured' | 'burst' | 'varied';
    /** Pacing (words per minute) */
    pacing: number;
    /** Regularity score (0-1) - how consistent is timing? */
    regularity: number;
    /** Pause preference */
    pauseStyle: 'frequent_short' | 'infrequent_long' | 'minimal' | 'varied';
}
/**
 * SSML rhythm adjustments
 */
export interface RhythmSsmlAdjustments {
    /** Overall rate adjustment (0.7-1.3) */
    rate: number;
    /** Break durations between phrases (ms) */
    phraseBreak: number;
    /** Should add micro-pauses? */
    addMicroPauses: boolean;
    /** Micro-pause duration if applicable (ms) */
    microPauseDuration: number;
    /** Emphasis pattern */
    emphasisPattern: 'natural' | 'rhythmic' | 'none';
    /** Generated SSML wrapper */
    ssmlWrapper: (text: string) => string;
}
/**
 * Estimate word timing from text and prosody
 */
export declare function estimateWordTimings(text: string, prosody: ProsodyFeatures): WordTiming[];
/**
 * Analyze phrase rhythm from prosody and timing estimates
 */
export declare function analyzePhseRhythm(wordTimings: WordTiming[], prosody: ProsodyFeatures): PhraseRhythm;
/**
 * Generate SSML adjustments to match user's rhythm
 */
export declare function generateRhythmSsml(userRhythm: PhraseRhythm, personaDefaultPacing?: number): RhythmSsmlAdjustments;
export declare class WordTimingRhythmService {
    private sessionId;
    private utteranceHistory;
    private learnedRhythm;
    constructor(sessionId: string);
    /**
     * Process utterance and learn rhythm
     */
    processUtterance(text: string, prosody: ProsodyFeatures): {
        wordTimings: WordTiming[];
        rhythm: PhraseRhythm;
        ssmlAdjustments: RhythmSsmlAdjustments;
    };
    /**
     * Update learned rhythm with EMA
     */
    private updateLearnedRhythm;
    /**
     * Get learned rhythm or default
     */
    getLearnedRhythm(): PhraseRhythm;
    /**
     * Get SSML wrapper based on learned rhythm
     */
    getSsmlWrapper(): (text: string) => string;
    /**
     * Get current rhythm adjustments
     */
    getCurrentAdjustments(): RhythmSsmlAdjustments;
    /**
     * Reset service state
     */
    reset(): void;
}
export declare function getWordTimingRhythmService(sessionId: string): WordTimingRhythmService;
export declare function resetWordTimingRhythmService(sessionId: string): void;
export declare function getActiveWordTimingCount(): number;
//# sourceMappingURL=word-timing-rhythm.d.ts.map