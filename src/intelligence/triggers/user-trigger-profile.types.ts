/**
 * User Trigger Profile Types
 *
 * Phase 2: Personal Memory Integration
 *
 * These types define the personal context that makes triggers "Better than Human."
 * A good friend remembers your mom's name, the anniversary of your loss,
 * and the phrases you use when you're deflecting. Ferni should too.
 *
 * @module UserTriggerProfileTypes
 */

// ============================================================================
// SIGNIFICANT DATES
// ============================================================================

/**
 * Types of significant dates we track
 */
export type SignificantDateType =
  | 'anniversary' // Wedding, dating, etc.
  | 'birthday' // User's or someone they care about
  | 'loss' // Death of loved one
  | 'milestone' // Achievement, graduation, promotion
  | 'medical' // Diagnosis, surgery, health event
  | 'trauma' // Difficult event to process
  | 'celebration' // Recurring positive event
  | 'custom'; // User-defined

/**
 * A significant date in the user's life
 */
export interface SignificantDate {
  /** Unique identifier */
  id: string;
  /** The date (YYYY-MM-DD format for recurring, full ISO for one-time) */
  date: string;
  /** Whether this recurs annually */
  isRecurring: boolean;
  /** Type of significance */
  type: SignificantDateType;
  /** What this date represents */
  description: string;
  /** Who this date relates to (if applicable) */
  relatedPerson?: string;
  /** Emotional weight (0-1, higher = more emotionally significant) */
  emotionalWeight: number;
  /** Trigger categories this date activates */
  triggerCategories: string[];
  /** When we learned about this date */
  extractedAt: Date;
  /** Confidence in the extraction (0-1) */
  confidence: number;
  /** Source: 'explicit' (user told us) or 'inferred' (we figured it out) */
  source: 'explicit' | 'inferred';
}

// ============================================================================
// RELATIONSHIPS
// ============================================================================

/**
 * Types of relationships
 */
export type RelationshipType =
  | 'family' // Parent, sibling, child, etc.
  | 'romantic' // Partner, spouse, ex
  | 'friend' // Close friend
  | 'colleague' // Work relationship
  | 'mentor' // Someone they look up to
  | 'mentee' // Someone they guide
  | 'pet' // Furry family member
  | 'deceased' // Someone who has passed
  | 'estranged' // Complicated relationship
  | 'other';

/**
 * Emotional valence of a relationship
 */
export type EmotionalValence =
  | 'very_positive' // Deep love, admiration
  | 'positive' // Good relationship
  | 'neutral' // No strong feelings
  | 'complicated' // Mixed feelings
  | 'negative' // Difficult relationship
  | 'very_negative'; // Toxic/traumatic

/**
 * A person in the user's life
 */
export interface Relationship {
  /** Unique identifier */
  id: string;
  /** Name or identifier they use */
  name: string;
  /** Alternative names/nicknames */
  aliases: string[];
  /** Type of relationship */
  type: RelationshipType;
  /** More specific role (e.g., "mother", "best friend", "ex-husband") */
  role?: string;
  /** Emotional valence of this relationship */
  emotionalValence: EmotionalValence;
  /** Whether this person has passed away */
  isDeceased: boolean;
  /** Trigger categories mentions of this person activate */
  triggerCategories: string[];
  /** How often they mention this person (mentions per conversation) */
  mentionFrequency: number;
  /** Last time they mentioned this person */
  lastMentioned?: Date;
  /** Topics associated with this person */
  associatedTopics: string[];
  /** When we first learned about this person */
  extractedAt: Date;
  /** Confidence in the extraction (0-1) */
  confidence: number;
}

// ============================================================================
// COMMUNICATION PATTERNS
// ============================================================================

/**
 * A phrase pattern the user uses
 */
export interface PhrasePattern {
  /** The actual phrase detected */
  phrase: string;
  /** The pattern (regex string or exact phrase) - optional for legacy */
  pattern?: string;
  /** Whether this is a regex pattern */
  isRegex?: boolean;
  /** What this pattern indicates - legacy format */
  meaning?: 'deflection' | 'vulnerability' | 'avoidance' | 'openness' | 'distress';
  /** Context around the phrase */
  context?: string;
  /** Number of times we've observed this phrase */
  frequency: number;
  /** First time this phrase was used */
  firstUsed?: Date;
  /** Last time this phrase was used */
  lastUsed?: Date;
  /** Trigger category this activates */
  triggerCategory: string;
  /** Emotional weight (0-1) */
  emotionalWeight: number;
  /** How reliably this pattern predicts the meaning */
  reliability?: number;
  /** Number of times we've observed this pattern - legacy */
  observationCount?: number;
  /** Example contexts where this was used - legacy */
  exampleContexts?: string[];
}

