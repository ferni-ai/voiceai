/**
 * Speech Configuration - Centralized Constants
 *
 * Single source of truth for all speech module configuration.
 * Externalized from various modules for easier tuning and A/B testing.
 *
 * @module speech/config
 */
/**
 * Backchanneling configuration - IMPORTANT: Keep in sync with timing-config.ts
 *
 * TIMING FIX (Jan 2026): Significantly reduced to fix "all over the place" feel.
 * Target: ~3-4 backchannels per minute (human parity) instead of ~6-8.
 */
export declare const BACKCHANNELING_CONFIG: {
    readonly standard: {
        readonly minSpeechDuration: 7000;
        readonly pauseTriggerDuration: 1500;
        readonly cooldownPeriod: 15000;
        readonly maxPerTurn: 1;
        readonly baseProbability: 0.15;
        readonly emotionalProbability: 0.25;
    };
    readonly enhanced: {
        readonly minSpeechDuration: 5500;
        readonly pauseTriggerDuration: 2000;
        readonly cooldownPeriod: 15000;
        readonly maxPerTurn: 1;
        readonly baseProbability: 0.2;
        readonly emotionalProbability: 0.35;
    };
    readonly live: {
        readonly minSpeechDuration: 6000;
        readonly pauseTriggerDuration: 200;
        readonly cooldownPeriod: 15000;
        readonly maxPerTurn: 1;
        readonly baseProbability: 0.15;
        readonly emotionalProbability: 0.25;
    };
    /** Timing adjustments for heavy topics */
    readonly heavyTopicMultiplier: {
        readonly cooldown: 1.2;
        readonly pauseTrigger: 1.2;
    };
    /** Timing adjustments for light topics */
    readonly lightTopicMultiplier: {
        readonly cooldown: 0.9;
        readonly pauseTrigger: 0.9;
    };
};
export declare const TURN_PREDICTION_CONFIG: {
    /** Probability threshold to declare turn complete */
    readonly completionThreshold: 0.7;
    /** Probability threshold to keep waiting */
    readonly waitThreshold: 0.3;
    /** Minimum utterance duration (ms) */
    readonly minUtteranceMs: 500;
    /** Evidence weights for turn prediction */
    readonly weights: {
        readonly syntactic: 0.25;
        readonly prosodic: 0.3;
        readonly semantic: 0.2;
        readonly pragmatic: 0.25;
    };
    /** Pitch fall detection */
    readonly pitchFall: {
        readonly minRatioForComplete: 0.75;
        readonly sustainedMs: 200;
    };
};
export declare const EMOTION_DETECTION_CONFIG: {
    /** Minimum confidence to report emotion */
    readonly minConfidence: 0.5;
    /** High confidence threshold */
    readonly highConfidence: 0.7;
    /** Stress detection threshold */
    readonly stressThreshold: 0.6;
    /** VAD emotion mapping weights */
    readonly vadWeights: {
        readonly pitchVariance: 0.3;
        readonly energyVariance: 0.25;
        readonly speechRate: 0.2;
        readonly pausePatterns: 0.25;
    };
};
export declare const HUMANIZATION_CONFIG: {
    /** Natural filler injection */
    readonly fillers: {
        /** Base probability of filler at injection point */
        readonly probability: 0.12;
        /** Maximum fillers per response */
        readonly maxPerResponse: 2;
        /** Types with weights */
        readonly types: {
            readonly um: 0.3;
            readonly uh: 0.25;
            readonly well: 0.2;
            readonly like: 0.15;
            readonly youKnow: 0.1;
        };
    };
    /** Breath group pauses (ms) */
    readonly breathPauses: {
        readonly short: 120;
        readonly medium: 220;
        readonly long: 350;
    };
    /** Speed ratios for rhythm variation */
    readonly speedRatios: {
        readonly normal: 1;
        readonly important: 0.92;
        readonly questions: 0.95;
        readonly emotional: 0.9;
        readonly listsExamples: 1.05;
        readonly conclusions: 0.93;
    };
};
export declare const FFT_CONFIG: {
    /** FFT window size (must be power of 2) */
    readonly bufferSize: 1024;
    /** Default sample rate */
    readonly sampleRate: 16000;
    /** Frames for activity detection */
    readonly fluxHistory: 10;
    /** Frequency bands (Hz) */
    readonly bands: Record<string, [number, number]>;
    /** Environment classification thresholds */
    readonly environmentThresholds: {
        readonly speech: 0.5;
        readonly music: 0.4;
        readonly quiet: 0.3;
    };
};
export declare const BREATH_DETECTION_CONFIG: {
    /** Sigh detection confidence */
    readonly sighConfidence: 0.6;
    /** Gasp minimum spectral centroid (Hz) */
    readonly gaspMinCentroid: 500;
    /** Held breath minimum silence (ms) */
    readonly heldBreathMinSilence: 2000;
    /** Deep breath energy threshold */
    readonly deepBreathEnergyThreshold: 0.4;
};
export declare const ANTICIPATION_CONFIG: {
    /** Minimum transcript length to start anticipating */
    readonly minTranscriptLength: 10;
    /** Throttle interval (ms) */
    readonly updateIntervalMs: 100;
    /** Confidence threshold for caching */
    readonly cacheConfidenceThreshold: 0.7;
    /** Intent confidence threshold */
    readonly intentConfidenceThreshold: 0.5;
};
export declare const ADAPTIVE_MODE_CONFIG: {
    /** Switch to live mode for high emotional intensity */
    readonly useLineForEmotional: true;
    /** Emotional threshold for live mode (0-1) */
    readonly emotionalThreshold: 0.6;
    /** Switch to enhanced for heavy topics */
    readonly useEnhancedForHeavy: true;
    /** Use standard for early conversation */
    readonly useStandardForEarly: true;
    /** Turn threshold for "early" conversation */
    readonly earlyTurnThreshold: 3;
};
export declare const LATENCY_TARGETS_MS: {
    readonly humanListeningFull: 100;
    readonly humanListeningQuick: 10;
    readonly dynamicSpeedCalc: 1;
    readonly phraseBoundary: 0.5;
    readonly fftAnalysis: 5;
    readonly sessionCleanup: 50;
};
/**
 * Feedback coordination config
 * TIMING FIX (Jan 2026): Reduced to prevent "all over the place" feel
 */
