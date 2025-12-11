/**
 * Personal Journey Awareness - Shared Types
 *
 * Types for the Personal Journey Awareness system that makes Ferni
 * "better than human" at remembering and celebrating a user's journey.
 *
 * Philosophy: These types support CELEBRATION, not SURVEILLANCE.
 * Everything is framed as relationship-building, not tracking.
 *
 * @module services/personal-journey/types
 */

// ============================================================================
// RHYTHM AWARENESS TYPES
// ============================================================================

/**
 * Tracks a user's usage patterns for celebration (not surveillance)
 */
export interface UserRhythm {
  userId: string;
  updatedAt: Date;

  /** Session history and streaks */
  sessions: {
    /** Total number of conversations */
    totalCount: number;
    /** When we first met */
    firstSession: Date;
    /** Most recent conversation */
    lastSession: Date;
    /** Average sessions per week */
    averageSessionsPerWeek: number;
    /** Current consecutive days with sessions */
    currentStreak: number;
    /** Longest streak ever achieved */
    longestStreak: number;
    /** When current streak started */
    streakStartDate?: Date;
  };

  /** Time preferences (when they like to chat) */
  timePreferences: {
    /** Hours with highest activity (0-23) */
    preferredHours: number[];
    /** Days with highest activity (0=Sun, 6=Sat) */
    preferredDays: number[];
    /** General time preference */
    mostActiveTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    /** Weekend vs weekday preference */
    weekdayVsWeekend: 'weekday' | 'weekend' | 'balanced';
  };

  /** Consistency patterns */
  consistency: {
    /** Average days between sessions */
    averageGapDays: number;
    /** Longest gap ever */
    longestGap: number;
    /** Is user consistently showing up? */
    isConsistent: boolean;
    /** Days since last session */
    currentGapDays: number;
  };

  /** Milestones achieved */
  rhythmMilestones: RhythmMilestone[];
}

export type RhythmMilestoneType =
  | 'first_conversation'
  | 'conversation_10'
  | 'conversation_25'
  | 'conversation_50'
  | 'conversation_100'
  | 'conversation_250'
  | 'conversation_500'
  | 'streak_3'
  | 'streak_7'
  | 'streak_14'
  | 'streak_30'
  | 'streak_60'
  | 'streak_100'
  | 'one_week'
  | 'one_month'
  | 'three_months'
  | 'six_months'
  | 'one_year'
  | 'two_years';

export interface RhythmMilestone {
  type: RhythmMilestoneType;
  achievedAt: Date;
  /** Has Ferni acknowledged this milestone? */
  acknowledged: boolean;
  /** When was it acknowledged */
  acknowledgedAt?: Date;
}

// ============================================================================
// SEASONAL MEMORY TYPES
// ============================================================================

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

/**
 * Time-anchored memories for seasonal awareness
 */
export interface SeasonalMemory {
  userId: string;
  updatedAt: Date;

  /** Snapshots of state at end of each season */
  seasonalSnapshots: SeasonalSnapshot[];

  /** Specific memories tied to times of year */
  timeAnchors: TimeAnchoredMemory[];

  /** Recurring annual patterns we've noticed */
  annualPatterns: AnnualPattern[];
}

export interface SeasonalSnapshot {
  id: string;
  season: Season;
  year: number;
  /** Overall emotional state that season */
  emotionalState: string;
  /** Main themes discussed */
  activeThemes: string[];
  /** Notable moments */
  keyMoments: string[];
  /** Challenges faced */
  struggles?: string[];
  /** Wins achieved */
  wins?: string[];
  /** When this snapshot was captured */
  capturedAt: Date;
}

export interface TimeAnchoredMemory {
  id: string;
  /** Approximate date (fuzzy matching) */
  approximateDate: Date;
  /** What happened */
  description: string;
  /** Emotional weight (0-1) */
  emotionalWeight: number;
  /** Related topics */
  topics: string[];
  /** User has consented to references */
  canReference: boolean;
  /** Has this been referenced recently? */
  lastReferenced?: Date;
}

export interface AnnualPattern {
  id: string;
  /** Time of year description */
  timeOfYear: string;
  /** What we've noticed */
  pattern: string;
  /** How confident we are */
  confidence: number;
  /** Years of data supporting this */
  yearsObserved: number;
}

// ============================================================================
// LIFE CHAPTER TYPES
// ============================================================================

/**
 * Recognizes and honors life phases/chapters
 */
export interface LifeChapters {
  userId: string;
  updatedAt: Date;

  /** Current life chapter */
  currentChapter?: LifeChapter;

  /** Past chapters */
  pastChapters: LifeChapter[];

