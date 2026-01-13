/**
 * Voice Humanization Constants
 *
 * Static data and thresholds for voice humanization.
 */
/**
 * Words that should immediately stop agent speech when detected
 * These are common human interruption patterns
 */
export declare const IMMEDIATE_STOP_WORDS: Set<string>;
/**
 * Words that suggest user wants to interject soon (but not immediately)
 */
export declare const SOFT_INTERRUPTION_WORDS: Set<string>;
/**
 * Quick acknowledgment phrases that often precede interruptions
 */
export declare const PRE_INTERRUPTION_PATTERNS: RegExp[];
/**
 * Audio characteristics that suggest laughter
 * Based on energy bursts, pitch variation, and timing patterns
 */
export declare const LAUGHTER_THRESHOLDS: {
    /** Minimum energy peaks per second to suggest laughter */
    readonly MIN_ENERGY_PEAKS_PER_SEC: 3;
    /** Maximum utterance duration for laughter (ms) */
    readonly MAX_LAUGHTER_DURATION_MS: 3000;
    /** Minimum pitch variance for laughter */
    readonly MIN_PITCH_VARIANCE: 30;
    /** High energy with short duration = likely laughter */
    readonly ENERGY_DURATION_RATIO: 0.5;
};
/**
 * SSML responses for detected laughter, by persona
 */
export declare const LAUGHTER_RESPONSES: Record<string, Record<string, string[]>>;
//# sourceMappingURL=constants.d.ts.map