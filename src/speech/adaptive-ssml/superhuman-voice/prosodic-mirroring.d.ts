/**
 * Prosodic Mirroring
 *
 * Mirrors user's speaking pace to build rapport.
 * When user speaks fast, we speed up slightly. When slow, we slow down.
 * This builds subconscious rapport - "Better than human" because we do it perfectly.
 *
 * @module speech/adaptive-ssml/superhuman-voice/prosodic-mirroring
 */
/**
 * Prosodic mirroring configuration.
 * Mirrors user's speaking pace to build rapport.
 */
export declare const PROSODIC_MIRRORING_CONFIG: {
    /** Target WPM for "normal" speaking */
    readonly targetWPM: 150;
    /** Minimum speed multiplier */
    readonly minSpeed: 0.8;
    /** Maximum speed multiplier */
    readonly maxSpeed: 1.15;
    /** How strongly to mirror (0-1) */
    readonly mirrorStrength: 0.35;
    /** WPM thresholds */
    readonly thresholds: {
        readonly verySlow: 100;
        readonly slow: 120;
        readonly normal: 150;
        readonly fast: 180;
        readonly veryFast: 200;
    };
};
/**
 * Calculate prosodic mirroring speed adjustment.
 * When user speaks fast, we speed up slightly. When slow, we slow down.
 * This builds subconscious rapport.
 */
export declare function calculateProsodicMirroring(userWPM: number | undefined): {
    speedMultiplier: number;
    reason: string;
};
//# sourceMappingURL=prosodic-mirroring.d.ts.map