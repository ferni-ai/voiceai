/**
 * Relationship Stage Types - Consolidated
 *
 * This file consolidates all relationship stage definitions to prevent
 * inconsistencies across the codebase.
 *
 * ⚠️ IMPORTANT: There are TWO stage systems in Ferni:
 *
 * 1. **Team Unlock Stages** (UI, team member unlocking, feature gating)
 *    - first-meeting, getting-started, building-trust, established, deep-partnership
 *    - Tracked by: conversations, days, streak
 *    - Files: relationship-stage.service.ts, team-unlock.service.ts, team-unlocks.ts
 *
 * 2. **Persona Behavior Stages** (how personas behave in conversation)
 *    - stranger, acquaintance, friend, trusted_confidant
 *    - Tracked by: turns, sessions, key moments, vulnerability
 *    - Files: relationship-triggers.json, relationship-stages.json
 *
 * These systems are INTENTIONALLY DIFFERENT:
 * - Team Unlock is slower (higher thresholds) for monetization/retention
 * - Persona Behavior is faster (lower thresholds) for immediate warmth
 *
 * This file provides:
 * 1. Type definitions for both systems
 * 2. Conversion utilities between formats
 * 3. Stage progression logic
 * 4. Type guards
 *
 * Philosophy: The relationship should feel like a real friendship developing.
 */
/**
 * Team Unlock Stage - Used for UI, team member unlocking, and feature gating.
 *
 * This is the PRIMARY stage system users see in the app.
 *
 * Stage Thresholds (MUST be kept in sync with):
 * - apps/web/src/services/relationship-stage.service.ts
 * - apps/web/src/services/team-unlock.service.ts
 * - src/services/team-unlocks.ts
 * - src/api/routes/relationship.ts
 *
 * | Stage           | Conversations | Days | Streak | Unlocks          |
 * |-----------------|---------------|------|--------|------------------|
 * | first-meeting   | 0             | 0    | 0      | Ferni            |
 * | getting-started | 10            | 0    | 0      | +Maya            |
 * | building-trust  | 15            | 5    | 3      | +Peter           |
 * | established     | 30            | 21   | 7      | +Alex, +Jordan   |
 * | deep-partnership| 60            | 45   | 14     | +Nayan (premium) |
 */
export type TeamUnlockStage = 'first-meeting' | 'getting-started' | 'building-trust' | 'established' | 'deep-partnership';
export declare const TEAM_UNLOCK_THRESHOLDS: Record<TeamUnlockStage, {
    minConversations: number;
    minDays: number;
    minStreak: number;
}>;
export declare const TEAM_UNLOCK_STAGE_ORDER: TeamUnlockStage[];
export declare const TEAM_UNLOCK_STAGE_LEVELS: Record<TeamUnlockStage, number>;
/**
 * Check if a stage is at or beyond a target stage
 */
export declare function teamUnlockStageAtOrBeyond(current: TeamUnlockStage, target: TeamUnlockStage): boolean;
/**
 * Type guard for TeamUnlockStage
 */
export declare function isTeamUnlockStage(value: unknown): value is TeamUnlockStage;
/**
 * Persona Behavior Stage - Used for how personas engage in conversation.
 *
 * This is SEPARATE from Team Unlock stages because:
 * - We want personas to feel warm quickly (lower thresholds)
 * - Team unlocks are slower for retention/monetization (higher thresholds)
 *
 * Stage Descriptions:
 * - stranger: First 1-2 interactions. Still learning basics about each other.
 * - acquaintance: Getting to know (3-5 interactions). Establishing comfort.
 * - friend: Comfortable relationship (6+ interactions, shared moments).
 * - trusted_confidant: Deep relationship (many interactions, vulnerability shared).
 *
 * Note: We use "trusted_confidant" instead of "trusted_advisor" to emphasize
 * the relationship aspect over the transactional advisory aspect.
 */
export type PersonaBehaviorStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_confidant';
export type RelationshipStage = PersonaBehaviorStage;
/**
 * Numeric stage for comparisons and progression
 */
export declare const STAGE_LEVELS: Record<RelationshipStage, number>;
/**
 * Human-readable descriptions for each stage
 */
export declare const STAGE_DESCRIPTIONS: Record<RelationshipStage, string>;
/**
 * Thresholds for stage progression
 */
export interface StageThresholds {
    minConversations: number;
    minMinutesTalked: number;
    minKeyMoments: number;
    minVulnerabilityMoments: number;
}
export declare const STAGE_THRESHOLDS: Record<RelationshipStage, StageThresholds>;
/**
 * Legacy relationship stage from UserProfile.
 * @deprecated Use RelationshipStage instead. This exists for migration.
 */
export type LegacyRelationshipStage = 'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend';
/**
 * Humanizing-style relationship stage.
 * @deprecated Use RelationshipStage instead. This exists for migration.
 */
export type HumanizingRelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
/**
 * Maps Team Unlock stages → Persona Behavior stages.
 *
 * This mapping exists because:
 * - User might be at "building-trust" in UI (15 convos, 5 days, 3-day streak)
 * - But we want the persona to behave as a "friend" (warm, personal)
 *
 * The mapping is INTENTIONALLY generous - we want warmth to come before
 * unlocks. A user at "getting-started" already gets "acquaintance" warmth.
 */
