/**
 * Insight Generation Engine - Types
 *
 * Types for the superhuman insight generation system that transforms
 * captured data into proactive, surfaceable insights.
 *
 * @module services/superhuman/insight-generation/types
 */

// ============================================================================
// CORE INSIGHT TYPES
// ============================================================================

/**
 * The 10 categories of superhuman insights we generate
 */
export type InsightCategory =
  | 'cross_domain_correlation' // "Your sleep drops when work stress increases"
  | 'unspoken_awareness' // "You haven't mentioned X in weeks"
  | 'voice_content_mismatch' // "You said fine but sounded heavy"
  | 'growth_trajectory' // "Remember when you couldn't even..."
  | 'relationship_network' // "You light up when Sarah comes up"
  | 'commitment_pattern' // "You keep exercise but struggle with social"
  | 'temporal_rhythm' // "Sunday evenings are consistently hard"
  | 'dream_decay' // "That dream went quiet..."
  | 'anticipatory' // "Your review is next week, last time you got anxious"
  | 'first_time_celebration'; // "A month ago you shared this for the first time"

/**
 * Priority levels for insight surfacing
 */
export type InsightPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';

/**
 * When an insight should be surfaced
 */
export type SurfacingMoment =
  | 'session_start' // Surface at beginning of conversation
  | 'natural_pause' // Wait for a natural pause in conversation
  | 'topic_relevant' // Surface when related topic comes up
  | 'check_in' // Part of a check-in sequence
  | 'celebration' // Celebratory moment
  | 'gentle_probe' // Careful exploration of sensitive topic
  | 'end_of_session'; // Reflection at session end

/**
 * Tone guidance for how to deliver the insight
 */
export type InsightTone =
  | 'warm_observation' // "I've noticed..."
  | 'gentle_curiosity' // "I wonder if..."
  | 'celebratory' // "I want to acknowledge..."
  | 'protective_care' // "I want to check in about..."
  | 'reflective' // "Looking back..."
  | 'playful' // Light, non-threatening
  | 'direct_but_kind'; // Honest feedback with warmth

/**
 * A generated insight ready for surfacing
 */
export interface GeneratedInsight {
  id: string;
  userId: string;
  category: InsightCategory;
  priority: InsightPriority;

  // The insight itself
  headline: string; // Short summary: "Sleep-stress connection detected"
  message: string; // Full message to surface: "I've noticed your sleep..."
  evidence: string[]; // Supporting data points

  // Surfacing guidance
  surfacingMoment: SurfacingMoment;
  tone: InsightTone;
  triggerTopics?: string[]; // Topics that should trigger this insight
  triggerEmotions?: string[]; // Emotions that should trigger this insight
  triggerPerson?: string; // Person mention that should trigger

  // Metadata
  generatedAt: Date;
  expiresAt?: Date; // Some insights become stale
  confidence: number; // 0-1 confidence in the insight
  dataPoints: number; // How many observations support this

  // State
  surfaced: boolean;
  surfacedAt?: Date;
  userReaction?: 'acknowledged' | 'deflected' | 'explored' | 'rejected';
  dismissed: boolean;
}

// ============================================================================
// GENERATOR INPUT TYPES
// ============================================================================

/**
 * Context available to insight generators
 */
export interface InsightGeneratorContext {
  userId?: string;
  currentEmotion?: string;
  currentTopic?: string;
  currentPerson?: string;
  isSessionStart?: boolean;
  hourOfDay?: number;
  dayOfWeek?: number;
  recentTopics?: string[];
  voiceMetrics?: {
    energy?: number;
    stress?: number;
    pace?: number;
  };
}

/**
 * Base interface for all insight generators
 */
export interface InsightGenerator {
  category: InsightCategory;
  name: string;
  description: string;

  /**
   * Generate insights for a user
   * @param userId - The user ID
   * @param context - Current context for relevance filtering
   * @returns Array of generated insights (may be empty)
   */
  generate(userId: string, context: InsightGeneratorContext): Promise<GeneratedInsight[]>;

  /**
   * Check if this generator has enough data to produce insights
   */
  hasEnoughData(userId: string): Promise<boolean>;
}

// ============================================================================
// SPECIFIC INSIGHT DATA TYPES
// ============================================================================

/**
 * Cross-domain correlation data
 */
