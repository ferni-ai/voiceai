/**
 * Humanization Configuration
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Centralized configuration for all humanization features.
 * These values can be tuned based on analytics and A/B testing.
 *
 * @module @ferni/humanization/config
 */
export interface HumanizationConfig {
    enabled: boolean;
    debugMode: boolean;
    features: {
        voicePrint: boolean;
        crossSessionMemory: boolean;
        breathingSync: boolean;
        emotionalLeading: boolean;
        ambientAwareness: boolean;
        selfCorrection: boolean;
        disfluency: boolean;
        fillerWords: boolean;
        hedging: boolean;
        catchingYourself: boolean;
        phoneticMirroring: boolean;
        vocalFatigue: boolean;
        comfortProgression: boolean;
    };
    probabilities: {
        selfCorrection: number;
        disfluency: number;
        fillerWords: number;
        hedging: number;
        catchingYourself: number;
        voiceStateInsight: number;
        crossSessionAck: number;
        emotionalLeading: number;
        breathingSync: number;
        ambientAck: number;
    };
    confidenceThresholds: {
        voicePrint: number;
        breathing: number;
        emotion: number;
        ambient: number;
    };
    timing: {
        minTimeBetweenDisfluencies: number;
        minTimeBetweenSelfCorrections: number;
        minTimeBetweenAmbientAcks: number;
        voiceInsightCooldown: number;
        crossSessionAckCooldown: number;
    };
    comfortThresholds: {
        allowHedging: number;
        allowSelfCorrection: number;
        allowDisfluency: number;
        allowFillerWords: number;
        allowEmotionalLeading: number;
        allowVoiceInsights: number;
        allowBreathingSync: number;
        allowDeepVulnerability: number;
    };
    voicePrint: {
        sampleCountForCalibration: number;
        deviationThresholdForInsight: number;
        significantDeviationThreshold: number;
    };
    breathingSync: {
        minConfidence: number;
        maxSyncStrength: number;
        adaptationRate: number;
        naturalBreathsPerMinute: number;
    };
    emotionalLeading: {
        maxLeadingIntensity: number;
        leadingStepSize: number;
        minTurnsBeforeLeading: number;
    };
    analytics: {
        enabled: boolean;
        sampleRate: number;
        maxEventsInMemory: number;
    };
}
export declare const DEFAULT_HUMANIZATION_CONFIG: HumanizationConfig;
/**
 * Conservative preset - fewer humanizations, higher thresholds
 * Good for new users or formal contexts
 */
export declare const CONSERVATIVE_CONFIG: Partial<HumanizationConfig>;
/**
 * Expressive preset - more humanizations, lower thresholds
 * Good for established relationships
 */
export declare const EXPRESSIVE_CONFIG: Partial<HumanizationConfig>;
/**
 * Minimal preset - essential humanizations only
 * Good for low-latency or performance-sensitive scenarios
 */
export declare const MINIMAL_CONFIG: Partial<HumanizationConfig>;
declare class HumanizationConfigManager {
    private config;
    private overrides;
    constructor(baseConfig?: HumanizationConfig);
    /**
     * Get current configuration
     */
    getConfig(): HumanizationConfig;
    /**
     * Get a specific probability
     */
    getProbability(key: keyof HumanizationConfig['probabilities']): number;
    /**
     * Check if a feature is enabled
     */
    isFeatureEnabled(feature: keyof HumanizationConfig['features']): boolean;
    /**
     * Get confidence threshold
     */
    getConfidenceThreshold(key: keyof HumanizationConfig['confidenceThresholds']): number;
    /**
     * Get comfort threshold for a behavior
     */
    getComfortThreshold(behavior: keyof HumanizationConfig['comfortThresholds']): number;
    /**
     * Apply a preset configuration
     */
    applyPreset(preset: 'conservative' | 'expressive' | 'minimal'): void;
    /**
     * Set runtime overrides
     */
    setOverrides(overrides: Partial<HumanizationConfig>): void;
    /**
     * Update a specific probability at runtime
     */
    setProbability(key: keyof HumanizationConfig['probabilities'], value: number): void;
    /**
     * Enable/disable a feature at runtime
     */
    setFeatureEnabled(feature: keyof HumanizationConfig['features'], enabled: boolean): void;
    /**
     * Reset to defaults
     */
    reset(): void;
    /**
     * Export current config for debugging/persistence
     */
    exportConfig(): HumanizationConfig;
    /**
     * Import config (for persistence)
     */
    importConfig(config: Partial<HumanizationConfig>): void;
    private mergeConfigs;
}
export declare function getHumanizationConfig(): HumanizationConfigManager;
export declare function resetHumanizationConfig(): void;
export declare const humanizationConfig: {
    get: () => HumanizationConfig;
    getProbability: (key: keyof HumanizationConfig["probabilities"]) => number;
    isEnabled: (feature: keyof HumanizationConfig["features"]) => boolean;
    applyPreset: (preset: "conservative" | "expressive" | "minimal") => void;
    setProbability: (key: keyof HumanizationConfig["probabilities"], value: number) => void;
    setEnabled: (feature: keyof HumanizationConfig["features"], enabled: boolean) => void;
    reset: () => void;
};
export type { HumanizationConfigManager };
//# sourceMappingURL=config.d.ts.map