export declare function teamUnlockToPersonaBehavior(unlock: TeamUnlockStage): PersonaBehaviorStage;
/**
 * Maps Persona Behavior stages → Team Unlock stages.
 *
 * This is the REVERSE mapping. Note that "friend" maps to "building-trust"
 * even though "established" also uses "friend" behavior. This gives the
 * minimum team unlock stage for that behavior level.
 */
export declare function personaBehaviorToTeamUnlock(behavior: PersonaBehaviorStage): TeamUnlockStage;
/**
 * Convert legacy stage to canonical stage
 */
export declare function fromLegacyStage(legacy: LegacyRelationshipStage): RelationshipStage;
/**
 * Convert canonical stage to legacy stage (for backward compatibility)
 */
export declare function toLegacyStage(stage: RelationshipStage): LegacyRelationshipStage;
/**
 * Convert humanizing-style stage to canonical stage
 */
export declare function fromHumanizingStage(humanizing: HumanizingRelationshipStage): RelationshipStage;
/**
 * Convert canonical stage to humanizing-style stage
 */
export declare function toHumanizingStage(stage: RelationshipStage): HumanizingRelationshipStage;
/**
 * Parameters for calculating relationship stage
 */
export interface RelationshipMetrics {
    conversationCount: number;
    totalMinutesTalked: number;
    keyMomentsCount: number;
    vulnerabilityMomentsCount: number;
}
/**
 * Calculate relationship stage based on interaction metrics.
 *
 * The calculation considers:
 * - Number of conversations (frequency of engagement)
 * - Total time talked (depth of individual conversations)
 * - Key moments (meaningful exchanges)
 * - Vulnerability moments (trust indicators)
 *
 * A user must meet ALL thresholds for a stage, not just some.
 */
export declare function calculateStage(metrics: RelationshipMetrics): RelationshipStage;
/**
 * Check if metrics qualify for a specific stage
 */
export declare function meetsStageRequirements(stage: RelationshipStage, metrics: RelationshipMetrics): boolean;
/**
 * Get progress toward next stage (0-100%)
 */
export declare function getProgressToNextStage(currentStage: RelationshipStage, metrics: RelationshipMetrics): {
    nextStage: RelationshipStage | null;
    progress: number;
    missingRequirements: string[];
};
/**
 * Check if a string is a valid RelationshipStage
 */
export declare function isRelationshipStage(value: unknown): value is RelationshipStage;
/**
 * Check if a string is a legacy relationship stage
 */
export declare function isLegacyRelationshipStage(value: unknown): value is LegacyRelationshipStage;
/**
 * Check if a string is a humanizing relationship stage
 */
export declare function isHumanizingRelationshipStage(value: unknown): value is HumanizingRelationshipStage;
/**
 * Check if stage A is at least as deep as stage B
 */
export declare function isAtLeast(stageA: RelationshipStage, stageB: RelationshipStage): boolean;
/**
 * Check if stage A is deeper than stage B
 */
export declare function isDeeperThan(stageA: RelationshipStage, stageB: RelationshipStage): boolean;
/**
 * Get the next stage (or null if already at max)
 */
export declare function getNextStage(stage: RelationshipStage): RelationshipStage | null;
/**
 * Get the previous stage (or null if already at min)
 */
export declare function getPreviousStage(stage: RelationshipStage): RelationshipStage | null;
/**
 * Emotional bond tracking - how the persona feels about this specific user.
 * This grows and deepens over time, creating genuine connection.
 */
export interface EmotionalBond {
    /** Overall warmth/fondness (0-1) - grows with positive interactions */
    warmth: number;
    /** Trust level (0-1) - grows with honesty and consistency */
    trust: number;
    /** Protectiveness (0-1) - rises when user shares struggles */
    protectiveness: number;
    /** Admiration (0-1) - grows when user shows growth or courage */
    admiration: number;
    /** Concern level (0-1) - rises during difficult periods */
    concern: number;
    /** How many sessions together */
    sessionCount: number;
    /** When we first met */
    firstInteraction: Date;
    /** Memorable emotional moments we've shared */
    memorableEmotions: EmotionalSnapshot[];
    /** Peak moments in our relationship */
    relationshipPeaks: RelationshipPeak[];
}
export interface EmotionalSnapshot {
    /** When this happened */
    date: Date;
    /** What emotion we felt */
    emotion: 'moved' | 'proud' | 'worried' | 'delighted' | 'protective' | 'grateful' | 'inspired';
    /** What triggered it */
    trigger: string;
    /** Context (topic being discussed) */
    topic?: string;
    /** How intense (0-1) */
    intensity: number;
}
export interface RelationshipPeak {
    /** When */
    date: Date;
    /** Type of peak moment */
    type: 'breakthrough' | 'vulnerability_shared' | 'milestone' | 'laughter' | 'deep_connection';
    /** Brief description */
    description: string;
}
//# sourceMappingURL=relationship-stages.d.ts.map