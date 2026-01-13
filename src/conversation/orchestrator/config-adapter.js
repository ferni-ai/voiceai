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
import { createLogger } from '../../utils/safe-logger.js';
// Import existing config systems
import { getHumanizationConfig, humanizationConfig, } from '../humanization/config.js';
import { applyPreset as applyHumanizingPreset, getHumanizingConfig, getPersonaHumanizingConfig, } from '../humanizing-config.js';
const log = createLogger({ module: 'OrchestratorConfigAdapter' });
// ============================================================================
// CONFIG ADAPTER CLASS
// ============================================================================
class OrchestratorConfigAdapter {
    personaId = null;
    orchestratorOverrides = {};
    // ==========================================================================
    // FEATURE STATE QUERIES
    // ==========================================================================
    /**
     * Get the unified feature state from all config sources
     */
    getFeatureState() {
        const humanizing = this.personaId
            ? getPersonaHumanizingConfig(this.personaId)
            : getHumanizingConfig();
        const advanced = getHumanizationConfig().getConfig();
        return {
            orchestrator: {
                enableAnalysis: true, // Always enabled
                enableIntelligence: true, // Always enabled
                enableHumanization: humanizing.global.enabled && advanced.enabled,
            },
            speech: {
                disfluency: humanizing.disfluency.enabled,
                hedging: humanizing.hedging.enabled,
                backchannel: humanizing.backchannel.enabled,
                memory: humanizing.memory.enabled,
                questions: humanizing.questions.enabled,
                emotional: humanizing.emotional.echoEnabled,
            },
            advanced: {
                voicePrint: advanced.features.voicePrint,
                crossSessionMemory: advanced.features.crossSessionMemory,
                breathingSync: advanced.features.breathingSync,
                emotionalLeading: advanced.features.emotionalLeading,
                ambientAwareness: advanced.features.ambientAwareness,
                selfCorrection: advanced.features.selfCorrection,
                phoneticMirroring: advanced.features.phoneticMirroring,
                vocalFatigue: advanced.features.vocalFatigue,
                comfortProgression: advanced.features.comfortProgression,
            },
            orchestratorFeatures: this.getOrchestratorFeatures(humanizing, advanced),
        };
    }
    /**
     * Build orchestrator-specific features from underlying configs
     */
    getOrchestratorFeatures(humanizing, advanced) {
        return {
            // Speech naturalization: enabled if disfluency or hedging is on
            speechNaturalization: this.orchestratorOverrides.speechNaturalization ??
                (humanizing.disfluency.enabled || humanizing.hedging.enabled),
            // Vocal humanization: always on if global is enabled
            vocalHumanization: this.orchestratorOverrides.vocalHumanization ?? humanizing.global.enabled,
            // Advanced humanization: self-correction, catching-yourself, etc.
            advancedHumanization: this.orchestratorOverrides.advancedHumanization ??
                (advanced.features.selfCorrection ||
                    advanced.features.disfluency ||
                    advanced.features.catchingYourself),
            // Deep humanization: mood drift, spontaneous thoughts
            deepHumanization: this.orchestratorOverrides.deepHumanization ?? humanizing.global.enabled,
            // Session intelligence: concern detection, predictions
            sessionIntelligence: this.orchestratorOverrides.sessionIntelligence ?? true,
            // Better than human: cross-session relationship building
            betterThanHuman: this.orchestratorOverrides.betterThanHuman ?? advanced.features.crossSessionMemory,
            // Content delivery pacing: for long responses
            contentDeliveryPacing: this.orchestratorOverrides.contentDeliveryPacing ?? true,
            // Silence presence: for heavy emotional moments
            silencePresence: this.orchestratorOverrides.silencePresence ?? humanizing.global.enabled,
            // NEW: Composable effects system (opt-in replacement for deep humanization)
            composableEffects: this.orchestratorOverrides.composableEffects ?? false,
        };
    }
    /**
     * Generate OrchestratorConfig from current state
     */
    buildOrchestratorConfig() {
        const state = this.getFeatureState();
        const humanizing = getHumanizingConfig();
        return {
            enableAnalysis: state.orchestrator.enableAnalysis,
            enableIntelligence: state.orchestrator.enableIntelligence,
            enableHumanization: state.orchestrator.enableHumanization,
            features: state.orchestratorFeatures,
            maxHumanizationsPerResponse: 3,
            maxPriorityActions: 2,
            debug: humanizing.global.debugLogging,
        };
    }
    // ==========================================================================
    // FEATURE TOGGLES
    // ==========================================================================
    /**
     * Enable a specific orchestrator feature
     */
    enableFeature(feature) {
        this.orchestratorOverrides[feature] = true;
        log.debug({ feature }, '✅ Orchestrator feature enabled');
    }
    /**
     * Disable a specific orchestrator feature
     */
    disableFeature(feature) {
        this.orchestratorOverrides[feature] = false;
        log.debug({ feature }, '❌ Orchestrator feature disabled');
    }
    /**
     * Check if a feature is enabled
     */
    isFeatureEnabled(feature) {
        const state = this.getFeatureState();
        return state.orchestratorFeatures[feature];
    }
    /**
     * Check if an advanced humanization feature is enabled
     */
    isAdvancedFeatureEnabled(feature) {
        return humanizationConfig.isEnabled(feature);
    }
    /**
     * Check if a speech humanization feature is enabled
     */
    isSpeechFeatureEnabled(feature) {
        const humanizing = getHumanizingConfig();
        switch (feature) {
            case 'disfluency':
                return humanizing.disfluency.enabled;
            case 'hedging':
                return humanizing.hedging.enabled;
            case 'backchannel':
                return humanizing.backchannel.enabled;
            case 'memory':
                return humanizing.memory.enabled;
            case 'questions':
                return humanizing.questions.enabled;
            case 'emotional':
                return humanizing.emotional.echoEnabled;
            default:
                return false;
        }
    }
    // ==========================================================================
    // PRESETS
    // ==========================================================================
    /**
     * Apply a unified preset across all config systems
     */
    applyPreset(preset) {
        // Map to humanizing presets
        const humanizingPresetMap = {
            default: 'natural',
            minimal: 'minimal',
            conservative: 'minimal',
            expressive: 'conversational',
            therapeutic: 'therapeutic',
            expert: 'expert',
            warm: 'warm',
            conversational: 'conversational',
            disabled: 'disabled',
        };
        const humanizingPreset = humanizingPresetMap[preset];
        if (humanizingPreset) {
            applyHumanizingPreset(humanizingPreset);
        }
        // Map to advanced humanization presets
        const advancedPresetMap = {
            default: null, // Keep defaults
            minimal: 'minimal',
            conservative: 'conservative',
            expressive: 'expressive',
            therapeutic: 'conservative', // More careful
            expert: 'conservative', // Confident, minimal hesitation
            warm: 'expressive', // More human
            conversational: 'expressive',
            disabled: 'minimal',
        };
        const advancedPreset = advancedPresetMap[preset];
        if (advancedPreset) {
            humanizationConfig.applyPreset(advancedPreset);
        }
        // Apply orchestrator-specific overrides based on preset
        this.applyOrchestratorPreset(preset);
        log.info({ preset }, '🎭 Unified preset applied');
    }
    /**
     * Apply orchestrator-specific preset settings
     */
    applyOrchestratorPreset(preset) {
        switch (preset) {
            case 'disabled':
                this.orchestratorOverrides = {
                    speechNaturalization: false,
                    vocalHumanization: false,
                    advancedHumanization: false,
                    deepHumanization: false,
                    sessionIntelligence: false,
                    betterThanHuman: false,
                    contentDeliveryPacing: false,
                    silencePresence: false,
                    composableEffects: false,
                };
                break;
            case 'minimal':
                this.orchestratorOverrides = {
                    speechNaturalization: true,
                    vocalHumanization: true,
                    advancedHumanization: false, // Skip advanced
                    deepHumanization: false, // Skip deep
                    sessionIntelligence: true,
                    betterThanHuman: true,
                    contentDeliveryPacing: false, // Skip for speed
                    silencePresence: false, // Skip for speed
                    composableEffects: false, // Not yet
                };
                break;
            case 'conservative':
                this.orchestratorOverrides = {
                    speechNaturalization: true,
                    vocalHumanization: true,
                    advancedHumanization: true,
                    deepHumanization: true,
                    sessionIntelligence: true,
                    betterThanHuman: true,
                    contentDeliveryPacing: true,
                    silencePresence: true,
                    composableEffects: false,
                };
                break;
            case 'therapeutic':
                this.orchestratorOverrides = {
                    speechNaturalization: true,
                    vocalHumanization: true,
                    advancedHumanization: true,
                    deepHumanization: true,
                    sessionIntelligence: true,
                    betterThanHuman: true,
                    contentDeliveryPacing: true,
                    silencePresence: true, // Important for emotional moments
                    composableEffects: false,
                };
                break;
            default:
                // Reset to derive from underlying configs
                this.orchestratorOverrides = {};
                break;
        }
    }
    // ==========================================================================
    // PERSONA-SPECIFIC CONFIG
    // ==========================================================================
    /**
     * Set the current persona for persona-specific config
     */
    setPersona(personaId) {
        this.personaId = personaId;
        log.debug({ personaId }, '🎭 Persona set for config adapter');
    }
    /**
     * Get recommended preset for a persona
     */
    getRecommendedPreset(personaId) {
        const presetMap = {
            // Therapeutic personas
            ferni: 'therapeutic',
            // Expert personas
            'nayan-patel': 'expert',
            'jack-b': 'expert',
            // Conversational personas
            'peter-john': 'conversational',
            'jordan-taylor': 'conversational',
            // Warm personas
            'maya-santos': 'warm',
            'alex-chen': 'warm',
            // Default
            'generic-advisor': 'default',
        };
        return presetMap[personaId.toLowerCase()] || 'default';
    }
    // ==========================================================================
    // PROBABILITIES
    // ==========================================================================
    /**
     * Get probability for a humanization feature
     */
    getProbability(feature) {
        // Check advanced config first
        const advancedProbabilities = humanizationConfig.get().probabilities;
        if (feature in advancedProbabilities) {
            return advancedProbabilities[feature] ?? 0;
        }
        // Then check humanizing config
        const humanizing = getHumanizingConfig();
        switch (feature) {
            case 'disfluency':
                return humanizing.disfluency.frequency;
            case 'hedging':
                return humanizing.hedging.adviceHedgingRate;
            case 'backchannel':
                return humanizing.backchannel.probability;
            case 'memory':
                return humanizing.memory.callbackProbability;
            case 'questions':
                return humanizing.questions.followUpProbability;
            default:
                return 0.1; // Default probability
        }
    }
    /**
     * Set probability for a humanization feature
     */
    setProbability(feature, value) {
        humanizationConfig.setProbability(feature, value);
        log.debug({ feature, value }, '📊 Probability updated');
    }
    // ==========================================================================
    // RESET
    // ==========================================================================
    /**
     * Reset all config to defaults
     */
    reset() {
        this.orchestratorOverrides = {};
        this.personaId = null;
        humanizationConfig.reset();
        log.info('🔄 Config adapter reset');
    }
    // ==========================================================================
    // DEBUG
    // ==========================================================================
    /**
     * Get full config state for debugging
     */
    getDebugState() {
        return {
            featureState: this.getFeatureState(),
            orchestratorConfig: this.buildOrchestratorConfig(),
            humanizingConfig: getHumanizingConfig(),
            advancedConfig: getHumanizationConfig().getConfig(),
            overrides: this.orchestratorOverrides,
            personaId: this.personaId,
        };
    }
}
// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================
let adapterInstance = null;
/**
 * Get the config adapter singleton
 */
