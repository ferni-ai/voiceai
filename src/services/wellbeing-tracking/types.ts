/**
 * Wellbeing Tracking Types
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Type definitions for the wellbeing tracking system.
 * This system measures what matters and shows real progress over time.
 *
 * Unlike clinical assessments (PHQ-9, GAD-7), this system:
 * - Tracks continuously through natural conversation
 * - Builds personalized baselines
 * - Predicts struggles before they become crises
 * - Shows progress in a way that's meaningful to the user
 *
 * @module WellbeingTracking/Types
 */

// ============================================================================
// CORE DIMENSIONS
// ============================================================================

/**
 * The core dimensions of wellbeing we track.
 * Based on evidence-based wellbeing research but adapted for conversational tracking.
 */
export interface WellbeingDimensions {
  // -------------------------
  // MOOD & AFFECT
  // -------------------------

  /** Overall mood (-1 very low to +1 very high) */
  mood: number;

  /** How stable/volatile the mood is (0 volatile to 1 stable) */
  moodStability: number;

  // -------------------------
  // ENERGY & MOTIVATION
  // -------------------------

  /** Physical and mental energy level (0 to 1) */
  energy: number;

  /** Drive to do things (0 to 1) */
  motivation: number;

  // -------------------------
  // ANXIETY & WORRY
  // -------------------------

  /** Level of worry/anxious thoughts (0 to 1) */
  worry: number;

  /** Physical tension in body (0 to 1) */
  physicalTension: number;

  // -------------------------
  // CONNECTION & BELONGING
  // -------------------------

  /** Sense of loneliness (0 to 1) */
  loneliness: number;

  /** Satisfaction with social connections (0 to 1) */
  socialSatisfaction: number;

  // -------------------------
  // PURPOSE & MEANING
  // -------------------------

  /** Sense that life has meaning (0 to 1) */
  meaningfulness: number;

  /** Hope about the future (0 to 1) */
  hopefulness: number;

  // -------------------------
  // SELF-CARE
  // -------------------------

  /** Sleep quality (0 to 1) */
  sleepQuality: number;

  /** Overall self-care level (0 to 1) */
  selfCareLevel: number;
}

/**
 * Keys of all wellbeing dimensions.
 */
export type WellbeingDimension = keyof WellbeingDimensions;

/**
 * All dimension keys for iteration.
 */
export const ALL_DIMENSIONS: WellbeingDimension[] = [
  'mood',
  'moodStability',
  'energy',
  'motivation',
  'worry',
  'physicalTension',
  'loneliness',
  'socialSatisfaction',
  'meaningfulness',
  'hopefulness',
  'sleepQuality',
  'selfCareLevel',
];

// ============================================================================
// SNAPSHOTS
// ============================================================================

/**
 * A point-in-time measurement of wellbeing.
 */
export interface WellbeingSnapshot {
  id: string;
  userId: string;
  timestamp: Date;

  /** How the data was gathered */
  source: 'detected' | 'self_reported' | 'voice_analysis' | 'inferred';

  /** The dimension values */
  dimensions: Partial<WellbeingDimensions>;

  /** Confidence in each dimension's accuracy (0 to 1) */
  confidence: Partial<Record<WellbeingDimension, number>>;

  /** What led to this assessment */
  signals: WellbeingSignal[];

  /** Conversation context */
  context?: {
    topic?: string;
    emotion?: string;
    turnCount?: number;
  };
}

/**
 * A signal that contributed to a wellbeing assessment.
 */
export interface WellbeingSignal {
  dimension: WellbeingDimension;
  signal: string;
  value: number;
  confidence: number;
  source: 'text' | 'voice' | 'pattern' | 'explicit';
}

// ============================================================================
// PROFILES
// ============================================================================

/**
 * A user's complete wellbeing profile.
 */
export interface WellbeingProfile {
  userId: string;

  // -------------------------
  // CURRENT STATE
  // -------------------------

  /** Most recent snapshot */
  current: WellbeingSnapshot | null;

  /** Rolling average of recent snapshots */
  recentAverage: Partial<WellbeingDimensions>;

  // -------------------------
  // BASELINES
  // -------------------------

  /** Personal baseline (what's "normal" for this person) */
  personalBaseline: Partial<WellbeingDimensions>;

  /** Confidence in the baseline */
  baselineConfidence: number;

