/**
 * Pacing & Volume Detection Constants
 * Keywords for detecting speech speed and volume cues
 *
 * @module ssml/constants/pacing
 */
/**
 * Keywords indicating slower speech is appropriate
 * Used for emotional weight, reflection, important points
 */
export declare const SLOW_PACE_KEYWORDS: string[];
/**
 * Keywords indicating faster speech is appropriate
 * Used for excitement, urgency, energy
 */
export declare const FAST_PACE_KEYWORDS: string[];
/**
 * Keywords indicating louder/emphasized speech
 * Used for SSML volume tags
 */
export declare const EMPHASIS_KEYWORDS: string[];
/**
 * Keywords indicating softer/quieter speech
 * Used for intimate, gentle, or sensitive content
 */
export declare const WHISPER_KEYWORDS: string[];
/**
 * Default speed ratio (1.0 = normal)
 */
export declare const DEFAULT_SPEED = 1;
/**
 * Speed ratio adjustments
 */
export declare const SPEED_ADJUSTMENTS: {
    /** Slow speech ratio */
    slow: number;
    /** Normal speech ratio */
    normal: number;
    /** Fast speech ratio */
    fast: number;
    /** Very slow for emphasis */
    verySlow: number;
    /** Very fast for excitement */
    veryFast: number;
};
/**
 * Default volume ratio (1.0 = normal)
 */
export declare const DEFAULT_VOLUME = 1;
/**
 * Volume ratio adjustments
 */
export declare const VOLUME_ADJUSTMENTS: {
    /** Whisper volume */
    whisper: number;
    /** Soft volume */
    soft: number;
    /** Normal volume */
    normal: number;
    /** Loud volume */
    loud: number;
    /** Emphasis volume */
    emphasis: number;
};
//# sourceMappingURL=pacing.d.ts.map