export function getConfigAdapter() {
    if (!adapterInstance) {
        adapterInstance = new OrchestratorConfigAdapter();
    }
    return adapterInstance;
}
/**
 * Reset the config adapter
 */
export function resetConfigAdapter() {
    if (adapterInstance) {
        adapterInstance.reset();
    }
    adapterInstance = null;
}
// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================
/**
 * Quick access to feature state
 */
export const orchestratorConfig = {
    /** Get unified feature state */
    getState: () => getConfigAdapter().getFeatureState(),
    /** Build OrchestratorConfig */
    build: () => getConfigAdapter().buildOrchestratorConfig(),
    /** Check if a feature is enabled */
    isEnabled: (feature) => getConfigAdapter().isFeatureEnabled(feature),
    /** Enable a feature */
    enable: (feature) => getConfigAdapter().enableFeature(feature),
    /** Disable a feature */
    disable: (feature) => getConfigAdapter().disableFeature(feature),
    /** Apply a preset */
    applyPreset: (preset) => getConfigAdapter().applyPreset(preset),
    /** Set persona for persona-specific config */
    setPersona: (personaId) => getConfigAdapter().setPersona(personaId),
    /** Get recommended preset for persona */
    getRecommendedPreset: (personaId) => getConfigAdapter().getRecommendedPreset(personaId),
    /** Get probability */
    getProbability: (feature) => getConfigAdapter().getProbability(feature),
    /** Reset to defaults */
    reset: () => resetConfigAdapter(),
    /** Get debug state */
    debug: () => getConfigAdapter().getDebugState(),
};
//# sourceMappingURL=config-adapter.js.map