/**
 * Life Context Snapshot Types
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Defines the schema for collecting and synthesizing insights across all
 * personas' domains to understand the user's full life context.
 *
 * The goal is to detect patterns like:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Synthesis: "You're carrying a lot right now"
 *
 * Not reactive to words, but to LIFE CONTEXT.
 *
 * @module life-context-snapshot
 */

// ============================================================================
// DOMAIN DATA STRUCTURES
// ============================================================================

/**
 * Sleep domain data (Maya's specialty)
 */
export interface SleepDomainData {
  /** Average sleep duration over last N nights (hours) */
  averageSleepHours: number;
  /** Number of nights with poor sleep (<6 hours) */
  poorSleepNights: number;
  /** Sleep quality trend: 'improving' | 'declining' | 'stable' */
  trend: 'improving' | 'declining' | 'stable';
  /** Number of nights analyzed */
  nightsAnalyzed: number;
  /** Whether user mentioned fatigue or tiredness */
  mentionedFatigue: boolean;
  /** When data was last updated */
  lastUpdated: Date;
  /** Confidence in this assessment (0-1) */
  confidence: number;
}

/**
 * Calendar/schedule domain data (Alex's specialty)
 */
export interface CalendarDomainData {
  /** Number of meetings/events in the analysis window */
  totalEvents: number;
  /** Back-to-back meeting chains (no break between) */
  backToBackChains: number;
  /** Percent of day scheduled (0-100) */
  scheduleDensity: number;
  /** Whether there's a major deadline approaching */
  upcomingDeadline: {
    exists: boolean;
    description?: string;
    daysUntil?: number;
  };
  /** Whether user seems calendar-overwhelmed */
  isOverloaded: boolean;
  /** Free time available for self-care (hours) */
  freeTimeHours: number;
  /** When data was last updated */
  lastUpdated: Date;
  /** Confidence in this assessment (0-1) */
  confidence: number;
}

/**
 * Finance domain data (Peter's specialty)
 */
export interface FinanceDomainData {
  /** Number of times user checked finances/markets */
  checkFrequency: number;
  /** Whether user expressed market anxiety */
  expressedAnxiety: boolean;
  /** Financial stress level: 'low' | 'moderate' | 'high' */
  stressLevel: 'low' | 'moderate' | 'high';
  /** Whether there's a pending financial decision */
  pendingDecision: {
    exists: boolean;
    description?: string;
    urgency?: 'low' | 'medium' | 'high';
  };
  /** Topics of concern (e.g., 'market volatility', 'bills', 'investment') */
  concernTopics: string[];
  /** When data was last updated */
  lastUpdated: Date;
  /** Confidence in this assessment (0-1) */
  confidence: number;
}

/**
 * Goals/planning domain data (Jordan's specialty)
 */
export interface GoalsDomainData {
  /** Number of active goals being tracked */
  activeGoals: number;
  /** Goals at risk (behind schedule) */
  goalsAtRisk: number;
  /** Major milestone approaching */
  upcomingMilestone: {
    exists: boolean;
    description?: string;
    daysUntil?: number;
  };
  /** Overall progress: 'on_track' | 'behind' | 'ahead' */
  overallProgress: 'on_track' | 'behind' | 'ahead';
  /** Motivation level detected from conversations */
  motivationLevel: 'high' | 'medium' | 'low';
  /** Recent setbacks or failures mentioned */
  recentSetbacks: string[];
  /** When data was last updated */
  lastUpdated: Date;
  /** Confidence in this assessment (0-1) */
  confidence: number;
}

/**
 * Relationship/existential domain data (Nayan's specialty)
 */
export interface RelationshipDomainData {
  /** Key relationships mentioned recently */
  recentlyMentionedPeople: string[];
  /** Relationship concerns expressed */
  relationshipConcerns: string[];
  /** Existential themes discussed (meaning, purpose, mortality) */
  existentialThemes: string[];
  /** Overall relationship health: 'thriving' | 'stable' | 'strained' */
  relationshipHealth: 'thriving' | 'stable' | 'strained';
  /** Whether user seems isolated or lonely */
  isolationSignals: boolean;
  /** When data was last updated */
  lastUpdated: Date;
  /** Confidence in this assessment (0-1) */
  confidence: number;
}

/**
 * Habit/wellness domain data (Maya's specialty)
 */
export interface HabitsDomainData {
  /** Habits being actively tracked */
  activeHabits: string[];
  /** Habit streaks at risk (about to break) */
  streaksAtRisk: number;
  /** Overall habit adherence (0-100%) */
  adherencePercent: number;
  /** Whether user is in a habit slump */
  inSlump: boolean;
  /** Recent habit wins */
  recentWins: string[];
  /** When data was last updated */
  lastUpdated: Date;
  /** Confidence in this assessment (0-1) */
  confidence: number;
}