/**
 * Times when user is more/less open
 */
export interface TemporalPattern {
  /** Pattern type - legacy format */
  type?: 'time_of_day' | 'day_of_week' | 'monthly' | 'seasonal';
  /** The pattern value (e.g., "22:00-04:00" for late night) - legacy format */
  value?: string;
  /** Time of day category */
  timeOfDay: 'late_night' | 'early_morning' | 'morning' | 'afternoon' | 'evening';
  /** Day of week if applicable */
  dayOfWeek?: string;
  /** How often this pattern occurs */
  frequency: number;
  /** Topics discussed during this time */
  associatedTopics: string[];
  /** Significance level (0-1) */
  significanceLevel: number;
  /** What triggers are more effective during this time - legacy */
  effectiveTriggers?: string[];
  /** What triggers to avoid during this time - legacy */
  ineffectiveTriggers?: string[];
  /** Confidence in this pattern - legacy */
  confidence?: number;
}

/**
 * Topics the user avoids or is sensitive about
 */
export interface SensitiveTopic {
  /** Topic identifier */
  topic: string;
  /** Keywords that indicate this topic */
  keywords: string[];
  /** How sensitive (0-1) */
  sensitivity: number;
  /** Whether user has explicitly said they don't want to discuss */
  explicitlyAvoided: boolean;
  /** Trigger approach when this topic comes up */
  recommendedApproach: 'gentle' | 'direct' | 'avoid' | 'wait';
}

/**
 * User's communication patterns
 */
export interface CommunicationPatterns {
  /** All phrase patterns detected */
  phrasePatterns: PhrasePattern[];
  /** Phrases that indicate deflection - legacy */
  deflectionPhrases?: PhrasePattern[];
  /** Phrases that indicate vulnerability/openness - legacy */
  vulnerabilitySignals?: PhrasePattern[];
  /** Topics they're sensitive about */
  sensitiveTopics: SensitiveTopic[];
  /** Time-based patterns */
  temporalPatterns: TemporalPattern[];
  /** Overall communication style */
  communicationStyle?: {
    /** How direct vs indirect they prefer */
    directness: 'very_direct' | 'direct' | 'balanced' | 'indirect' | 'very_indirect';
    /** How much they process verbally vs internally */
    processingStyle: 'external' | 'balanced' | 'internal';
    /** How quickly they open up */
    openingSpeed: 'fast' | 'moderate' | 'slow' | 'very_slow';
  };
}

// ============================================================================
// TRIGGER EFFECTIVENESS
// ============================================================================

/**
 * Track which triggers have worked for this user
 */
export interface TriggerEffectiveness {
  /** Trigger name */
  triggerName: string;
  /** Times this trigger fired */
  timesFired: number;
  /** Times user engaged positively after trigger */
  positiveEngagements: number;
  /** Times user seemed to disengage or deflect */
  negativeEngagements: number;
  /** Times user explicitly appreciated the trigger */
  explicitAppreciation: number;
  /** Calculated effectiveness score (0-1) */
  effectivenessScore: number;
  /** Contexts where this trigger worked best */
  effectiveContexts: string[];
  /** Contexts where this trigger didn't work */
  ineffectiveContexts: string[];
  /** Last time this trigger was used */
  lastUsed?: Date;
}

// ============================================================================
// PHASE 3: TEMPORAL INTELLIGENCE
// ============================================================================

/**
 * Day of week for pattern detection
 */
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

/**
 * Time of day buckets for pattern detection
 */
export type TimeOfDayBucket =
  | 'late_night' // 12am-5am
  | 'early_morning' // 5am-8am
  | 'morning' // 8am-12pm
  | 'afternoon' // 12pm-5pm
  | 'evening' // 5pm-9pm
  | 'night'; // 9pm-12am

/**
 * A single trigger firing event for temporal analysis
 */
