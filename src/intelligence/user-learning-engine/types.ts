/**
 * User Learning Engine - Type Definitions
 *
 * Types for the user learning and memory system.
 *
 * @module intelligence/user-learning-engine/types
 */

import type { KeyMoment, EmotionalPattern } from '../../types/user-profile.js';
import type {
  SmallDetail,
  FollowUpItem,
  FarewellSummary,
} from '../tracking/conversation-quality.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Learning insight captured during conversation
 */
export interface LearningInsight {
  type:
    | 'preference'
    | 'concern'
    | 'goal'
    | 'relationship'
    | 'communication_style'
    | 'topic_interest'
    | 'emotional_pattern';
  key: string;
  value: unknown;
  confidence: number; // 0-1
  source: 'explicit' | 'inferred'; // Did user say it or did we infer it?
  capturedAt: Date;
  context?: string;
}

/**
 * Local type for preference updates (subset of what we track)
 */
export interface PreferenceUpdates {
  responseLength?: 'brief' | 'thorough' | 'unknown';
  storyAppetite?: 'loves_stories' | 'prefers_facts' | 'unknown';
  humorReceptivity?: 'high' | 'medium' | 'low' | 'unknown';
}

/**
 * Conversation analysis result for learning
 */
export interface ConversationLearningData {
  insights: LearningInsight[];
  keyMoments: KeyMoment[];
  smallDetails: SmallDetail[];
  emotionalPatterns: EmotionalPattern[];
  storiesTold: Array<{ storyId: string; theme: string; sharedAt: Date }>;
  preferenceUpdates: PreferenceUpdates;
  followUps: FollowUpItem[];
  farewellSummary?: FarewellSummary;
}

/**
 * Dynamic context for prompt enrichment
 */
export interface DynamicUserContext {
  // Personalization guidance
  communicationGuidance: string;
  preferenceGuidance: string;

  // Memory retrieval
  relevantKeyMoments: string[];
  relevantPastTopics: string[];
  rememberedDetails: string[];

  // Relationship context
  relationshipDepth: string;
  emotionalHistory: string;

  // Goals & concerns
  activeGoals: string[];
  knownConcerns: string[];

  // Combined formatted context
  formattedForPrompt: string;
}

/**
 * Voice emotion validation data
 */
export interface VoiceEmotionValidation {
  predicted: string;
  confirmed: boolean;
  timestamp: Date;
}

/**
 * Stored story data
 */
export interface StoryRecord {
  storyId: string;
  theme: string;
  sharedAt: Date;
}
