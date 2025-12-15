/**
 * Humanizing Types - Shared types for humanizing systems
 *
 * This file contains types used across both:
 * - src/services/humanizing-state.ts
 * - src/intelligence/context-builders/*.ts
 *
 * Extracted to avoid circular dependencies between services and intelligence layers.
 */

// ============================================================================
// MOOD TYPES
// ============================================================================

/**
 * Persona mood states - defines the emotional energy of a persona at a given moment
 */
export type MoodState =
  | 'energized' // High energy, more animated
  | 'reflective' // Thoughtful, story-heavy
  | 'playful' // Joking, light-hearted
  | 'grounded' // Calm, centered, present
  | 'tired_but_present' // Lower energy but still engaged
  | 'philosophical' // Deep, big-picture thinking
  | 'nostalgic'; // Memory-heavy, wistful

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================

/**
 * Relationship stages for humanizing context
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

/**
 * Relationship stages from UserProfile (slightly different naming)
 */
export type UserProfileRelationshipStage =
  | 'new_acquaintance'
  | 'getting_to_know'
  | 'trusted_advisor'
  | 'old_friend';

// ============================================================================
// HUMANIZING RESULT BASE TYPE
// ============================================================================

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
 * Base humanizing result interface.
 *
 * This defines the shape that agents/processors needs to know about
 * without pulling in all the detailed type definitions from
 * intelligence/context-builders.
 *
 * The full HumanizingResult in intelligence/context-builders/humanizing.ts
 * provides more specific types for the optional properties.
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

  /** Current persona mood (full type in context-builders) */
  mood: unknown;

  /** Relationship behaviors (full type in context-builders) */
  relationship: unknown;

  /** Whether there's a relationship transition to announce */
  relationshipTransition?: string;

  /** Tags used (for tracking) */
  usedTags: string[];

  /** Debug summary */
  summary: string;
}