export interface TriggerFiringEvent {
  /** When the trigger fired */
  timestamp: Date;
  /** Which trigger fired */
  triggerName: string;
  /** Category of the trigger */
  triggerCategory: string;
  /** Whether user engaged positively */
  outcome: 'engaged' | 'deflected' | 'neutral' | 'unknown';
  /** Day of week */
  dayOfWeek: DayOfWeek;
  /** Time of day bucket */
  timeOfDay: TimeOfDayBucket;
  /** Hour (0-23) for fine-grained analysis */
  hour: number;
  /** Session ID for grouping */
  sessionId?: string;
  /** Proximity to a significant date (days away, negative = past) */
  dateProximity?: {
    dateId: string;
    daysAway: number;
    dateType: SignificantDateType;
  };
}

/**
 * Statistical pattern for day-of-week correlations
 */
export interface DayOfWeekPattern {
  /** The day this pattern is for */
  day: DayOfWeek;
  /** Trigger categories that spike on this day */
  elevatedCategories: Array<{
    category: string;
    /** How much higher than average (1.0 = average, 1.5 = 50% higher) */
    multiplier: number;
    /** Statistical confidence (0-1) */
    confidence: number;
    /** Sample size */
    observations: number;
  }>;
  /** Overall emotional intensity multiplier for this day */
  intensityMultiplier: number;
  /** Specific triggers that work well on this day */
  effectiveTriggers: string[];
  /** Specific triggers to avoid on this day */
  triggersToAvoid: string[];
}

/**
 * Statistical pattern for time-of-day correlations
 */
export interface TimeOfDayPattern {
  /** The time bucket this pattern is for */
  timeBucket: TimeOfDayBucket;
  /** Trigger categories that spike during this time */
  elevatedCategories: Array<{
    category: string;
    multiplier: number;
    confidence: number;
    observations: number;
  }>;
  /** Overall emotional intensity multiplier for this time */
  intensityMultiplier: number;
  /** Specific triggers that work well during this time */
  effectiveTriggers: string[];
  /** Specific triggers to avoid during this time */
  triggersToAvoid: string[];
  /** Common topics during this time */
  commonTopics: string[];
}

/**
 * Anniversary/recurring date pattern with proximity tracking
 */
export interface RecurringDatePattern {
  /** Reference to the significant date */
  dateId: string;
  /** How many days before the date triggers start spiking */
  leadTimeDays: number;
  /** How many days after the date triggers remain elevated */
  trailTimeDays: number;
  /** Categories that spike around this date */
  elevatedCategories: Array<{
    category: string;
    multiplier: number;
    confidence: number;
  }>;
  /** Observed behavior changes approaching this date */
  approachBehavior: 'increased_anxiety' | 'withdrawal' | 'increased_engagement' | 'neutral';
  /** Last few years' patterns (for multi-year analysis) */
  yearlyPatterns?: Array<{
    year: number;
    peakIntensity: number;
    daysOfElevation: number;
  }>;
}

/**
 * Complete temporal intelligence profile for a user
 */
export interface TemporalIntelligence {
  /** Day-of-week patterns */
  dayPatterns: DayOfWeekPattern[];
  /** Time-of-day patterns */
  timePatterns: TimeOfDayPattern[];
  /** Recurring date patterns (anniversaries, etc.) */
  datePatterns: RecurringDatePattern[];
  /** Raw firing events (last 90 days) for pattern detection */
  recentFirings: TriggerFiringEvent[];
  /** Last time patterns were recalculated */
  lastAnalyzedAt: Date;
  /** Minimum observations needed for statistical significance */
  minObservationsForPattern: number;
  /** Overall confidence in temporal patterns (0-1) */
  overallConfidence: number;
}

// ============================================================================
// PHASE 5: ANTICIPATORY INTELLIGENCE
// ============================================================================

/**
 * What we anticipate will follow a signal
 */
export type AnticipatedOutcomeType =
  | 'vulnerability' // User is about to share something vulnerable
  | 'distress' // User is about to express distress
  | 'request' // User is about to ask for something
  | 'celebration' // User is about to share good news
  | 'processing' // User is working through something
  | 'avoidance' // User is about to deflect
  | 'unknown'; // Not enough data to predict

/**
 * Voice prosody cues that can be combined with text signals
 */
