/**
 * Cross-Domain Connection Types
 *
 * Type definitions for connecting information domain to other domains.
 * This enables "Better Than Human" features like:
 * - "Rainy day → suggest indoor workout"
 * - "Stressful news → offer to skip"
 * - "Long commute → offer podcast or pep talk"
 */

// ============================================================================
// CROSS-DOMAIN INSIGHT TYPES
// ============================================================================

/**
 * An insight generated from cross-domain analysis
 */
export interface CrossDomainInsight {
  /** Unique identifier */
  id: string;

  /** Source domain that triggered this insight */
  sourceDomain: DomainType;

  /** Target domain this insight affects */
  targetDomain: DomainType;

  /** Type of connection */
  connectionType: ConnectionType;

  /** Human-readable insight message */
  message: string;

  /** Suggested action */
  suggestion?: string;

  /** Confidence in this insight (0-1) */
  confidence: number;

  /** When this insight was generated */
  generatedAt: Date;

  /** When this insight expires */
  expiresAt: Date;

  /** Related context data */
  context: Record<string, unknown>;
}

export type DomainType =
  | 'weather'
  | 'environmental'
  | 'news'
  | 'traffic'
  | 'sports'
  | 'calendar'
  | 'habits'
  | 'mood'
  | 'productivity'
  | 'wellness'
  | 'relationships';

export type ConnectionType =
  | 'weather_habit' // Weather affecting habit recommendations
  | 'weather_mood' // Weather affecting mood/energy
  | 'news_mood' // News content affecting emotional state
  | 'traffic_productivity' // Commute affecting work/energy
  | 'sports_relationship' // Sports events affecting social connections
  | 'calendar_energy' // Busy day affecting capacity
  | 'environmental_wellness'; // Air/pollen affecting health habits

// ============================================================================
// MOOD CONTEXT
// ============================================================================

/**
 * User's current emotional state (from conversation analysis)
 */
export interface MoodContext {
  /** Current detected mood */
  currentMood: MoodState;

  /** Confidence in mood detection (0-1) */
  confidence: number;

  /** Mood trend over conversation */
  trend: 'improving' | 'stable' | 'declining';

  /** Energy level */
  energyLevel: 'high' | 'medium' | 'low';

  /** Stress indicators detected */
  stressIndicators: string[];

  /** When mood was last assessed */
  assessedAt: Date;
}

export type MoodState =
  | 'calm'
  | 'happy'
  | 'excited'
  | 'anxious'
  | 'stressed'
  | 'sad'
  | 'frustrated'
  | 'tired'
  | 'neutral';

// ============================================================================
// HABIT RECOMMENDATION CONTEXT
// ============================================================================

/**
 * Context for habit recommendations
 */
export interface HabitRecommendationContext {
  /** Current weather conditions */
  weather?: {
    isRainy: boolean;
    isHot: boolean;
    isCold: boolean;
    isNice: boolean;
  };

  /** Environmental conditions */
  environmental?: {
    airQualityGood: boolean;
    pollenHigh: boolean;
    uvHigh: boolean;
  };

  /** Time context */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';

  /** Is it a weekday? */
  isWeekday: boolean;

  /** User's energy level */
  energyLevel?: 'high' | 'medium' | 'low';
}

// ============================================================================
// NEWS MOOD ANALYSIS
// ============================================================================

/**
 * Analysis of news content for mood impact
 */
export interface NewsMoodAnalysis {
  /** Overall sentiment of news consumed */
  overallSentiment: 'positive' | 'neutral' | 'negative' | 'heavy';

  /** Topics that might affect mood */
  heavyTopics: string[];

  /** Recommendation */
  recommendation: 'proceed' | 'summarize' | 'skip' | 'offer_break';

  /** Reason for recommendation */
  reason: string;
}

// ============================================================================
// TRAFFIC-PRODUCTIVITY CONTEXT
// ============================================================================

/**
 * Context for traffic-productivity connections
 */
export interface TrafficProductivityContext {
  /** Expected commute time (minutes) */
  commuteTime: number;

  /** Is commute longer than usual? */
  isLongerThanUsual: boolean;

  /** Traffic severity */
  trafficSeverity: 'light' | 'moderate' | 'heavy' | 'severe';

  /** Suggestions for commute time */
  suggestions: CommuteSuggestion[];
}

export interface CommuteSuggestion {
  type: 'podcast' | 'audiobook' | 'music' | 'call' | 'pep_talk' | 'meditation';
  reason: string;
}

// ============================================================================
// WEATHER-HABIT MAPPINGS
// ============================================================================

/**
 * Mapping of weather conditions to habit adjustments
 */
export interface WeatherHabitMapping {
  condition: string;
  affectedHabits: string[];
  suggestion: string;
  alternatives: string[];
}

export const WEATHER_HABIT_MAPPINGS: WeatherHabitMapping[] = [
  {
    condition: 'rainy',
    affectedHabits: ['outdoor_run', 'walk', 'cycling', 'outdoor_yoga'],
    suggestion: 'Rainy day! How about an indoor workout instead?',
    alternatives: ['indoor_workout', 'yoga', 'stretching', 'strength_training'],
  },
  {
    condition: 'very_hot',
    affectedHabits: ['outdoor_run', 'hiking', 'outdoor_sports'],
    suggestion: "It's going to be hot! Maybe exercise early morning or try something indoors?",
    alternatives: ['swimming', 'indoor_workout', 'early_morning_run'],
  },
  {
    condition: 'very_cold',
    affectedHabits: ['outdoor_activities', 'walk'],
    suggestion: "Bundle up! It's cold. Indoor activities might be more comfortable.",
    alternatives: ['indoor_workout', 'yoga', 'home_exercises'],
  },
  {
    condition: 'high_pollen',
    affectedHabits: ['outdoor_run', 'hiking', 'outdoor_yoga', 'gardening'],
    suggestion: 'Pollen is high today. If you have allergies, indoor activities might be better.',
    alternatives: ['indoor_workout', 'yoga', 'swimming'],
  },
  {
    condition: 'poor_air_quality',
    affectedHabits: ['outdoor_run', 'cycling', 'hiking', 'outdoor_sports'],
    suggestion: "Air quality isn't great. Indoor exercise would be healthier today.",
    alternatives: ['indoor_workout', 'yoga', 'stretching'],
  },
  {
    condition: 'nice_weather',
    affectedHabits: ['indoor_workout', 'treadmill'],
    suggestion: 'Beautiful day outside! Perfect for taking your workout outdoors.',
    alternatives: ['outdoor_run', 'walk', 'hiking', 'outdoor_yoga'],
  },
];

// ============================================================================
// GRAY DAY MOOD PATTERNS
// ============================================================================

/**
 * Patterns for detecting "gray day" mood impacts
 */
export interface GrayDayPattern {
  /** Number of consecutive overcast/rainy days */
  consecutiveGrayDays: number;

  /** Threshold for mood impact */
  moodImpactThreshold: number; // days

  /** Suggested interventions */
  interventions: string[];
}

export const GRAY_DAY_INTERVENTIONS = [
  'How are you feeling today? Sometimes a few gray days in a row can affect our mood.',
  "We've had a few cloudy days. Want to do something to lift your spirits?",
  'The weather has been dreary. Would some music or a quick chat help brighten things up?',
];
