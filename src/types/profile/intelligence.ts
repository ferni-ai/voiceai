/**
 * Intelligence Aggregate
 *
 * Data that powers Ferni's "superhuman" intelligence - understanding
 * how the user thinks, their patterns, and building genuine relationship depth.
 */

import type { MoodState } from '../humanizing-types.js';

// ============================================================================
// HUMANIZING STATE (Per-User Relationship Depth)
// ============================================================================

/**
 * Per-persona relationship stage
 */
export type PersonaRelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

/**
 * Detailed relationship data for a specific persona
 */
export interface PerPersonaRelationshipData {
  conversationCount: number;
  totalMinutes: number;
  keyMoments: Array<{
    type: 'breakthrough' | 'vulnerability' | 'celebration' | 'support' | 'humor';
    summary: string;
    timestamp: Date;
  }>;
  storiesTold: string[];
  vulnerabilityCount: number;
  frequentTopics: string[];
  lastInteraction?: Date;
  firstInteraction?: Date;
}

/**
 * Humanizing state - makes personas feel like real relationships
 */
export interface HumanizingState {
  /** Tags from spontaneous shares already used */
  usedShareTags: string[];
  /** Total spontaneous shares across all sessions */
  totalSpontaneousShares: number;
  /** Last persona mood (for continuity) */
  lastMood?: MoodState;
  /** Mood history for pattern detection */
  moodHistory?: Array<{
    mood: string;
    timestamp: Date;
    sessionId: string;
  }>;
  /** Stories told to this user */
  storiesTold?: string[];
  /** Hot takes shared */
  hotTakesShared?: string[];
  /** Inner world content revealed */
  innerWorldRevealed?: Array<{
    type: string;
    content: string;
    sharedAt: Date;
  }>;
  /** Relationship transition moments */
  relationshipMilestones?: Array<{
    from: string;
    to: string;
    timestamp: Date;
    acknowledgmentGiven: boolean;
  }>;
  /** Vulnerability moments shared by persona */
  vulnerabilityMoments?: number;
  /** Greetings used (hashes to prevent repetition) */
  usedGreetings?: string[];
  /** Last greeting timestamp */
  lastGreetingAt?: Date;
  /** Per-persona meeting counts */
  perPersonaMeetingCounts?: Record<string, number>;
  /** Last topic discussed with each persona */
  perPersonaLastTopic?: Record<string, string>;
  /** Per-persona relationship stage */
  perPersonaRelationshipStage?: Record<string, PersonaRelationshipStage>;
  /** Per-persona relationship depth data */
  perPersonaRelationshipData?: Record<string, PerPersonaRelationshipData>;
  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// COGNITIVE INTELLIGENCE
// ============================================================================

/**
 * Cognitive style detected from interactions
 */
export type CognitiveStyle =
  | 'analytical'
  | 'emotional'
  | 'practical'
  | 'narrative'
  | 'systematic'
  | 'intuitive'
  | 'unknown';

/**
 * Approach effectiveness tracking
 */
export interface ApproachEffectiveness {
  approach: 'analytical' | 'empathetic' | 'narrative' | 'systematic' | 'pragmatic' | 'intuitive';
  totalScore: number;
  sampleCount: number;
  lastUsed: Date;
}

/**
 * Topic explanation tracking
 */
export interface TopicExplanation {
  personaId: string;
  level: 'introduced' | 'explained' | 'deep_dive';
  lastExplained: Date;
  revisits: number;
}

/**
 * Cognitive intelligence data for personalized adaptation
 */
export interface CognitiveIntelligence {
  /** Detected cognitive style */
  detectedStyle: CognitiveStyle;
  /** Confidence in style detection (0-1) */
  styleConfidence: number;
  /** When style was last updated */
  styleUpdatedAt: Date;
  /** Effectiveness scores by approach per persona */
  approachEffectiveness: Record<string, ApproachEffectiveness[]>;
  /** Topics user has expertise in */
  expertiseAreas: string[];
  /** Topics user is learning */
  noviceAreas: string[];
  /** Topics that have been explained */
  explainedTopics: Record<string, TopicExplanation>;
  /** Concepts user has demonstrated understanding of */
  demonstratedUnderstanding: string[];
  /** Cognitive approach preferences by topic */
  topicPreferences: Record<
    string,
    {
      preferredApproach: string;
      confidence: number;
    }
  >;
  /** Total cognitive interactions tracked */
  totalInteractions: number;
  /** Per-persona cognitive data */
  perPersonaCognitiveData?: Record<
    string,
    {
      effectiveApproaches: string[];
      ineffectiveApproaches: string[];
      explainedTopics: string[];
      cognitiveGrowthStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    }
  >;
  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// RESPONSE QUALITY TRACKING
// ============================================================================

/**
 * Signal from user reaction to a response
 */
export interface ResponseSignal {
  id: string;
  timestamp: Date;
  responseType: string;
  responseLength: string;
  topic: string;
  userReaction: string;
  engagementScore: number;
}

/**
 * Learned response preferences
 */
export interface ResponsePreferences {
  likesStories: boolean;
  likesHumor: boolean;
  likesQuestions: boolean;
  prefersDirectAdvice: boolean;
  preferredResponseLength: 'brief' | 'moderate' | 'lengthy';
  highEngagementTopics: string[];
  lowEngagementTopics: string[];
}

/**
 * Response quality data
 */
export interface ResponseQuality {
  signals: ResponseSignal[];
  preferences?: ResponsePreferences;
}

// ============================================================================
// CONVERSATION PATTERNS
// ============================================================================

/**
 * Individual session pattern
 */
export interface SessionPattern {
  id: string;
  startedAt: Date;
  endedAt: Date;
  dayOfWeek: string;
  timeOfDay: string;
  durationMinutes: number;
  openingStyle: string;
  topicSequence: string[];
}

/**
 * Learned conversation preferences
 */
export interface ConversationPreferences {
  preferredTimes: string[];
  preferredDays: string[];
  avgDuration: number;
  likesSmallTalkFirst: boolean;
  prefersQuickConversations: boolean;
}

/**
 * Conversation pattern data
 */
export interface ConversationPatterns {
  sessions: SessionPattern[];
  preferences?: ConversationPreferences;
}

// ============================================================================
// PROACTIVE INSIGHTS
// ============================================================================

/**
 * Generated insight for user
 */
export interface ProactiveInsight {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  generatedAt: Date;
  delivered: boolean;
  deliveredAt?: Date;
  userReaction?: string;
}

// ============================================================================
// INTELLIGENCE PROFILE
// ============================================================================

/**
 * Complete intelligence profile
 */
export interface IntelligenceProfile {
  humanizing?: HumanizingState;
  cognitive?: CognitiveIntelligence;
  responseQuality?: ResponseQuality;
  conversationPatterns?: ConversationPatterns;
  proactiveInsights?: ProactiveInsight[];
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create default intelligence profile
 */
export function createIntelligenceProfile(): IntelligenceProfile {
  const now = new Date();
  return {
    humanizing: {
      usedShareTags: [],
      totalSpontaneousShares: 0,
      updatedAt: now,
    },
    cognitive: {
      detectedStyle: 'unknown',
      styleConfidence: 0,
      styleUpdatedAt: now,
      approachEffectiveness: {},
      expertiseAreas: [],
      noviceAreas: [],
      explainedTopics: {},
      demonstratedUnderstanding: [],
      topicPreferences: {},
      totalInteractions: 0,
      updatedAt: now,
    },
  };
}