export interface VoiceProsodyCue {
  /** Type of voice cue detected */
  type: 'tremor' | 'pause' | 'speed_change' | 'pitch_change' | 'volume_change' | 'breath_pattern';
  /** Direction of change (if applicable) */
  direction?: 'increase' | 'decrease' | 'irregular';
  /** Intensity of the cue (0-1) */
  intensity: number;
  /** Typical meaning of this cue for this user */
  typicalMeaning: AnticipatedOutcomeType;
  /** How reliably this predicts the outcome */
  reliability: number;
  /** Number of observations */
  observations: number;
}

/**
 * A text-based anticipatory signal learned from user patterns
 */
export interface AnticipatorySignal {
  /** Unique identifier */
  id: string;
  /** The signal phrase or pattern */
  phrase: string;
  /** Whether this is a regex pattern */
  isRegex: boolean;
  /** What this signal typically precedes */
  anticipatedOutcome: AnticipatedOutcomeType;
  /** Specific trigger categories this activates */
  triggersCategories: string[];
  /** Probability this signal leads to the anticipated outcome (0-1) */
  probability: number;
  /** Number of times we've observed this pattern */
  observations: number;
  /** Number of times the prediction was correct */
  correctPredictions: number;
  /** Example contexts where this signal was used */
  exampleContexts: string[];
  /** Voice prosody cues often co-occurring with this signal */
  associatedVoiceCues: VoiceProsodyCue[];
  /** When we first observed this pattern */
  firstObserved: Date;
  /** When we last observed this pattern */
  lastObserved: Date;
  /** Whether this was explicitly confirmed by user */
  userConfirmed: boolean;
}

/**
 * A recorded instance where anticipation was used
 */
export interface AnticipationEvent {
  /** When anticipation was triggered */
  timestamp: Date;
  /** The signal that triggered anticipation */
  signalId: string;
  /** The partial input that triggered it */
  partialInput: string;
  /** Voice prosody score at the time (0-1) */
  voiceProsodyScore: number;
  /** The response given */
  responseType: 'space_creating' | 'gentle_prompt' | 'silent_presence' | 'acknowledgment';
  /** User's reaction to the anticipation */
  userReaction: 'appreciated' | 'continued' | 'ignored' | 'corrected' | 'annoyed' | 'unknown';
  /** Whether our prediction was correct */
  predictionCorrect: boolean;
  /** Session context */
  sessionId: string;
}

/**
 * User preferences for anticipatory behavior
 */
export interface AnticipationSafeguards {
  /** Whether user has enabled anticipatory responses */
  enabled: boolean;
  /** Minimum confidence required before anticipating (0-1) */
  minConfidenceThreshold: number;
  /** Minimum input length before considering anticipation */
  minInputLength: number;
  /** Maximum anticipations per session */
  maxPerSession: number;
  /** Minimum seconds between anticipations */
  minSecondsBetween: number;
  /** Topics where anticipation should never trigger */
  disabledTopics: string[];
  /** Times when anticipation is disabled */
  disabledTimes: Array<{
    startHour: number;
    endHour: number;
    reason?: string;
  }>;
  /** User's explicit feedback about anticipation */
  userFeedback?: {
    overallSentiment: 'positive' | 'neutral' | 'negative';
    comments: string[];
    lastUpdated: Date;
  };
}

/**
 * Complete anticipatory intelligence profile
 */
export interface AnticipatoryIntelligence {
  /** Learned anticipatory signals */
  signals: AnticipatorySignal[];
  /** Voice prosody patterns */
  voiceCues: VoiceProsodyCue[];
  /** History of anticipation events (last 30 days) */
  recentEvents: AnticipationEvent[];
  /** User's safeguard preferences */
  safeguards: AnticipationSafeguards;
  /** Overall accuracy of anticipations (0-1) */
  overallAccuracy: number;
  /** Minimum observations needed for a signal to be used */
  minObservationsForSignal: number;
  /** Last time patterns were analyzed */
  lastAnalyzedAt: Date;
}

/**
 * Default anticipatory safeguards for new users
 */
export const DEFAULT_ANTICIPATION_SAFEGUARDS: AnticipationSafeguards = {
  enabled: true, // Opt-in by default, but conservative
  minConfidenceThreshold: 0.7, // High confidence required
  minInputLength: 15, // At least 15 characters
  maxPerSession: 3, // Max 3 anticipations per session
  minSecondsBetween: 120, // At least 2 minutes between anticipations
  disabledTopics: [],
  disabledTimes: [],
};