  /** Snapshots used to establish baseline */
  baselineSnapshots: number;

  // -------------------------
  // TRENDS
  // -------------------------

  /** Trend over the past week */
  weeklyTrend: WellbeingTrend;

  /** Trend over the past month */
  monthlyTrend: WellbeingTrend;

  // -------------------------
  // PATTERNS
  // -------------------------

  /** Temporal patterns (e.g., "mornings are harder") */
  temporalPatterns: TemporalPattern[];

  /** Trigger patterns (e.g., "work stress → low mood") */
  triggerPatterns: TriggerPattern[];

  // -------------------------
  // ALERTS
  // -------------------------

  /** Active alerts/warnings */
  alerts: WellbeingAlert[];

  // -------------------------
  // METADATA
  // -------------------------

  createdAt: Date;
  lastUpdated: Date;
  totalSnapshots: number;
}

/**
 * Trend information for a time period.
 */
export interface WellbeingTrend {
  period: 'week' | 'month' | 'quarter';

  /** Overall direction */
  direction: 'improving' | 'stable' | 'declining';

  /** Change magnitude (-1 to +1) */
  magnitude: number;

  /** Confidence in the trend */
  confidence: number;

  /** Per-dimension trends */
  byDimension: Partial<Record<WellbeingDimension, {
    direction: 'improving' | 'stable' | 'declining';
    change: number;
  }>>;

  /** Notable observations */
  observations: string[];
}

// ============================================================================
// PATTERNS
// ============================================================================

/**
 * A temporal pattern in wellbeing (e.g., time-of-day effects).
 */
export interface TemporalPattern {
  type: 'time_of_day' | 'day_of_week' | 'time_of_month' | 'seasonal';

  /** Description of the pattern */
  description: string;

  /** Which dimensions are affected */
  affectedDimensions: WellbeingDimension[];

  /** When it occurs */
  when: string;

  /** Average impact */
  impact: number;

  /** Confidence in the pattern */
  confidence: number;

  /** Actionable insight */
  actionable: string;
}

/**
 * A trigger pattern (topic/situation → wellbeing change).
 */
export interface TriggerPattern {
  /** What triggers the change */
  trigger: string;

  /** Category of trigger */
  category: 'topic' | 'situation' | 'person' | 'activity';

  /** Which dimensions are affected */
  affectedDimensions: WellbeingDimension[];

  /** Direction of impact */
  direction: 'positive' | 'negative';

  /** Magnitude of impact */
  magnitude: number;

  /** How often this has been observed */
  occurrences: number;

  /** Confidence in the pattern */
  confidence: number;
}

// ============================================================================
// ALERTS
// ============================================================================

/**
 * An early warning or alert about wellbeing.
 */
export interface WellbeingAlert {
  id: string;
  userId: string;
  createdAt: Date;

  /** Type of alert */
  type: AlertType;

  /** Severity level */
  severity: 'watch' | 'concern' | 'urgent';

  /** Human-readable message */
  message: string;

  /** What signals triggered this */
  signals: WellbeingSignal[];

  /** Recommended actions */
  recommendations: AlertRecommendation[];

  /** Whether this has been acknowledged/addressed */
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';

  /** When it was resolved (if applicable) */
  resolvedAt?: Date;
}

/**
 * Types of wellbeing alerts.
 */
export type AlertType =
  | 'depression_risk'
  | 'anxiety_spike'
  | 'burnout_trajectory'
  | 'isolation_pattern'
  | 'sleep_deterioration'
  | 'motivation_collapse'
  | 'significant_decline'
  | 'crisis_indicators';

/**
 * A recommendation attached to an alert.
 */
export interface AlertRecommendation {
  /** Who this is for */
  target: 'user' | 'ferni' | 'professional';

  /** The recommendation */
  action: string;

  /** Priority */
  priority: 'high' | 'medium' | 'low';
}

// ============================================================================
// ASSESSMENTS
// ============================================================================

/**
 * A conversational assessment opportunity.
 */
export interface AssessmentOpportunity {
  dimension: WellbeingDimension;

  /** Natural question to ask */
  question: string;

  /** Follow-up questions */
  followUps: string[];

  /** Patterns to extract value from response */
  extractionPatterns: AssessmentPattern[];

  /** When this is most appropriate to ask */
  timing: 'early' | 'mid' | 'late' | 'natural';

