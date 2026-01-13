/**
 * Orchestrator Configuration Adapter
 *
 * Bridges the new unified orchestrator with existing humanization config systems:
 * - humanization/config.ts (HumanizationConfig)
 * - humanizing-config.ts (HumanizingConfig)
 * - services/feature-flags.ts (TrustFlags)
 *
 * This adapter ensures backward compatibility while providing a single entry point
 * for orchestrator configuration.
 *
 * @module @ferni/conversation/orchestrator/config-adapter
 */
import { type HumanizationConfig } from '../humanization/config.js';
import { type HumanizingConfig } from '../humanizing-config.js';
import type { OrchestratorConfig } from './types.js';
/**
 * Unified feature state combining all config sources
 */
export interface UnifiedFeatureState {
    orchestrator: {
        enableAnalysis: boolean;
        enableIntelligence: boolean;
        enableHumanization: boolean;
    };
    speech: {
        disfluency: boolean;
        hedging: boolean;
        backchannel: boolean;
        memory: boolean;
        questions: boolean;
        emotional: boolean;
    };
    advanced: {
        voicePrint: boolean;
        crossSessionMemory: boolean;
        breathingSync: boolean;
        emotionalLeading: boolean;
        ambientAwareness: boolean;
        selfCorrection: boolean;
        phoneticMirroring: boolean;
        vocalFatigue: boolean;
        comfortProgression: boolean;
    };
    orchestratorFeatures: {
        speechNaturalization: boolean;
        vocalHumanization: boolean;
        advancedHumanization: boolean;
        deepHumanization: boolean;
        sessionIntelligence: boolean;
        betterThanHuman: boolean;
        contentDeliveryPacing: boolean;
        silencePresence: boolean;
        /** NEW: Composable effects system */
        composableEffects: boolean;
    };
}
/**
 * Preset for the unified system
 */
export type UnifiedPreset = 'default' | 'minimal' | 'conservative' | 'expressive' | 'therapeutic' | 'expert' | 'warm' | 'conversational' | 'disabled';
declare class OrchestratorConfigAdapter {
    private personaId;
    private orchestratorOverrides;
    /**
     * Get the unified feature state from all config sources
     */
    getFeatureState(): UnifiedFeatureState;
    /**
     * Build orchestrator-specific features from underlying configs
     */
    private getOrchestratorFeatures;
    /**
     * Generate OrchestratorConfig from current state
     */
    buildOrchestratorConfig(): OrchestratorConfig;
    /**
     * Enable a specific orchestrator feature
     */
    enableFeature(feature: keyof OrchestratorConfig['features']): void;
    /**
     * Disable a specific orchestrator feature
     */
    disableFeature(feature: keyof OrchestratorConfig['features']): void;
    /**
     * Check if a feature is enabled
     */
    isFeatureEnabled(feature: keyof OrchestratorConfig['features']): boolean;
    /**
     * Check if an advanced humanization feature is enabled
     */
    isAdvancedFeatureEnabled(feature: keyof HumanizationConfig['features']): boolean;
    /**
     * Check if a speech humanization feature is enabled
     */
    isSpeechFeatureEnabled(feature: 'disfluency' | 'hedging' | 'backchannel' | 'memory' | 'questions' | 'emotional'): boolean;
    /**
     * Apply a unified preset across all config systems
     */
    applyPreset(preset: UnifiedPreset): void;
    /**
     * Apply orchestrator-specific preset settings
     */
    private applyOrchestratorPreset;
    /**
     * Set the current persona for persona-specific config
     */
    setPersona(personaId: string): void;
    /**
     * Get recommended preset for a persona
     */
    getRecommendedPreset(personaId: string): UnifiedPreset;
    /**
     * Get probability for a humanization feature
     */
    getProbability(feature: 'selfCorrection' | 'disfluency' | 'fillerWords' | 'hedging' | 'catchingYourself' | 'backchannel' | 'memory' | 'questions'): number;
    /**
     * Set probability for a humanization feature
     */
    setProbability(feature: keyof HumanizationConfig['probabilities'], value: number): void;
    /**
     * Reset all config to defaults
     */
    reset(): void;
    /**
     * Get full config state for debugging
     */
    getDebugState(): {
        featureState: UnifiedFeatureState;
        orchestratorConfig: OrchestratorConfig;
        humanizingConfig: HumanizingConfig;
        advancedConfig: HumanizationConfig;
        overrides: Partial<OrchestratorConfig['features']>;
        personaId: string | null;
    };
}
/**
 * Get the config adapter singleton
 */
export declare function getConfigAdapter(): OrchestratorConfigAdapter;
/**
 * Reset the config adapter
 */
export declare function resetConfigAdapter(): void;
/**
 * Quick access to feature state
 */
export declare const orchestratorConfig: {
    /** Get unified feature state */
    getState: () => UnifiedFeatureState;
    /** Build OrchestratorConfig */
    build: () => OrchestratorConfig;
    /** Check if a feature is enabled */
    isEnabled: (feature: keyof OrchestratorConfig["features"]) => boolean;
    /** Enable a feature */
    enable: (feature: keyof OrchestratorConfig["features"]) => void;
    /** Disable a feature */
    disable: (feature: keyof OrchestratorConfig["features"]) => void;
    /** Apply a preset */
    applyPreset: (preset: UnifiedPreset) => void;
    /** Set persona for persona-specific config */
    setPersona: (personaId: string) => void;
    /** Get recommended preset for persona */
    getRecommendedPreset: (personaId: string) => UnifiedPreset;
    /** Get probability */
    getProbability: (feature: Parameters<OrchestratorConfigAdapter["getProbability"]>[0]) => number;
    /** Reset to defaults */
    reset: () => void;
    /** Get debug state */
    debug: () => {
        featureState: UnifiedFeatureState;
        orchestratorConfig: OrchestratorConfig;
        humanizingConfig: HumanizingConfig;
        advancedConfig: HumanizationConfig;
        overrides: Partial<OrchestratorConfig["features"]>;
        personaId: string | null;
    };
};
export type { OrchestratorConfigAdapter };
//# sourceMappingURL=config-adapter.d.ts.map