/**
 * Communication Preferences Types
 *
 * Data structures for tracking how users prefer to be approached.
 * Each preference observation is stored as a separate document for:
 * - Individual TTL expiration
 * - Better querying by dimension/type
 * - Firestore index support
 *
 * @module memory/communication-preferences/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Dimensions of communication preferences we track
 */
export type PreferenceDimension =
  | 'formality'         // Casual vs formal tone
  | 'detail_level'      // Brief vs detailed explanations
  | 'coaching_style'    // Direct vs supportive
  | 'interruption'      // When to interject
  | 'topic_depth'       // Surface vs deep dives
  | 'emotional_support' // Practical vs emotional focus
  | 'humor'             // When/how to use humor
  | 'challenge_level';  // How much to push/challenge

/**
 * Stored communication preference observation
 */
export interface CommunicationPreference {
  id: string;
  userId: string;
  dimension: PreferenceDimension | string;
  ourApproach: string;
  userResponse: string;
  situation: string;
  confidence: number; // 0-1, increases with repeated observations
  observationCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string; // TTL for automatic cleanup
}

/**
 * Input for creating a new preference observation
 */
export type PreferenceInput = Omit<
  CommunicationPreference,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'expiresAt' | 'observationCount'
>;

/**
 * Legacy format (single document with array)
 */
export interface LegacyCommunicationPreferencesData {
  preferences: Array<{
    dimension: string;
    ourApproach: string;
    userResponse: string;
    situation: string;
    timestamp: string;
  }>;
  lastUpdated: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const PREFERENCE_CONFIG = {
  /**
   * TTL in days for preference observations
   * Longer than operational data (priorities, blockers) since these
   * represent learned patterns that are valuable long-term
   */
  TTL_DAYS: 730, // 2 years

  /**
   * Confidence decay rate per day without reinforcement
   */
  CONFIDENCE_DECAY_PER_DAY: 0.01,

  /**
   * Maximum confidence value
   */
  MAX_CONFIDENCE: 0.95,

  /**
   * Minimum confidence to include in context
   */
  MIN_CONFIDENCE_FOR_CONTEXT: 0.3,

  /**
   * Confidence boost per observation
   */
  CONFIDENCE_BOOST: 0.1,
} as const;
