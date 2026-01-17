/**
 * Humanizer Type Definitions
 *
 * Types for the conversation humanization system.
 *
 * @module @ferni/conversation/humanizer/types
 */

import type { EmotionalResponse } from '../emotional-arc.js';
import type { SessionMemory } from '../deep-humanization/index.js';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Context for humanization operations
 */
export interface HumanizationContext {
  personaId: string;
  turnNumber: number;
  userMessage: string;
  userEmotion?: string;
  topic?: string;
  isSeriousContext?: boolean;
  wasPersonalSharing?: boolean;
  silenceDurationMs?: number;
  /** Session data for anticipation/running jokes */
  sessionData?: SessionMemory;
  /** Relationship stage for deeper humanization */
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Result of humanizing a response
 */
export interface HumanizedResponse {
  /** The humanized text (SSML stripped) */
  text: string;
  /** The humanized SSML */
  ssml: string;

  /** Features that were applied */
  appliedFeatures: string[];

  /** Guidance for delivery */
  emotionalGuidance: EmotionalResponse | null;
  pacing: 'faster' | 'normal' | 'slower';

  /** Optional additions */
  backchannel?: { text: string; ssml: string };
  memoryCallback?: { text: string; ssml: string };
  followUpQuestion?: { text: string; ssml: string };
}

/**
 * Actions to take before generating a response
 */
export interface PreResponseActions {
  backchannel?: { text: string; ssml: string };
  silenceAction?: 'wait' | 'gentle_prompt' | 'continue' | 'backchannel';
  acknowledgment?: string;
  topicChange?: { detected: boolean; transitionPhrase?: string };
}

/**
 * Guidance to inject into LLM context
 */
export interface ContextGuidance {
  source: string;
  content: string;
  priority: 'high' | 'standard' | 'hint';
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/**
 * Signals detected from user message
 */
export interface HumanizationSignals {
  userPresentedEvidence: boolean;
  isBreakthroughMoment: boolean;
  isGivingAdvice: boolean;
  isDisengaged: boolean;
  isHighlyEngaged: boolean;
}

/**
 * Relationship stage mappings
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
export type BetterThanHumanStage =
  | 'new_acquaintance'
  | 'getting_to_know'
  | 'trusted_advisor'
  | 'old_friend';

/**
 * Time of day categories
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Comfort level by relationship stage
 */
export const COMFORT_LEVELS: Record<RelationshipStage, number> = {
  stranger: 0.25,
  acquaintance: 0.45,
  friend: 0.65,
  trusted_advisor: 0.85,
};

/**
 * Map relationship stage to Better Than Human format
 */
export const RELATIONSHIP_STAGE_MAP: Record<RelationshipStage, BetterThanHumanStage> = {
  stranger: 'new_acquaintance',
  acquaintance: 'getting_to_know',
  friend: 'trusted_advisor',
  trusted_advisor: 'old_friend',
};
