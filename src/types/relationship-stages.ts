/**
 * Relationship Stage Types - Consolidated
 *
 * This file consolidates all relationship stage definitions to prevent
 * inconsistencies across the codebase. There were previously two different
 * naming conventions:
 *
 * Legacy (UserProfile): new_acquaintance, getting_to_know, trusted_advisor, old_friend
 * Humanizing: stranger, acquaintance, friend, trusted_advisor
 *
 * This file provides:
 * 1. A single canonical type
 * 2. Conversion utilities between formats
 * 3. Stage progression logic
 * 4. Type guards
 *
 * Philosophy: The relationship should feel like a real friendship developing.
 */

// ============================================================================
// CANONICAL RELATIONSHIP STAGE
// ============================================================================

/**
 * Canonical relationship stage - the single source of truth.
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
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_confidant';

/**
 * Numeric stage for comparisons and progression
 */
export const STAGE_LEVELS: Record<RelationshipStage, number> = {
  stranger: 1,
  acquaintance: 2,
  friend: 3,
  trusted_confidant: 4,
};

/**
 * Human-readable descriptions for each stage
 */
export const STAGE_DESCRIPTIONS: Record<RelationshipStage, string> = {
  stranger: 'Just met - still learning the basics about each other',
  acquaintance: 'Getting to know each other - establishing comfort and trust',
  friend: 'Comfortable relationship - can share openly and enjoy moments together',
  trusted_confidant: 'Deep relationship - mutual vulnerability and genuine care',
};

/**
 * Thresholds for stage progression
 */
export interface StageThresholds {
  minConversations: number;
  minMinutesTalked: number;
  minKeyMoments: number;
  minVulnerabilityMoments: number;
}

