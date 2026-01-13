/**
 * Effect Feature Flags
 *
 * Feature flag integration for gradual rollout of the effects system.
 *
 * @module @ferni/conversation/effects/feature-flags
 */
export interface EffectFeatureConfig {
    /** Is the composable effects system enabled? */
    composableEffectsEnabled: boolean;
    /** Individual effect toggles */
    effects: {
        breathSound: boolean;
        physicalPresence: boolean;
        spontaneousThought: boolean;
        firstTurnNotice: boolean;
        excitementInterruption: boolean;
        liveReaction: boolean;
        playfulness: boolean;
        speechFiller: boolean;
    };
    /** Rollout percentage (0-100) */
    rolloutPercentage: number;
    /** Personas with effects enabled */
    enabledPersonas: string[];
    /** User IDs in the experiment */
    experimentUserIds: string[];
}
declare class EffectFeatureFlags {
    private config;
    constructor(initialConfig?: Partial<EffectFeatureConfig>);
    /**
     * Check if composable effects system is enabled
     */
    isEnabled(): boolean;
    /**
     * Check if a specific effect is enabled
     */
    isEffectEnabled(effectId: string): boolean;
    /**
     * Check if effects are enabled for a specific user
     */
    isEnabledForUser(userId: string): boolean;
    /**
     * Check if effects are enabled for a specific persona
     */
    isEnabledForPersona(personaId: string): boolean;
    /**
     * Full check: is the effect system enabled for this context?
     */
    shouldApplyEffects(context: {
        userId?: string;
        personaId: string;
        sessionId: string;
    }): boolean;
    /**
     * Update feature flag config
     */
    updateConfig(updates: Partial<EffectFeatureConfig>): void;
    /**
     * Get current config
     */
    getConfig(): EffectFeatureConfig;
    /**
     * Simple hash function for consistent user assignment
     */
    private hashUserId;
}
export declare function getEffectFeatureFlags(): EffectFeatureFlags;
export declare function resetEffectFeatureFlags(): void;
export declare function configureEffectFeatureFlags(config: Partial<EffectFeatureConfig>): void;
export declare const effectFlags: {
    isEnabled: () => boolean;
    isEffectEnabled: (effectId: string) => boolean;
    isEnabledForUser: (userId: string) => boolean;
    isEnabledForPersona: (personaId: string) => boolean;
    shouldApplyEffects: (context: {
        userId?: string;
        personaId: string;
        sessionId: string;
    }) => boolean;
    configure: (config: Partial<EffectFeatureConfig>) => void;
    getConfig: () => EffectFeatureConfig;
};
export {};
//# sourceMappingURL=feature-flags.d.ts.map