  /** How intrusive this question is */
  intrusiveness: 'low' | 'medium' | 'high';
}

/**
 * Pattern for extracting wellbeing data from natural language.
 */
export interface AssessmentPattern {
  pattern: RegExp;
  valueExtractor: (match: RegExpMatchArray) => number;
  confidence: number;
}

// ============================================================================
// VISUALIZATION
// ============================================================================

/**
 * Data for the wellbeing dashboard visualization.
 */
export interface WellbeingDashboardData {
  /** Overall score and trend */
  overall: {
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    comparisonToLastMonth: number;
  };

  /** Per-dimension cards */
  dimensions: DimensionCard[];

  /** Calendar heatmap data */
  calendar: CalendarDay[];

  /** Achievements/milestones */
  achievements: WellbeingAchievement[];

  /** Predictions */
  predictions: {
    nextWeekForecast: string;
    riskFactors: string[];
    protectiveFactors: string[];
  };
}

/**
 * A card for displaying a single dimension.
 */
export interface DimensionCard {
  dimension: WellbeingDimension;
  label: string;
  icon: string;

  currentScore: number;
  trend: 'improving' | 'stable' | 'declining';

  /** Last 30 days for sparkline */
  sparkline: number[];

  /** Personalized insight */
  insight: string;
}

/**
 * A single day in the calendar heatmap.
 */
export interface CalendarDay {
  date: Date;
  score: number;
  note?: string;
}

/**
 * A wellbeing achievement.
 */
export interface WellbeingAchievement {
  id: string;
  title: string;
  description: string;
  earnedAt: Date;
  icon: string;
}

// ============================================================================
// REPORTS
// ============================================================================

/**
 * A therapist-compatible report.
 */
export interface TherapyReport {
  userId: string;
  period: { start: Date; end: Date };
  generatedAt: Date;

  /** Executive summary */
  summary: {
    overallTrend: string;
    keyInsights: string[];
    progressAreas: string[];
    struggleAreas: string[];
  };

  /** Quantitative metrics */
  metrics: {
    conversationCount: number;
    averageMood: number;
    moodVariability: number;
    topEmotions: Array<{ emotion: string; frequency: number }>;
    topTopics: Array<{ topic: string; frequency: number }>;
  };

  /** Cognitive patterns */
  cognitivePatterns: {
    topDistortions: string[];
    reframingProgress: number;
    selfAwareness: 'emerging' | 'developing' | 'strong';
  };

  /** Significant moments */
  significantMoments: Array<{
    date: Date;
    summary: string;
    type: 'breakthrough' | 'struggle' | 'insight';
  }>;

  /** Safety information */
  safety: {
    crisisEvents: Array<{
      date: Date;
      type: string;
      resolution: string;
    }>;
    riskLevel: 'low' | 'moderate' | 'elevated';
  };

  /** Suggestions for therapist */
  suggestionsForTherapist: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for the wellbeing tracking system.
 */
export interface WellbeingTrackingConfig {
  /** Minimum snapshots before establishing baseline */
  minSnapshotsForBaseline: number;

  /** How often to assess each dimension */
  assessmentFrequency: Record<WellbeingDimension, number>; // days

  /** Threshold for triggering alerts */
  alertThresholds: Record<AlertType, number>;

  /** Whether to enable proactive check-ins */
  enableProactiveCheckins: boolean;

  /** Whether to generate therapy reports */
  enableTherapyReports: boolean;
}

export const DEFAULT_CONFIG: WellbeingTrackingConfig = {
  minSnapshotsForBaseline: 10,
  assessmentFrequency: {
    mood: 1,
    moodStability: 3,
    energy: 1,
    motivation: 2,
    worry: 1,
    physicalTension: 3,
    loneliness: 7,
    socialSatisfaction: 7,
    meaningfulness: 14,
    hopefulness: 7,
    sleepQuality: 1,
    selfCareLevel: 3,
  },
  alertThresholds: {
    depression_risk: 0.7,
    anxiety_spike: 0.8,
    burnout_trajectory: 0.75,
    isolation_pattern: 0.7,
    sleep_deterioration: 0.6,
    motivation_collapse: 0.8,
    significant_decline: 0.6,
    crisis_indicators: 0.5,
  },
  enableProactiveCheckins: true,
  enableTherapyReports: true,
};