export const STAGE_THRESHOLDS: Record<RelationshipStage, StageThresholds> = {
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
// LEGACY TYPE ALIASES (for backward compatibility)
// ============================================================================

/**
 * Legacy relationship stage from UserProfile.
 * @deprecated Use RelationshipStage instead. This exists for migration.
 */
export type LegacyRelationshipStage =
  | 'new_acquaintance'
  | 'getting_to_know'
  | 'trusted_advisor'
  | 'old_friend';

/**
 * Humanizing-style relationship stage.
 * @deprecated Use RelationshipStage instead. This exists for migration.
 */
export type HumanizingRelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'trusted_advisor';

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

/**
 * Convert legacy stage to canonical stage
 */
export function fromLegacyStage(legacy: LegacyRelationshipStage): RelationshipStage {
  const mapping: Record<LegacyRelationshipStage, RelationshipStage> = {
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
export function toLegacyStage(stage: RelationshipStage): LegacyRelationshipStage {
  const mapping: Record<RelationshipStage, LegacyRelationshipStage> = {
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
export function fromHumanizingStage(humanizing: HumanizingRelationshipStage): RelationshipStage {
  const mapping: Record<HumanizingRelationshipStage, RelationshipStage> = {
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
export function toHumanizingStage(stage: RelationshipStage): HumanizingRelationshipStage {
  const mapping: Record<RelationshipStage, HumanizingRelationshipStage> = {
    stranger: 'stranger',
    acquaintance: 'acquaintance',
    friend: 'friend',
    trusted_confidant: 'trusted_advisor',
  };
  return mapping[stage];
}

// ============================================================================
// STAGE CALCULATION
// ============================================================================

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
export function calculateStage(metrics: RelationshipMetrics): RelationshipStage {
  const { conversationCount, totalMinutesTalked, keyMomentsCount, vulnerabilityMomentsCount } =
    metrics;

  // Check from highest stage down
  const stages: RelationshipStage[] = ['trusted_confidant', 'friend', 'acquaintance', 'stranger'];

  for (const stage of stages) {
    const threshold = STAGE_THRESHOLDS[stage];

    if (
      conversationCount >= threshold.minConversations &&
      totalMinutesTalked >= threshold.minMinutesTalked &&
      keyMomentsCount >= threshold.minKeyMoments &&
      vulnerabilityMomentsCount >= threshold.minVulnerabilityMoments
    ) {
      return stage;
    }
  }

  return 'stranger';
}

/**
 * Check if metrics qualify for a specific stage
 */
export function meetsStageRequirements(
  stage: RelationshipStage,
  metrics: RelationshipMetrics
): boolean {
  const threshold = STAGE_THRESHOLDS[stage];

  return (
    metrics.conversationCount >= threshold.minConversations &&
    metrics.totalMinutesTalked >= threshold.minMinutesTalked &&
    metrics.keyMomentsCount >= threshold.minKeyMoments &&
    metrics.vulnerabilityMomentsCount >= threshold.minVulnerabilityMoments
  );
}

/**
 * Get progress toward next stage (0-100%)
 */
export function getProgressToNextStage(
  currentStage: RelationshipStage,
  metrics: RelationshipMetrics
): { nextStage: RelationshipStage | null; progress: number; missingRequirements: string[] } {
  const stages: RelationshipStage[] = ['stranger', 'acquaintance', 'friend', 'trusted_confidant'];
  const currentIndex = stages.indexOf(currentStage);

  if (currentIndex === stages.length - 1) {
    return { nextStage: null, progress: 100, missingRequirements: [] };
  }

  const nextStage = stages[currentIndex + 1];
  const threshold = STAGE_THRESHOLDS[nextStage];
  const missing: string[] = [];

  // Calculate progress for each metric
  const conversationProgress = Math.min(
    100,
    (metrics.conversationCount / threshold.minConversations) * 100
  );
  const minutesProgress = Math.min(
    100,
    (metrics.totalMinutesTalked / threshold.minMinutesTalked) * 100
  );
  const momentsProgress =
    threshold.minKeyMoments === 0
      ? 100
      : Math.min(100, (metrics.keyMomentsCount / threshold.minKeyMoments) * 100);
  const vulnerabilityProgress =
    threshold.minVulnerabilityMoments === 0
      ? 100
      : Math.min(
          100,
          (metrics.vulnerabilityMomentsCount / threshold.minVulnerabilityMoments) * 100
        );

  // Track what's missing
  if (conversationProgress < 100) {
    missing.push(
      `${threshold.minConversations - metrics.conversationCount} more conversations needed`
    );
  }
  if (minutesProgress < 100) {
    missing.push(
      `${Math.ceil(threshold.minMinutesTalked - metrics.totalMinutesTalked)} more minutes needed`
    );
  }
  if (momentsProgress < 100) {
    missing.push(`${threshold.minKeyMoments - metrics.keyMomentsCount} more key moments needed`);
  }
  if (vulnerabilityProgress < 100) {
    missing.push(
      `${threshold.minVulnerabilityMoments - metrics.vulnerabilityMomentsCount} more vulnerability moments needed`
    );
  }

  // Overall progress is the minimum of all metrics (all must be met)
  const progress = Math.min(
    conversationProgress,
    minutesProgress,
    momentsProgress,
    vulnerabilityProgress
  );

  return { nextStage, progress: Math.round(progress), missingRequirements: missing };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a string is a valid RelationshipStage
 */
export function isRelationshipStage(value: unknown): value is RelationshipStage {
  return (
    typeof value === 'string' &&
    ['stranger', 'acquaintance', 'friend', 'trusted_confidant'].includes(value)
  );
}

/**
 * Check if a string is a legacy relationship stage
 */
export function isLegacyRelationshipStage(value: unknown): value is LegacyRelationshipStage {
  return (
    typeof value === 'string' &&
    ['new_acquaintance', 'getting_to_know', 'trusted_advisor', 'old_friend'].includes(value)
  );
}

/**
 * Check if a string is a humanizing relationship stage
 */
export function isHumanizingRelationshipStage(
  value: unknown
): value is HumanizingRelationshipStage {
  return (
    typeof value === 'string' &&
    ['stranger', 'acquaintance', 'friend', 'trusted_advisor'].includes(value)
  );
}

// ============================================================================
// STAGE COMPARISON UTILITIES
// ============================================================================

/**
 * Check if stage A is at least as deep as stage B
 */
export function isAtLeast(stageA: RelationshipStage, stageB: RelationshipStage): boolean {
  return STAGE_LEVELS[stageA] >= STAGE_LEVELS[stageB];
}

/**
 * Check if stage A is deeper than stage B
 */
export function isDeeperThan(stageA: RelationshipStage, stageB: RelationshipStage): boolean {
  return STAGE_LEVELS[stageA] > STAGE_LEVELS[stageB];
}

/**
 * Get the next stage (or null if already at max)
 */
export function getNextStage(stage: RelationshipStage): RelationshipStage | null {
  const stages: RelationshipStage[] = ['stranger', 'acquaintance', 'friend', 'trusted_confidant'];
  const index = stages.indexOf(stage);
  return index < stages.length - 1 ? stages[index + 1] : null;
}

/**
 * Get the previous stage (or null if already at min)
 */
export function getPreviousStage(stage: RelationshipStage): RelationshipStage | null {
  const stages: RelationshipStage[] = ['stranger', 'acquaintance', 'friend', 'trusted_confidant'];
  const index = stages.indexOf(stage);
  return index > 0 ? stages[index - 1] : null;
}