  /** Transition signals */
  transitionSignals: TransitionSignals;
}

export interface LifeChapter {
  id: string;
  /** Theme of this chapter */
  theme: string;
  /** When it approximately started */
  startedApprox: Date;
  /** When it ended (if past) */
  endedApprox?: Date;
  /** Dominant emotions during this chapter */
  dominantEmotions: string[];
  /** Key topics discussed */
  keyTopics: string[];
  /** Challenges faced */
  challenges: string[];
  /** Growth achieved */
  growth: string[];
  /** Summary (for past chapters) */
  summary?: string;
  /** Lessons learned (for past chapters) */
  lessonsLearned?: string[];
}

export interface TransitionSignals {
  /** Is user currently in transition? */
  isInTransition: boolean;
  /** What kind of transition */
  transitionType?: 'beginning' | 'middle' | 'ending';
  /** From what chapter */
  fromChapter?: string;
  /** To what chapter */
  toChapter?: string;
  /** How confident are we */
  confidence: number;
  /** When we detected this */
  detectedAt?: Date;
}

// ============================================================================
// JOURNEY ORCHESTRATOR TYPES
// ============================================================================

export type JourneyMomentType =
  | 'rhythm_milestone'
  | 'rhythm_acknowledgment'
  | 'seasonal_memory'
  | 'seasonal_pattern'
  | 'chapter_transition'
  | 'chapter_reflection'
  | 'growth_mirror'
  | 'social_insight'
  | 'world_awareness'
  | 'community_wisdom';

/**
 * A moment that could be shared with the user
 */
export interface JourneyMoment {
  id: string;
  type: JourneyMomentType;
  /** Priority 1-10 (10 = highest) */
  priority: number;
  /** The content/message */
  content: string;
  /** Additional context for the LLM */
  context: Record<string, unknown>;
  /** When this moment expires (if applicable) */
  expiresAt?: Date;
  /** Minimum relationship stage required */
  requiresRelationshipStage?: 'new' | 'building' | 'established' | 'deep';
  /** Source service that generated this */
  source: string;
}

/**
 * Record of delivered moments (to prevent repetition)
 */
export interface DeliveryRecord {
  momentId: string;
  momentType: JourneyMomentType;
  deliveredAt: Date;
  /** User's reaction if detectable */
  reaction?: 'positive' | 'neutral' | 'negative';
  /** Context when delivered */
  turnCount?: number;
  /** Hash of content for similarity checking */
  contentHash?: string;
}

// ============================================================================
// COMMUNITY WISDOM TYPES
// ============================================================================

/**
 * Privacy-safe, pre-written wisdom from aggregate journeys
 */
export interface CommunityWisdomEntry {
  id: string;
  /** What journey/situation this applies to */
  journeyType: string;
  /** Wisdom nuggets */
  wisdomNuggets: string[];
  /** Common challenges people face */
  commonChallenges: string[];
  /** What tends to help */
  whatHelps: string[];
}

export interface CommonPattern {
  id: string;
  /** The pattern description */
  pattern: string;
  /** How common is this */
  prevalence: 'common' | 'very_common' | 'universal';
  /** Comforting message about this pattern */
  comfortingMessage: string;
}

// ============================================================================
// CONTEXT BUILDER TYPES
// ============================================================================

export type PersonalJourneyInjectionType =
  | 'milestone'
  | 'rhythm'
  | 'seasonal'
  | 'chapter'
  | 'growth'
  | 'wisdom';

export interface PersonalJourneyInjection {
  type: PersonalJourneyInjectionType;
  /** Standard injection or soft hint */
  style: 'standard' | 'hint';
  /** The injection content */
  content: string;
  /** Priority for ordering */
  priority: number;
  /** Source moment ID */
  momentId?: string;
}

// ============================================================================
// AGGREGATE TYPES
// ============================================================================

/**
 * Complete personal journey data for a user
 */
export interface PersonalJourneyData {
  userId: string;
  rhythm: UserRhythm;
  seasonal: SeasonalMemory;
  chapters: LifeChapters;
  deliveryHistory: DeliveryRecord[];
  updatedAt: Date;
}

/**
 * Snapshot of journey state for quick access
 */
export interface JourneySnapshot {
  userId: string;
  /** Key stats */
  stats: {
    totalConversations: number;
    daysKnown: number;
    currentStreak: number;
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
  };
  /** Available moments to potentially share */
  availableMoments: JourneyMoment[];
  /** Recently delivered (for repetition prevention) */
  recentDeliveries: DeliveryRecord[];
  /** Current chapter if detected */
  currentChapter?: string;
  /** Is in transition */
  inTransition: boolean;
  /** Captured at */
  capturedAt: Date;
}
