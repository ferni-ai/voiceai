/**
 * Feature Flags Service
 *
 * Enables gradual rollout of trust systems with kill switches.
 * Supports:
 * - Global enable/disable
 * - Percentage-based rollout
 * - User-level overrides
 * - Real-time updates (no deploy required)
 *
 * @module FeatureFlags
 */
export interface FeatureFlag {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    rolloutPercentage: number;
    percentage?: number;
    type?: string;
    userOverrides: Map<string, boolean>;
    createdAt: Date;
    updatedAt: Date;
}
export interface FlagConfig {
    enabled: boolean;
    percentage: number;
    overrides?: Record<string, boolean>;
}
export declare const TRUST_FLAGS: {
    readonly 'trust.reading-between-lines': "Detect unspoken emotional cues";
    readonly 'trust.boundary-memory': "Remember topics to avoid";
    readonly 'trust.growth-reflection': "Notice user evolution over time";
    readonly 'trust.inside-jokes': "Track shared moments for callbacks";
    readonly 'trust.small-wins': "Celebrate effort and progress";
    readonly 'trust.thinking-of-you': "Proactive check-ins";
    readonly 'trust.relationship-health': "Relationship health scoring";
    readonly 'trust.conversation-starters': "Context-aware greetings";
    readonly 'trust.life-events': "Detect and track life events";
    readonly 'trust.response-tuning': "Dynamic response style adjustment";
    readonly 'trust.celebration-momentum': "Win streaks and momentum";
    readonly 'trust.sentiment-timeline': "Emotional journey tracking";
    readonly 'trust.voice-prosody': "Voice pattern learning";
    readonly 'trust.journaling-prompts': "Contextual journaling";
    readonly 'trust.seasonal-awareness': "Seasonal pattern adaptation";
    readonly 'trust.learning-style': "Learning style adaptation";
    readonly 'trust.insights-reports': "Relationship insights reports";
    readonly 'trust.media-suggestions': "Contextual media suggestions";
    readonly 'trust.persistence': "Save/load trust profiles";
    readonly 'trust.cross-device-sync': "Real-time cross-device sync";
    readonly 'trust.notifications': "Proactive notifications";
    readonly 'landing-ai-live-chat': "AI chat widget on landing page (10 msg limit)";
    readonly 'landing-ai-persona-previews': "Team member preview cards on hover";
    readonly 'landing-ai-smart-faq': "AI-powered FAQ with related questions";
    readonly 'landing-ai-personalized-hero': "Dynamic hero content based on context";
    readonly 'landing-ai-social-proof': "Dynamic social proof snippets";
    readonly 'landing-ai-hover-previews': "What would Ferni say tooltips";
    readonly 'landing-ai-voice-samples': "Audio demos of persona voices";
    readonly 'landing-ai-micro-expressions': "Orb reactions to user behavior";
    readonly 'landing-ai-memory-demo': "Interactive memory visualization";
    readonly 'landing-ai-sentiment-copy': "Sentiment-reactive CTA copy";
};
export type TrustFlagId = keyof typeof TRUST_FLAGS;
/**
 * Check if a feature flag is enabled for a specific user
 */
export declare function isEnabled(flagId: TrustFlagId, userId?: string): boolean;
/**
 * Get flag configuration
 */
export declare function getFlag(flagId: TrustFlagId): FlagConfig;
/**
 * Get all flags with their current status
 */
export declare function getAllFlags(): Record<TrustFlagId, FlagConfig & {
    description: string;
}>;
/**
 * Update a flag configuration
 */
export declare function setFlag(flagId: TrustFlagId, config: Partial<FlagConfig>): Promise<void>;
/**
 * Set user override for a flag
 */
export declare function setUserOverride(flagId: TrustFlagId, userId: string, enabled: boolean): Promise<void>;
/**
 * Remove user override
 */
export declare function removeUserOverride(flagId: TrustFlagId, userId: string): Promise<void>;
/**
 * Enable a flag for all users
 */
export declare function enableFlag(flagId: TrustFlagId): Promise<void>;
/**
 * Disable a flag for all users (kill switch)
 */
export declare function disableFlag(flagId: TrustFlagId): Promise<void>;
/**
 * Set rollout percentage
 */
export declare function setRolloutPercentage(flagId: TrustFlagId, percentage: number): Promise<void>;
/**
 * Enable all trust system flags
 */
export declare function enableAllTrustFlags(): Promise<void>;
/**
 * Disable all trust system flags (emergency kill switch)
 */
export declare function disableAllTrustFlags(): Promise<void>;
/**
 * Reset all flags to defaults
 */
export declare function resetToDefaults(): Promise<void>;
/**
 * Initialize feature flags from Firestore
 */
