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
export const TEAM_UNLOCK_THRESHOLDS = {
    'first-meeting': { minConversations: 0, minDays: 0, minStreak: 0 },
    'getting-started': { minConversations: 10, minDays: 0, minStreak: 0 },
    'building-trust': { minConversations: 15, minDays: 5, minStreak: 3 },
    established: { minConversations: 30, minDays: 21, minStreak: 7 },
    'deep-partnership': { minConversations: 60, minDays: 45, minStreak: 14 },
};
export const TEAM_UNLOCK_STAGE_ORDER = [
    'first-meeting',
    'getting-started',
    'building-trust',
    'established',
    'deep-partnership',
];
export const TEAM_UNLOCK_STAGE_LEVELS = {
    'first-meeting': 1,
    'getting-started': 2,
    'building-trust': 3,
    established: 4,
    'deep-partnership': 5,
};
/**
 * Check if a stage is at or beyond a target stage
 */
export function teamUnlockStageAtOrBeyond(current, target) {
    return TEAM_UNLOCK_STAGE_LEVELS[current] >= TEAM_UNLOCK_STAGE_LEVELS[target];
}
/**
 * Type guard for TeamUnlockStage
 */
export function isTeamUnlockStage(value) {
    return typeof value === 'string' && TEAM_UNLOCK_STAGE_ORDER.includes(value);
}
/**
 * Numeric stage for comparisons and progression
 */
export const STAGE_LEVELS = {
    stranger: 1,
    acquaintance: 2,
    friend: 3,
    trusted_confidant: 4,
};
/**
 * Human-readable descriptions for each stage
 */
export const STAGE_DESCRIPTIONS = {
    stranger: 'Just met - still learning the basics about each other',
    acquaintance: 'Getting to know each other - establishing comfort and trust',
    friend: 'Comfortable relationship - can share openly and enjoy moments together',
    trusted_confidant: 'Deep relationship - mutual vulnerability and genuine care',
};
export const STAGE_THRESHOLDS = {
    stranger: {
        minConversations: 0,
        minMinutesTalked: 0,
        minKeyMoments: 0,
        minVulnerabilityMoments: 0,
    },
    acquaintance: {
        minConversations: 3,
        minMinutesTalked: 15,
        minKeyMoments: 0,
        minVulnerabilityMoments: 0,
    },
    friend: {
        minConversations: 6,
        minMinutesTalked: 60,
        minKeyMoments: 2,
        minVulnerabilityMoments: 0,
    },
    trusted_confidant: {
        minConversations: 10,
        minMinutesTalked: 120,
        minKeyMoments: 5,
        minVulnerabilityMoments: 2,
    },
};
// ============================================================================
// CROSS-SYSTEM STAGE MAPPING
// ============================================================================
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
export function teamUnlockToPersonaBehavior(unlock) {
    const mapping = {
        'first-meeting': 'stranger',
        'getting-started': 'acquaintance',
        'building-trust': 'friend',
        established: 'friend',
        'deep-partnership': 'trusted_confidant',
    };
    return mapping[unlock];
}
/**
 * Maps Persona Behavior stages → Team Unlock stages.
 *
 * This is the REVERSE mapping. Note that "friend" maps to "building-trust"
 * even though "established" also uses "friend" behavior. This gives the
 * minimum team unlock stage for that behavior level.
 */
export function personaBehaviorToTeamUnlock(behavior) {
    const mapping = {
        stranger: 'first-meeting',
        acquaintance: 'getting-started',
        friend: 'building-trust',
        trusted_confidant: 'deep-partnership',
    };
    return mapping[behavior];
}
// ============================================================================
// CONVERSION UTILITIES (Legacy)
// ============================================================================
/**
 * Convert legacy stage to canonical stage
 */
export function fromLegacyStage(legacy) {
    const mapping = {
        new_acquaintance: 'stranger',
        getting_to_know: 'acquaintance',
        trusted_advisor: 'friend', // Note: trusted_advisor was often used too early
        old_friend: 'trusted_confidant',
    };
    return mapping[legacy];
}
/**
 * Convert canonical stage to legacy stage (for backward compatibility)
 */
export function toLegacyStage(stage) {
    const mapping = {
        stranger: 'new_acquaintance',
        acquaintance: 'getting_to_know',
        friend: 'trusted_advisor',
        trusted_confidant: 'old_friend',
    };
    return mapping[stage];
}
/**
 * Convert humanizing-style stage to canonical stage
 */
export function fromHumanizingStage(humanizing) {
    const mapping = {
        stranger: 'stranger',
        acquaintance: 'acquaintance',
        friend: 'friend',
        trusted_advisor: 'trusted_confidant',
    };
    return mapping[humanizing];
}
/**
 * Convert canonical stage to humanizing-style stage
 */
