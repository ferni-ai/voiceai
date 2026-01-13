/**
 * Personal Context Integrator
 *
 * Phase 2: Personal Memory Integration
 *
 * This module integrates user trigger profiles with the semantic trigger matching
 * system. It provides context boosts based on:
 * - Upcoming significant dates (birthdays, anniversaries)
 * - Relationship mentions in current text
 * - Communication pattern matches
 * - Temporal context (late night, returning after absence)
 *
 * @module PersonalContextIntegrator
 */
import type { UserTriggerProfile, SignificantDate, Relationship } from './user-trigger-profile.types.js';
import type { HybridMatchResult, TriggerContext } from './types.js';
export interface PersonalContextConfig {
    /** Maximum boost multiplier for trigger scores */
    maxBoostMultiplier: number;
    /** Days before a date to start boosting */
    dateProximityDays: number;
    /** Weight for relationship-based boosts */
    relationshipBoostWeight: number;
    /** Weight for communication pattern boosts */
    patternBoostWeight: number;
    /** Weight for temporal context boosts */
    temporalBoostWeight: number;
    /** Enable integration */
    enabled: boolean;
}
export declare const DEFAULT_PERSONAL_CONTEXT_CONFIG: PersonalContextConfig;
export interface PersonalContextBoost {
    /** Overall boost multiplier (1.0 = no boost) */
    overallMultiplier: number;
    /** Category-specific boosts */
    categoryBoosts: Record<string, number>;
    /** Specific triggers to boost */
    triggerBoosts: Array<{
        triggerName: string;
        boost: number;
        reason: string;
    }>;
    /** Context that was applied */
    appliedContext: {
        upcomingDates: SignificantDate[];
        mentionedRelationships: Relationship[];
        detectedPatterns: string[];
        temporalFlags: string[];
    };
    /** Processing metadata */
    metadata: {
        profileAge: number;
        processingTimeMs: number;
    };
}
/**
 * Generate personal context boost based on user profile and current input
 */
export declare function generatePersonalContextBoost(text: string, profile: UserTriggerProfile, triggerContext: TriggerContext, config?: PersonalContextConfig): PersonalContextBoost;
/**
 * Apply personal context boost to match results
 */
export declare function applyPersonalContextBoost(matchResult: HybridMatchResult, contextBoost: PersonalContextBoost): HybridMatchResult;
declare const _default: {
    generatePersonalContextBoost: typeof generatePersonalContextBoost;
    applyPersonalContextBoost: typeof applyPersonalContextBoost;
    DEFAULT_PERSONAL_CONTEXT_CONFIG: PersonalContextConfig;
};
export default _default;
//# sourceMappingURL=personal-context-integrator.d.ts.map