export declare function initializeFeatureFlags(): Promise<void>;
/**
 * Refresh flags from Firestore
 */
export declare function refreshFlags(): Promise<void>;
/**
 * Execute callback only if flag is enabled
 */
export declare function withFlag<T>(flagId: TrustFlagId, userId: string | undefined, callback: () => T, fallback?: T): T | undefined;
/**
 * Async version of withFlag
 */
export declare function withFlagAsync<T>(flagId: TrustFlagId, userId: string | undefined, callback: () => Promise<T>, fallback?: T): Promise<T | undefined>;
/**
 * Get simple utilities configuration
 * Stub: Returns default config
 */
export declare function getSimpleUtilitiesConfig(): Record<string, boolean>;
/**
 * Get feature flags service object
 * Returns an object with all flag management methods
 */
export declare function getFeatureFlags(): {
    getAllFlags: () => (FlagConfig & {
        description: string;
    })[];
    getCategories: () => string[];
    getFlag: (flagId: string) => FlagConfig;
    createFlag: (flag: Partial<FeatureFlag>) => Promise<void>;
    updateFlag: (id: string, updates: Partial<FeatureFlag>) => Promise<FlagConfig>;
    deleteFlag: (_id: string) => Promise<boolean>;
    reload: () => Promise<void>;
    isEnabled: typeof isEnabled;
};
declare const _default: {
    isEnabled: typeof isEnabled;
    getFlag: typeof getFlag;
    getAllFlags: typeof getAllFlags;
    setFlag: typeof setFlag;
    setUserOverride: typeof setUserOverride;
    removeUserOverride: typeof removeUserOverride;
    enableFlag: typeof enableFlag;
    disableFlag: typeof disableFlag;
    setRolloutPercentage: typeof setRolloutPercentage;
    enableAllTrustFlags: typeof enableAllTrustFlags;
    disableAllTrustFlags: typeof disableAllTrustFlags;
    resetToDefaults: typeof resetToDefaults;
    initializeFeatureFlags: typeof initializeFeatureFlags;
    refreshFlags: typeof refreshFlags;
    withFlag: typeof withFlag;
    withFlagAsync: typeof withFlagAsync;
    TRUST_FLAGS: {
        readonly 'trust.reading-between-lines': "Detect unspoken emotional cues";
        readonly 'trust.boundary-memory': "Remember topics to avoid";
        readonly 'trust.growth-reflection': "Notice user evolution over time";
        readonly 'trust.inside-jokes': "Track shared moments for callbacks";
        readonly 'trust.small-wins': "Celebrate effort and progress";
        readonly 'trust.thinking-of-you': "Proactive check-ins";
        readonly 'trust.relationship-health': "Relationship health scoring";
        readonly 'trust.conversation-starters': "Context-aware greetings";
        readonly 'trust.life-events': "Detect and track life events";
        readonly 'trust.response-tuning': "Dynamic response style adjustment";
        readonly 'trust.celebration-momentum': "Win streaks and momentum";
        readonly 'trust.sentiment-timeline': "Emotional journey tracking";
        readonly 'trust.voice-prosody': "Voice pattern learning";
        readonly 'trust.journaling-prompts': "Contextual journaling";
        readonly 'trust.seasonal-awareness': "Seasonal pattern adaptation";
        readonly 'trust.learning-style': "Learning style adaptation";
        readonly 'trust.insights-reports': "Relationship insights reports";
        readonly 'trust.media-suggestions': "Contextual media suggestions";
        readonly 'trust.persistence': "Save/load trust profiles";
        readonly 'trust.cross-device-sync': "Real-time cross-device sync";
        readonly 'trust.notifications': "Proactive notifications";
        readonly 'landing-ai-live-chat': "AI chat widget on landing page (10 msg limit)";
        readonly 'landing-ai-persona-previews': "Team member preview cards on hover";
        readonly 'landing-ai-smart-faq': "AI-powered FAQ with related questions";
        readonly 'landing-ai-personalized-hero': "Dynamic hero content based on context";
        readonly 'landing-ai-social-proof': "Dynamic social proof snippets";
        readonly 'landing-ai-hover-previews': "What would Ferni say tooltips";
        readonly 'landing-ai-voice-samples': "Audio demos of persona voices";
        readonly 'landing-ai-micro-expressions': "Orb reactions to user behavior";
        readonly 'landing-ai-memory-demo': "Interactive memory visualization";
        readonly 'landing-ai-sentiment-copy': "Sentiment-reactive CTA copy";
    };
    getFeatureFlags: typeof getFeatureFlags;
    getSimpleUtilitiesConfig: typeof getSimpleUtilitiesConfig;
};
export default _default;
//# sourceMappingURL=feature-flags.d.ts.map