export function toHumanizingStage(stage) {
    const mapping = {
        stranger: 'stranger',
        acquaintance: 'acquaintance',
        friend: 'friend',
        trusted_confidant: 'trusted_advisor',
    };
    return mapping[stage];
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
export function calculateStage(metrics) {
    const { conversationCount, totalMinutesTalked, keyMomentsCount, vulnerabilityMomentsCount } = metrics;
    // Check from highest stage down
    const stages = ['trusted_confidant', 'friend', 'acquaintance', 'stranger'];
    for (const stage of stages) {
        const threshold = STAGE_THRESHOLDS[stage];
        if (conversationCount >= threshold.minConversations &&
            totalMinutesTalked >= threshold.minMinutesTalked &&
            keyMomentsCount >= threshold.minKeyMoments &&
            vulnerabilityMomentsCount >= threshold.minVulnerabilityMoments) {
            return stage;
        }
    }
    return 'stranger';
}
/**
 * Check if metrics qualify for a specific stage
 */
export function meetsStageRequirements(stage, metrics) {
    const threshold = STAGE_THRESHOLDS[stage];
    return (metrics.conversationCount >= threshold.minConversations &&
        metrics.totalMinutesTalked >= threshold.minMinutesTalked &&
        metrics.keyMomentsCount >= threshold.minKeyMoments &&
        metrics.vulnerabilityMomentsCount >= threshold.minVulnerabilityMoments);
}
/**
 * Get progress toward next stage (0-100%)
 */
export function getProgressToNextStage(currentStage, metrics) {
    const stages = ['stranger', 'acquaintance', 'friend', 'trusted_confidant'];
    const currentIndex = stages.indexOf(currentStage);
    if (currentIndex === stages.length - 1) {
        return { nextStage: null, progress: 100, missingRequirements: [] };
    }
    const nextStage = stages[currentIndex + 1];
    if (!nextStage) {
        return { nextStage: null, progress: 100, missingRequirements: [] };
    }
    const threshold = STAGE_THRESHOLDS[nextStage];
    const missing = [];
    // Calculate progress for each metric
    const conversationProgress = Math.min(100, (metrics.conversationCount / threshold.minConversations) * 100);
    const minutesProgress = Math.min(100, (metrics.totalMinutesTalked / threshold.minMinutesTalked) * 100);
    const momentsProgress = threshold.minKeyMoments === 0
        ? 100
        : Math.min(100, (metrics.keyMomentsCount / threshold.minKeyMoments) * 100);
    const vulnerabilityProgress = threshold.minVulnerabilityMoments === 0
        ? 100
        : Math.min(100, (metrics.vulnerabilityMomentsCount / threshold.minVulnerabilityMoments) * 100);
    // Track what's missing
    if (conversationProgress < 100) {
        missing.push(`${threshold.minConversations - metrics.conversationCount} more conversations needed`);
    }
    if (minutesProgress < 100) {
        missing.push(`${Math.ceil(threshold.minMinutesTalked - metrics.totalMinutesTalked)} more minutes needed`);
    }
    if (momentsProgress < 100) {
        missing.push(`${threshold.minKeyMoments - metrics.keyMomentsCount} more key moments needed`);
    }
    if (vulnerabilityProgress < 100) {
        missing.push(`${threshold.minVulnerabilityMoments - metrics.vulnerabilityMomentsCount} more vulnerability moments needed`);
    }
    // Overall progress is the minimum of all metrics (all must be met)
    const progress = Math.min(conversationProgress, minutesProgress, momentsProgress, vulnerabilityProgress);
    return { nextStage, progress: Math.round(progress), missingRequirements: missing };
}
// ============================================================================
// TYPE GUARDS
// ============================================================================
/**
 * Check if a string is a valid RelationshipStage
 */
export function isRelationshipStage(value) {
    return (typeof value === 'string' &&
        ['stranger', 'acquaintance', 'friend', 'trusted_confidant'].includes(value));
}
/**
 * Check if a string is a legacy relationship stage
 */
export function isLegacyRelationshipStage(value) {
    return (typeof value === 'string' &&
        ['new_acquaintance', 'getting_to_know', 'trusted_advisor', 'old_friend'].includes(value));
}
/**
 * Check if a string is a humanizing relationship stage
 */
export function isHumanizingRelationshipStage(value) {
    return (typeof value === 'string' &&
        ['stranger', 'acquaintance', 'friend', 'trusted_advisor'].includes(value));
}
// ============================================================================
// STAGE COMPARISON UTILITIES
// ============================================================================
/**
 * Check if stage A is at least as deep as stage B
 */
export function isAtLeast(stageA, stageB) {
    return STAGE_LEVELS[stageA] >= STAGE_LEVELS[stageB];
}
/**
 * Check if stage A is deeper than stage B
 */
export function isDeeperThan(stageA, stageB) {
    return STAGE_LEVELS[stageA] > STAGE_LEVELS[stageB];
}
/**
 * Get the next stage (or null if already at max)
 */
export function getNextStage(stage) {
    const stages = ['stranger', 'acquaintance', 'friend', 'trusted_confidant'];
    const index = stages.indexOf(stage);
    return index < stages.length - 1 ? (stages[index + 1] ?? null) : null;
}
/**
 * Get the previous stage (or null if already at min)
 */
export function getPreviousStage(stage) {
    const stages = ['stranger', 'acquaintance', 'friend', 'trusted_confidant'];
    const index = stages.indexOf(stage);
    return index > 0 ? (stages[index - 1] ?? null) : null;
}
//# sourceMappingURL=relationship-stages.js.map