// ============================================================================
// SYNTHESIZED CONTEXT
// ============================================================================

/**
 * Stress level calculation across domains
 */
export interface DomainStressIndicator {
  /** Domain name */
  domain: 'sleep' | 'calendar' | 'finance' | 'goals' | 'relationships' | 'habits';
  /** Stress contribution (0-1) */
  stressLevel: number;
  /** Brief explanation */
  reason: string;
  /** Which persona identified this */
  sourcePersona: string;
}

/**
 * Synthesized trigger recommendation
 */
export interface SynthesisTrigger {
  /** Unique identifier */
  id: string;
  /** Trigger category */
  category: 'support' | 'celebration' | 'warning' | 'connection' | 'rest';
  /** Suggested verbal response or approach */
  suggestedResponse: string;
  /** Reasoning for this trigger */
  reasoning: string;
  /** Combined confidence from all domains */
  confidence: number;
  /** Priority level */
  priority: 'urgent' | 'high' | 'medium' | 'low';
  /** Which domains contributed to this synthesis */
  contributingDomains: string[];
  /** Best persona to deliver this */
  recommendedPersona: string;
}

/**
 * Complete life context snapshot
 */
export interface LifeContextSnapshot {
  /** User ID */
  userId: string;
  /** When this snapshot was created */
  createdAt: Date;
  /** Time window analyzed (days) */
  analysisWindowDays: number;

  /** Domain-specific data */
  domains: {
    sleep?: SleepDomainData;
    calendar?: CalendarDomainData;
    finance?: FinanceDomainData;
    goals?: GoalsDomainData;
    relationships?: RelationshipDomainData;
    habits?: HabitsDomainData;
  };

  /** Synthesized stress indicators */
  stressIndicators: DomainStressIndicator[];

  /** Overall load score (0-1, higher = more stressed/overwhelmed) */
  overallLoadScore: number;

  /** Overall wellbeing score (0-1, higher = better) */
  wellbeingScore: number;

  /** Generated synthesis triggers */
  synthesizedTriggers: SynthesisTrigger[];

  /** Notable patterns detected */
  patterns: {
    /** Description of the pattern */
    description: string;
    /** Domains involved */
    domains: string[];
    /** Impact on wellbeing */
    impact: 'positive' | 'negative' | 'neutral';
  }[];

  /** Metadata */
  metadata: {
    /** Domains with sufficient data */
    domainsWithData: string[];
    /** Domains missing data */
    domainsMissingData: string[];
    /** Overall data quality */
    dataQuality: 'high' | 'medium' | 'low';
    /** Processing time in ms */
    processingTimeMs: number;
  };
}

// ============================================================================
// DEFAULTS
// ============================================================================

/**
 * Default empty life context snapshot
 */
export const DEFAULT_LIFE_CONTEXT_SNAPSHOT: LifeContextSnapshot = {
  userId: '',
  createdAt: new Date(),
  analysisWindowDays: 7,
  domains: {},
  stressIndicators: [],
  overallLoadScore: 0,
  wellbeingScore: 0.5,
  synthesizedTriggers: [],
  patterns: [],
  metadata: {
    domainsWithData: [],
    domainsMissingData: ['sleep', 'calendar', 'finance', 'goals', 'relationships', 'habits'],
    dataQuality: 'low',
    processingTimeMs: 0,
  },
};

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Domain data collector interface
 */
export interface DomainDataCollector<T> {
  /** Collect domain-specific data for a user */
  collect(userId: string, windowDays: number): Promise<T | null>;
  /** Domain name */
  readonly domain: string;
  /** Source persona */
  readonly sourcePersona: string;
}

/**
 * Aggregator configuration
 */
export interface AggregatorConfig {
  /** Number of days to analyze */
  analysisWindowDays: number;
  /** Minimum data quality to include a domain */
  minConfidence: number;
  /** Maximum triggers to generate */
  maxTriggers: number;
  /** Stress threshold for generating support triggers */
  supportTriggerThreshold: number;
  /** Celebration threshold for generating celebration triggers */
  celebrationThreshold: number;
}

/**
 * Default aggregator configuration
 */
export const DEFAULT_AGGREGATOR_CONFIG: AggregatorConfig = {
  analysisWindowDays: 7,
  minConfidence: 0.3,
  maxTriggers: 5,
  supportTriggerThreshold: 0.6,
  celebrationThreshold: 0.7,
};