/**
 * Default anticipatory intelligence for new users
 */
export const DEFAULT_ANTICIPATORY_INTELLIGENCE: AnticipatoryIntelligence = {
  signals: [],
  voiceCues: [],
  recentEvents: [],
  safeguards: DEFAULT_ANTICIPATION_SAFEGUARDS,
  overallAccuracy: 0,
  minObservationsForSignal: 3,
  lastAnalyzedAt: new Date(),
};

// ============================================================================
// MAIN PROFILE TYPE
// ============================================================================

/**
 * Complete user trigger profile
 *
 * This is the "memory" that makes triggers personal.
 */
export interface UserTriggerProfile {
  /** User ID */
  userId: string;
  /** Version for schema migrations */
  schemaVersion: number;

  // === Personal Context ===
  /** Significant dates in their life */
  significantDates: SignificantDate[];
  /** People in their life */
  relationships: Relationship[];
  /** Communication patterns we've observed */
  communicationPatterns: CommunicationPatterns;

  // === Trigger History ===
  /** Effectiveness of triggers for this user */
  triggerEffectiveness: TriggerEffectiveness[];

  // === Phase 3: Temporal Intelligence ===
  /** Time-based patterns and correlations */
  temporalIntelligence?: TemporalIntelligence;

  // === Phase 5: Anticipatory Intelligence ===
  /** Anticipatory signal patterns and preferences */
  anticipatoryIntelligence?: AnticipatoryIntelligence;

  // === Metadata ===
  /** When profile was created */
  createdAt: Date;
  /** When profile was last updated */
  updatedAt: Date;
  /** Total conversations analyzed */
  conversationsAnalyzed: number;
  /** Confidence in overall profile (0-1) */
  profileConfidence: number;
}

/**
 * Default empty temporal intelligence for new users
 */
export const DEFAULT_TEMPORAL_INTELLIGENCE: TemporalIntelligence = {
  dayPatterns: [],
  timePatterns: [],
  datePatterns: [],
  recentFirings: [],
  lastAnalyzedAt: new Date(),
  minObservationsForPattern: 5,
  overallConfidence: 0,
};

/**
 * Default empty profile for new users
 */
export const DEFAULT_USER_TRIGGER_PROFILE: Omit<UserTriggerProfile, 'userId'> = {
  schemaVersion: 3, // Bumped for Phase 5 anticipatory intelligence
  significantDates: [],
  relationships: [],
  communicationPatterns: {
    phrasePatterns: [],
    deflectionPhrases: [],
    vulnerabilitySignals: [],
    sensitiveTopics: [],
    temporalPatterns: [],
    communicationStyle: {
      directness: 'balanced',
      processingStyle: 'balanced',
      openingSpeed: 'moderate',
    },
  },
  triggerEffectiveness: [],
  temporalIntelligence: DEFAULT_TEMPORAL_INTELLIGENCE,
  anticipatoryIntelligence: DEFAULT_ANTICIPATORY_INTELLIGENCE,
  createdAt: new Date(),
  updatedAt: new Date(),
  conversationsAnalyzed: 0,
  profileConfidence: 0,
};

// ============================================================================
// EXTRACTION RESULTS
// ============================================================================

/**
 * Result of extracting personal data from conversation
 */
export interface ProfileExtractionResult {
  /** New significant dates found */
  significantDates: SignificantDate[];
  /** New or updated relationships */
  relationships: Relationship[];
  /** Pattern updates */
  patternUpdates: {
    deflectionPhrases: PhrasePattern[];
    vulnerabilitySignals: PhrasePattern[];
    sensitiveTopics: SensitiveTopic[];
  };
  /** Confidence in extraction */
  confidence: number;
  /** Source conversation ID */
  conversationId?: string;
}

/**
 * Context boost based on profile
 */
export interface ProfileContextBoost {
  /** Triggers to boost */
  triggersToBoost: Array<{
    triggerName: string;
    boostAmount: number;
    reason: string;
  }>;
  /** Triggers to suppress */
  triggersToSuppress: Array<{
    triggerName: string;
    suppressAmount: number;
    reason: string;
  }>;
  /** Additional context to inject */
  contextInjections: Array<{
    type: 'relationship' | 'date' | 'pattern';
    content: string;
  }>;
}
