/**
 * Humanizing Types - Shared types for humanizing systems
 *
 * This file contains types used across both:
 * - src/services/humanizing-state.ts
 * - src/intelligence/context-builders/*.ts
 *
 * Extracted to avoid circular dependencies between services and intelligence layers.
 */
/**
 * Persona mood states - defines the emotional energy of a persona at a given moment
 */
export type MoodState = 'energized' | 'reflective' | 'playful' | 'grounded' | 'tired_but_present' | 'philosophical' | 'nostalgic';
/**
 * Relationship stages for humanizing context
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
/**
 * Relationship stages from UserProfile (slightly different naming)
 */
export type UserProfileRelationshipStage = 'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend';
/**
 * Base context injection type (shared definition).
 * Used to break circular dependency between agents/processors and intelligence/context-builders.
 */
export interface BaseContextInjection {
    content: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    source: string;
}
/**
 * Mood state shape for humanizing result
 * Used for type narrowing when accessing HumanizingResultBase.mood
 */
export interface HumanizingMood {
    /** Current mood state (e.g., 'energized', 'reflective') */
    state: MoodState | string;
    /** Energy level 0-1 */
    energyLevel?: number;
}
/**
 * Relationship state shape for humanizing result
 * Used for type narrowing when accessing HumanizingResultBase.relationship
 */
export interface HumanizingRelationship {
    /** Relationship stage with user */
    stage: RelationshipStage | string;
    /** Behaviors based on relationship level */
    behaviors?: string[];
}
/**
 * Base humanizing result interface.
 *
 * This defines the shape that agents/processors needs to know about
 * without pulling in all the detailed type definitions from
 * intelligence/context-builders.
 *
 * The full HumanizingResult in intelligence/context-builders/humanizing.ts
 * provides more specific types for the optional properties.
 *
 * NOTE: mood and relationship are typed as unknown to break circular
 * dependencies. Use type assertions or HumanizingMood/HumanizingRelationship
 * for type-safe access.
 */
export interface HumanizingResultBase {
    /** All context injections to add to the prompt */
    injections: BaseContextInjection[];
    /** Voice emotion analysis (full type in context-builders) */
    voiceIntelligence?: unknown;
    /** Selected inner world content (full type in context-builders) */
    innerWorldContent?: unknown[];
    /** Spontaneous share if selected (full type in context-builders) */
    spontaneousShare?: unknown;
    /** Current persona mood (cast to HumanizingMood for access) */
    mood: unknown;
    /** Relationship behaviors (cast to HumanizingRelationship for access) */
    relationship: unknown;
    /** Whether there's a relationship transition to announce */
    relationshipTransition?: string;
    /** Tags used (for tracking) */
    usedTags: string[];
    /** Debug summary */
    summary: string;
}
//# sourceMappingURL=humanizing-types.d.ts.map