export interface CorrelationInsightData {
  domain1: string;
  domain2: string;
  pattern1: string;
  pattern2: string;
  correlation: 'positive' | 'negative';
  strength: number; // 0-1
  occurrences: number;
  examples: Array<{
    date: Date;
    domain1Value: string;
    domain2Value: string;
  }>;
}

/**
 * Unspoken/avoidance data
 */
export interface UnspokenInsightData {
  topic: string;
  lastMentioned?: Date;
  mentionCount: number;
  recentMentions: number; // Last 30 days
  deflectionCount: number;
  relatedContext?: string; // What they WERE talking about before avoiding
  sensitivity: 'low' | 'medium' | 'high';
}

/**
 * Voice-content mismatch data
 */
export interface VoiceContentMismatchData {
  statement: string;
  declaredEmotion: string; // What they said: "I'm fine"
  detectedEmotion: string; // What voice revealed: stressed
  voiceMetrics: {
    energy: number;
    stress: number;
    confidence: number;
  };
  frequency: number; // How often this mismatch occurs
  timestamp: Date;
}

/**
 * Growth trajectory data
 */
export interface GrowthTrajectoryData {
  area: string; // "anxiety about public speaking"
  startingPoint: {
    description: string;
    date: Date;
    severity?: number;
  };
  currentPoint: {
    description: string;
    date: Date;
    severity?: number;
  };
  milestones: Array<{
    description: string;
    date: Date;
  }>;
  progressPercentage: number;
}

/**
 * Relationship insight data
 */
export interface RelationshipInsightData {
  personName: string;
  relationship: string;
  mentionCount: number;
  recentMentionCount: number;
  averageSentiment: number; // -1 to 1
  energyImpact: 'energizing' | 'neutral' | 'draining';
  topicsDiscussed: string[];
  lastMentioned?: Date;
  silenceDays?: number; // Days since last mention
}

/**
 * Commitment pattern data
 */
export interface CommitmentPatternData {
  commitmentType: string; // "exercise", "social", "work", etc.
  totalCommitments: number;
  keptCount: number;
  brokenCount: number;
  keepRate: number; // 0-1
  commonReasons?: string[]; // Why they break
  bestDays?: string[]; // Days they're most likely to keep
  averageDaysToComplete?: number;
}

/**
 * Temporal rhythm data
 */
export interface TemporalRhythmData {
  timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'seasonal';
  pattern: string; // "Sunday evening anxiety"
  timeKey: string; // "sunday_evening", "january", etc.
  emotionalTrend: 'positive' | 'negative' | 'mixed';
  intensity: number; // 0-1
  occurrences: number;
  recentOccurrences: number;
}

/**
 * Dream decay data
 */
export interface DreamDecayData {
  dream: string;
  category: string; // "skill", "travel", "career", etc.
  firstMentioned: Date;
  lastMentioned: Date;
  mentionCount: number;
  initialExcitement: number; // 0-1
  daysSilent: number;
  status: 'active' | 'dormant' | 'abandoned' | 'achieved';
}

/**
 * Anticipatory data
 */
export interface AnticipatoryData {
  upcomingEvent: string;
  eventDate: Date;
  daysUntil: number;
  historicalPattern?: {
    description: string;
    typicalOnset: number; // Days before event when anxiety typically starts
    typicalIntensity: number;
  };
  preparationOpportunity: string;
}

/**
 * First-time celebration data
 */
export interface FirstTimeCelebrationData {
  topic: string;
  firstSharedDate: Date;
  subsequentMentions: number;
  daysSinceFirstShare: number;
  depth: 'surface' | 'moderate' | 'deep' | 'profound';
  growthSince: string; // Description of how they've grown since sharing
}

// ============================================================================
// INSIGHT STORE TYPES
// ============================================================================

/**
 * Options for querying insights
 */
export interface InsightQueryOptions {
  categories?: InsightCategory[];
  minPriority?: InsightPriority;
  surfacingMoments?: SurfacingMoment[];
  triggerTopic?: string;
  triggerEmotion?: string;
  triggerPerson?: string;
  includeExpired?: boolean;
  includeSurfaced?: boolean;
  includeDismissed?: boolean;
  limit?: number;
}

/**
 * Result of insight generation run
 */
export interface InsightGenerationResult {
  userId: string;
  generatedAt: Date;
  insights: GeneratedInsight[];
  byCategory: Record<InsightCategory, number>;
  totalGenerated: number;
  errors: string[];
}
