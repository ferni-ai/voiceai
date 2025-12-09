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

