/**
 * Predictive Insights Types
 *
 * Shared types for all predictive capabilities.
 *
 * @module PredictiveInsights/Types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type InsightPriority = 'low' | 'medium' | 'high' | 'urgent';

export type InsightType =
  | 'energy_prediction'
  | 'relationship_health'
  | 'goal_trajectory'
  | 'burnout_prediction'
  | 'decision_timing'
  | 'social_connection'
  | 'seasonal_mood'
  | 'habit_decay';

/**
 * A predictive insight ready to surface to the user
 */
export interface PredictiveInsight {
  id: string;
  type: InsightType;
  userId: string;

  /** Short title for the insight */
  title: string;

  /** Human-friendly message explaining the prediction */
  message: string;

  /** Actionable suggestion */
  suggestion?: string;

  /** How urgent is this insight */
  priority: InsightPriority;

  /** Confidence in this prediction (0-1) */
  confidence: number;

  /** When this insight expires/becomes irrelevant */
  validUntil?: Date;

  /** When the insight was generated */
  createdAt: Date;

  /** Type-specific metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// ENERGY PREDICTION TYPES
// ============================================================================

export type EnergyLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'peak';

export interface EnergyFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  explanation: string;
}

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================

export type SentimentTrend = 'improving' | 'stable' | 'declining' | 'volatile';

export type RelationshipSeverity = 'watch' | 'concern' | 'urgent';

export interface LanguageShift {
  from: string; // e.g., "we", "us"
  to: string; // e.g., "I", "me"
  frequency: number;
  significance: number;
}

// ============================================================================
// GOAL TRAJECTORY TYPES
// ============================================================================

export interface CourseCorrection {
  action: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  timeToResult: string;
}

// ============================================================================
// BURNOUT TYPES
// ============================================================================

export type BurnoutRiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface BurnoutFactor {
  factor: string;
  score: number;
  weight: number;
  observation: string;
}

// ============================================================================
// DECISION TYPES
// ============================================================================

export interface HistoricalDecisionPattern {
  avgIncubationDays: number;
  optimalMentionCount: number;
  bestOutcomeConditions: string[];
}

// ============================================================================
// SOCIAL CONNECTION TYPES
// ============================================================================

export type RelationshipType =
  | 'partner'
  | 'family'
  | 'close_friend'
  | 'friend'
  | 'colleague'
  | 'acquaintance';

export type ConnectionSeverity = 'minor' | 'moderate' | 'significant';

// ============================================================================
// SEASONAL TYPES
// ============================================================================

export type SeasonalPeriod =
  | 'winter_start'
  | 'winter_deep'
  | 'spring'
  | 'summer'
  | 'fall'
  | 'holidays'
  | 'anniversary'
  | 'birthday_month';

export interface HistoricalSeasonalPattern {
  period: SeasonalPeriod;
  avgMoodScore: number;
  commonThemes: string[];
  supportStrategies: string[];
}

// ============================================================================
// HABIT TYPES
// ============================================================================

export interface HabitIntervention {
  intervention: string;
  effectiveness: number;
  effort: 'low' | 'medium' | 'high';
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

export interface UserPredictiveProfile {
  userId: string;

  // Historical data for predictions
  energyHistory: Array<{
    date: Date;
    level: EnergyLevel;
    factors: string[];
  }>;

  relationshipMentions: Map<
    string,
    Array<{
      date: Date;
      sentiment: number;
      topics: string[];
    }>
  >;

  decisionHistory: Array<{
    topic: string;
    firstMentioned: Date;
    decided: Date;
    outcome: 'positive' | 'negative' | 'neutral';
    mentionCount: number;
  }>;

  seasonalHistory: Map<
    SeasonalPeriod,
    Array<{
      year: number;
      avgMood: number;
      themes: string[];
    }>
  >;

  habitHistory: Map<
    string,
    Array<{
      date: Date;
      completed: boolean;
    }>
  >;

  lastUpdated: Date;
}
