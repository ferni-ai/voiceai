/**
 * Humanizing Configuration
 *
 * Centralized tuning parameters for all humanization features.
 * Adjust these values to fine-tune how "human" the AI sounds.
 *
 * Usage:
 *   import { getHumanizingConfig, updateHumanizingConfig } from './humanizing-config.js';
 *
 *   // Get current config
 *   const config = getHumanizingConfig();
 *
 *   // Update specific values
 *   updateHumanizingConfig({ disfluency: { frequency: 0.2 } });
 */
export interface HumanizingConfig {
    /**
     * Speech Naturalization Settings
     */
    disfluency: {
        /** Whether disfluencies are enabled */
        enabled: boolean;
        /** Base frequency of disfluencies (0-1) */
        frequency: number;
        /** Reduce in serious/emotional contexts */
        contextSensitivity: boolean;
        /** Persona-specific style override */
        personaStyle?: 'minimal' | 'natural' | 'conversational' | 'folksy';
    };
    /**
     * Hedging Settings (uncertainty markers)
     */
    hedging: {
        /** Whether hedging is enabled */
        enabled: boolean;
        /** Probability of adding hedge to advice statements (0-1) */
        adviceHedgingRate: number;
        /** Probability of adding hedge to predictions (0-1) */
        predictionHedgingRate: number;
        /** Default hedge strength */
        defaultStrength: 'soft' | 'medium' | 'strong';
    };
    /**
     * Backchannel Settings
     */
    backchannel: {
        /** Whether backchannels are enabled */
        enabled: boolean;
        /** Minimum ms between backchannels */
        minIntervalMs: number;
        /** Minimum user message length to trigger backchannel */
        minUserMessageLength: number;
        /** Probability of backchannel when conditions met (0-1) */
        probability: number;
    };
    /**
     * Silence Handling Settings
     */
    silence: {
        /** Ms of silence before backchannel is suggested */
        backchannelThresholdMs: number;
        /** Ms of silence before gentle prompt is suggested */
        gentlePromptThresholdMs: number;
        /** Extra patience after personal sharing (multiplier) */
        personalSharingPatienceMultiplier: number;
        /** Extra patience during high emotion (multiplier) */
        highEmotionPatienceMultiplier: number;
    };
    /**
     * Conversational Memory Settings
     */
    memory: {
        /** Whether memory callbacks are enabled */
        enabled: boolean;
        /** Minimum turns before callback is possible */
        minTurnsBeforeCallback: number;
        /** Probability of callback when conditions met (0-1) */
        callbackProbability: number;
        /** Probability of returning to unresolved thread (0-1) */
        threadReturnProbability: number;
        /** Probability of commitment follow-up (0-1) */
        commitmentFollowUpProbability: number;
        /** Max statements to track */
        maxTrackedStatements: number;
    };
    /**
     * Question Diversity Settings
     */
    questions: {
        /** Whether question suggestions are enabled */
        enabled: boolean;
        /** Probability of suggesting follow-up question (0-1) */
        followUpProbability: number;
        /** Avoid repeating same question type within N questions */
        typeRepeatAvoidance: number;
        /** Preferred depth for reflective questions */
        reflectiveDepthThreshold: number;
    };
    /**
     * Emotional Response Settings
     */
    emotional: {
        /** Whether emotional echoing is enabled */
        echoEnabled: boolean;
        /** Threshold for high intensity emotional response (0-1) */
        highIntensityThreshold: number;
        /** Whether to mirror vocabulary */
        vocabularyMirroringEnabled: boolean;
    };
    /**
     * Global Settings
     */
    global: {
        /** Master enable/disable for all humanization */
        enabled: boolean;
        /** Log humanization decisions */
        debugLogging: boolean;
        /** Reduce all features in first N turns */
        warmupTurns: number;
        /** Feature reduction during warmup (0-1) */
        warmupReduction: number;
    };
}
/**
 * Get the current humanizing configuration
 */
export declare function getHumanizingConfig(): Readonly<HumanizingConfig>;
/**
 * Update humanizing configuration (deep merge)
 */
export declare function updateHumanizingConfig(updates: DeepPartial<HumanizingConfig>): void;
/**
 * Reset configuration to defaults
 */
export declare function resetHumanizingConfig(): void;
/**
 * Get effective frequency/probability considering warmup
 */
export declare function getEffectiveRate(baseRate: number, turnNumber: number): number;
/**
 * Check if a feature should be applied this turn
 */
export declare function shouldApplyFeature(featureKey: keyof HumanizingConfig, probability: number, turnNumber: number): boolean;
/**
 * Preset configurations for different use cases
 */