export declare const FEEDBACK_COORDINATION_CONFIG: {
    /** Maximum feedback events per turn - reduced from 3 to 2 */
    readonly maxFeedbackPerTurn: 2;
    /** Cooldown between feedback of same type (ms) - increased from 5s to 10s */
    readonly sameFeedbackCooldownMs: 10000;
    /** Probability of any single feedback - reduced from 0.3 to 0.15 */
    readonly baseFeedbackProbability: 0.15;
    /** Feedback types with priority (higher = more important) */
    readonly feedbackPriority: {
        readonly backchannel: 1;
        readonly acknowledgmentPrefix: 2;
        readonly laughter: 3;
        readonly catchphrase: 1;
    };
};
export type BackchannelMode = 'standard' | 'enhanced' | 'live' | 'adaptive';
export type TopicWeight = 'light' | 'medium' | 'heavy';
export type EmotionType = 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'supportive';
/**
 * Get backchanneling config for a specific mode
 */
export declare function getBackchannelConfig(mode: BackchannelMode): {
    readonly minSpeechDuration: 7000;
    readonly pauseTriggerDuration: 1500;
    readonly cooldownPeriod: 15000;
    readonly maxPerTurn: 1;
    readonly baseProbability: 0.15;
    readonly emotionalProbability: 0.25;
} | {
    readonly minSpeechDuration: 5500;
    readonly pauseTriggerDuration: 2000;
    readonly cooldownPeriod: 15000;
    readonly maxPerTurn: 1;
    readonly baseProbability: 0.2;
    readonly emotionalProbability: 0.35;
} | {
    readonly minSpeechDuration: 6000;
    readonly pauseTriggerDuration: 200;
    readonly cooldownPeriod: 15000;
    readonly maxPerTurn: 1;
    readonly baseProbability: 0.15;
    readonly emotionalProbability: 0.25;
};
/**
 * Adjust timing for topic weight
 */
export declare function adjustTimingForTopicWeight(baseConfig: typeof BACKCHANNELING_CONFIG.standard, topicWeight: TopicWeight): {
    readonly minSpeechDuration: 7000;
    readonly pauseTriggerDuration: 1500;
    readonly cooldownPeriod: 15000;
    readonly maxPerTurn: 1;
    readonly baseProbability: 0.15;
    readonly emotionalProbability: 0.25;
} | {
    cooldownPeriod: number;
    pauseTriggerDuration: number;
    minSpeechDuration: 7000;
    maxPerTurn: 1;
    baseProbability: 0.15;
    emotionalProbability: 0.25;
};
//# sourceMappingURL=speech-config.d.ts.map