/**
 * Revelation Moments Types
 *
 * > "The capability is felt, not explained."
 *
 * Tracks when users FIRST experience Ferni's superhuman capabilities,
 * ensuring we don't overwhelm or feel like surveillance.
 *
 * Philosophy:
 * - A real friend doesn't announce their capabilities
 * - Depth is EARNED through relationship
 * - Make them feel KNOWN, not TRACKED
 * - The best features are invisible infrastructure
 *
 * @module services/revelation-moments/types
 */
/**
 * Types of revelations (moments when a capability is first experienced)
 */
export type RevelationType = 'first_callback' | 'first_pattern_notice' | 'first_anticipation' | 'first_growth_reflection' | 'first_gentle_challenge' | 'first_life_arc' | 'first_team_handoff' | 'first_vulnerability_match' | 'first_inside_joke' | 'first_proactive_outreach';
/**
 * A single revelation moment
 */
export interface RevelationMoment {
    type: RevelationType;
    occurredAt: number;
    sessionId: string;
    personaId: string;
    /** Brief context of what triggered this revelation */
    context: string;
    /** How they responded (for learning) */
    userResponse?: 'positive' | 'neutral' | 'negative' | 'unknown';
}
/**
 * Complete revelation profile for a user
 */
export interface RevelationProfile {
    userId: string;
    /** Map of revelation type to first occurrence */
    revelations: Partial<Record<RevelationType, RevelationMoment>>;
    /** Current session's capability usage (for throttling) */
    currentSessionCapabilities: string[];
    /** Last session ID (to reset per-session throttling) */
    lastSessionId?: string;
    /** Total capabilities revealed */
    totalRevelations: number;
    /** When profile was created */
    createdAt: number;
    /** Last updated */
    updatedAt: number;
}
/**
 * Capability categories for throttling
 */
export type CapabilityCategory = 'memory' | 'pattern' | 'anticipation' | 'growth' | 'challenge' | 'synthesis' | 'team';
/**
 * Throttling rules per category
 */
export interface ThrottleRule {
    category: CapabilityCategory;
    /** Max uses per session */
    maxPerSession: number;
    /** Min sessions before this category is available */
    minSessionsRequired: number;
    /** Min trust level (0-1) before available */
    minTrustRequired?: number;
}
/**
 * Default throttle rules (conservative - better to under-impress than overwhelm)
 */
export declare const DEFAULT_THROTTLE_RULES: ThrottleRule[];
/**
 * Categories of surveillance-y language to avoid
 */
export type SurveillanceCategory = 'data_reference' | 'tracking_language' | 'statistics' | 'database_speak' | 'feature_announce';
/**
 * Pattern to detect and alternative to use
 */
export interface LanguagePattern {
    category: SurveillanceCategory;
    /** Regex or string to match */
    pattern: string | RegExp;
    /** What to say instead (if applicable) */
    alternative?: string;
    /** Severity: block entirely or just warn */
    severity: 'block' | 'warn';
}
/**
 * Permission prompt categories
 */
export type PermissionCategory = 'share_observation' | 'go_deeper' | 'challenge' | 'pattern_name' | 'vulnerability';
/**
 * Permission prompt with variations
 */
export interface PermissionPrompt {
    category: PermissionCategory;
    /** Variations to choose from (keeps it fresh) */
    prompts: string[];
    /** When this permission should be asked */
    useWhen: {
        minTrustLevel?: number;
        capabilities: CapabilityCategory[];
    };
}
/**
 * Create empty revelation profile
 */
export declare function createEmptyRevelationProfile(userId: string): RevelationProfile;
/**
 * Map revelation type to capability category
 */
export declare function revelationToCategory(type: RevelationType): CapabilityCategory;
/**
 * Get human-readable name for revelation type
 */
export declare function getRevelationName(type: RevelationType): string;
//# sourceMappingURL=types.d.ts.map