export declare const HUMANIZING_PRESETS: {
    /**
     * Minimal - Very subtle humanization
     * Good for: formal/professional interactions, efficiency-focused users
     */
    minimal: DeepPartial<HumanizingConfig>;
    /**
     * Natural - Balanced, production-ready
     * Good for: most conversations, general users
     * TUNED to match DEFAULT_CONFIG
     */
    natural: DeepPartial<HumanizingConfig>;
    /**
     * Conversational - More casual, friendly
     * Good for: Jordan, Peter, relationship-building
     */
    conversational: DeepPartial<HumanizingConfig>;
    /**
     * Therapeutic - For supportive, coaching personas
     * Good for: Ferni, emotional support, coaching moments
     * TUNED: More patience, gentler interventions
     */
    therapeutic: DeepPartial<HumanizingConfig>;
    /**
     * Expert - For authoritative personas
     * Good for: Jack Bogle, financial expertise, decisiveness
     */
    expert: DeepPartial<HumanizingConfig>;
    /**
     * Warm - For friendly, approachable personas
     * Good for: Maya, Alex, building rapport
     */
    warm: DeepPartial<HumanizingConfig>;
    /**
     * Disabled - All humanization off (for testing)
     */
    disabled: DeepPartial<HumanizingConfig>;
};
/**
 * Apply a preset configuration
 */
export declare function applyPreset(preset: keyof typeof HUMANIZING_PRESETS): void;
/**
 * Get recommended preset for a persona
 * TUNED: Each persona gets a fitting humanization style
 */
export declare function getRecommendedPreset(personaId: string): keyof typeof HUMANIZING_PRESETS;
/**
 * Register humanization config from a persona bundle.
 * Called by the bundle adapter when loading a persona.
 */
export declare function registerBundleHumanization(personaId: string, bundleConfig: {
    preset?: string;
    overrides?: {
        disfluency?: {
            enabled?: boolean;
            frequency?: number;
        };
        hedging?: {
            enabled?: boolean;
            frequency?: number;
        };
        active_listening?: {
            enabled?: boolean;
            backchannel_probability?: number;
            emotional_echo_probability?: number;
            vocabulary_mirroring_probability?: number;
        };
        conversational_memory?: {
            enabled?: boolean;
            callback_probability?: number;
        };
        questions?: {
            enabled?: boolean;
            injection_probability?: number;
        };
    };
    warmup?: {
        turns?: number;
        reduction?: number;
    };
    context_modifiers?: {
        serious_topics_reduction?: number;
        personal_sharing_warmth_boost?: number;
        high_emotion_breathing_boost?: number;
    };
}): void;
/**
 * Get the humanizing config for a specific persona.
 * Merges the base config with any persona-specific overrides.
 */
export declare function getPersonaHumanizingConfig(personaId: string): Readonly<HumanizingConfig>;
/**
 * Get context modifiers for a specific persona
 */
export declare function getPersonaContextModifiers(personaId: string): {
    serious_topics_reduction?: number;
    personal_sharing_warmth_boost?: number;
    high_emotion_breathing_boost?: number;
};
/**
 * Clear all persona-specific configs (for testing)
 */
export declare function clearPersonaConfigs(): void;
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
declare const _default: {
    getHumanizingConfig: typeof getHumanizingConfig;
    updateHumanizingConfig: typeof updateHumanizingConfig;
    resetHumanizingConfig: typeof resetHumanizingConfig;
    getEffectiveRate: typeof getEffectiveRate;
    shouldApplyFeature: typeof shouldApplyFeature;
    applyPreset: typeof applyPreset;
    getRecommendedPreset: typeof getRecommendedPreset;
    registerBundleHumanization: typeof registerBundleHumanization;
    getPersonaHumanizingConfig: typeof getPersonaHumanizingConfig;
    getPersonaContextModifiers: typeof getPersonaContextModifiers;
    clearPersonaConfigs: typeof clearPersonaConfigs;
    HUMANIZING_PRESETS: {
        /**
         * Minimal - Very subtle humanization
         * Good for: formal/professional interactions, efficiency-focused users
         */
        minimal: DeepPartial<HumanizingConfig>;
        /**
         * Natural - Balanced, production-ready
         * Good for: most conversations, general users
         * TUNED to match DEFAULT_CONFIG
         */
        natural: DeepPartial<HumanizingConfig>;
        /**
         * Conversational - More casual, friendly
         * Good for: Jordan, Peter, relationship-building
         */
        conversational: DeepPartial<HumanizingConfig>;
        /**
         * Therapeutic - For supportive, coaching personas
         * Good for: Ferni, emotional support, coaching moments
         * TUNED: More patience, gentler interventions
         */
        therapeutic: DeepPartial<HumanizingConfig>;
        /**
         * Expert - For authoritative personas
         * Good for: Jack Bogle, financial expertise, decisiveness
         */
        expert: DeepPartial<HumanizingConfig>;
        /**
         * Warm - For friendly, approachable personas
         * Good for: Maya, Alex, building rapport
         */
        warm: DeepPartial<HumanizingConfig>;
        /**
         * Disabled - All humanization off (for testing)
         */
        disabled: DeepPartial<HumanizingConfig>;
    };
};
export default _default;
//# sourceMappingURL=humanizing-config.d.ts.map