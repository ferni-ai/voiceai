/**
 * Relationship Aggregate
 *
 * The relationship between the user and the AI.
 * Includes family context and key shared moments.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Relationship stage with the AI
 */
export type RelationshipStage =
  | 'new_acquaintance'
  | 'getting_to_know'
  | 'trusted_advisor'
  | 'old_friend';

/**
 * Family member mentioned by user
 */
export interface FamilyMember {
  relationship: string;
  name?: string;
  mentionedTopics?: string[];
  lastMentioned?: Date;
}

/**
 * Emotional pattern observed
 */
export interface EmotionalPattern {
  timestamp: Date;
  emotion: string;
  intensity: number;
  context?: string;
  trigger?: string;
}

/**
 * Important moment from conversations
 */
export interface KeyMoment {
  id: string;
  timestamp: Date;
  type:
    | 'shared_vulnerability'
    | 'breakthrough'
    | 'milestone'
    | 'concern'
    | 'celebration'
    | 'decision';
  summary: string;
  emotionalWeight: 'light' | 'medium' | 'heavy';
  topics: string[];
  followUpNeeded?: boolean;
  followUpDate?: Date;
}

/**
 * Story shared with the user
 */
export interface SharedStory {
  storyId: string;
  theme: string;
  sharedAt: Date;
  userReaction?: 'positive' | 'neutral' | 'moved' | 'curious';
  context: string;
}

// ============================================================================
// RELATIONSHIP CONTEXT
// ============================================================================

/**
 * Relationship context with a user
 */
export interface RelationshipContext {
  stage: RelationshipStage;
  familyMembers: FamilyMember[];
  keyMoments: KeyMoment[];
  sharedStories: SharedStory[];
  emotionalPatterns: EmotionalPattern[];
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create default relationship context
 */
export function createRelationshipContext(): RelationshipContext {
  return {
    stage: 'new_acquaintance',
    familyMembers: [],
    keyMoments: [],
    sharedStories: [],
    emotionalPatterns: [],
  };
}

/**
 * Calculate relationship stage based on interaction metrics
 */
export function calculateRelationshipStage(
  totalConversations: number,
  totalMinutesTalked: number,
  keyMoments: KeyMoment[]
): RelationshipStage {
  const deepMoments = keyMoments.filter((m) => m.emotionalWeight === 'heavy').length;

  if (totalConversations <= 2) {
    return 'new_acquaintance';
  }

  if (totalConversations <= 5 && totalMinutesTalked < 60) {
    return 'getting_to_know';
  }

  if (totalConversations >= 10 && deepMoments >= 3) {
    return 'old_friend';
  }

  if (totalConversations >= 5 || deepMoments >= 1) {
    return 'trusted_advisor';
  }

  return 'getting_to_know';
}

