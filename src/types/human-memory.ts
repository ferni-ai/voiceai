/**
 * Human-Centric Memory Types
 *
 * "Better than human" memory that captures what makes someone feel truly known.
 * These aren't just data points - they're the texture of a relationship.
 *
 * Philosophy: A great friend remembers not just what you said, but how you felt,
 * what you didn't say, and the small moments that matter.
 */

// ============================================================================
// IMPORTANT DATES - "Happy anniversary!"
// ============================================================================

/**
 * A date that matters to the user
 */
export interface ImportantDate {
  id: string;
  /** Type of date */
  type:
    | 'birthday' // User's birthday
    | 'anniversary' // Wedding, relationship, etc.
    | 'loss_anniversary' // Memorial dates
    | 'milestone' // Sobriety date, quit smoking, etc.
    | 'recurring' // Tax season, annual review, etc.
    | 'celebration' // Promotion date, graduation, etc.
    | 'custom';

  /** Human-readable label */
  label: string;

  /** Month (1-12) */
  month: number;

  /** Day of month (1-31) */
  day: number;

  /** Year if known (null for recurring without year) */
  year?: number;

  /** Who this date relates to (null = user themselves) */
  relatedPerson?: string;

  /** Emotional weight of this date */
  significance: 'routine' | 'meaningful' | 'major' | 'life_changing';

  /** Whether user wants acknowledgment on this date */
  wantsAcknowledgment: boolean;

  /** How they prefer to handle this date */
  sentiment?: 'celebratory' | 'reflective' | 'sensitive' | 'neutral';

  /** Any notes about this date */
  notes?: string;

  /** When we learned about this date */
  discoveredAt: Date;

  /** Last time we acknowledged it */
  lastAcknowledged?: Date;
}

// ============================================================================
// EMOTIONAL SIGNATURE - "I can tell something's off"
// ============================================================================

/**
 * What makes this person laugh
 */
export interface HumorProfile {
  /** Types of humor they respond to */
  appreciates: Array<
    | 'wordplay' // Puns, clever language
    | 'self_deprecating' // Humble humor
    | 'absurdist' // Silly, random
    | 'dry' // Deadpan, understated
    | 'warm' // Kind, gentle humor
    | 'sarcastic' // Witty, sharp
    | 'dad_jokes' // Groan-worthy puns
    | 'dark' // Edgy humor
    | 'observational' // Relatable observations
  >;

  /** Things that fell flat */
  avoids: string[];

  /** Specific jokes/moments that landed well */
  successfulMoments: Array<{
    context: string;
    whatWorked: string;
    timestamp: Date;
  }>;

  /** Overall humor reception level */
  overallLevel: 'loves_it' | 'enjoys_moderately' | 'prefers_serious' | 'rarely';
}

/**
 * What comforts them when they're struggling
 */
export interface ComfortPattern {
  id: string;
  /** What type of support helps */
  type:
    | 'validation' // "That makes sense you'd feel that way"
    | 'problem_solving' // Jump to solutions
    | 'distraction' // Change subject, lighten mood
    | 'presence' // Just being there, listening
    | 'encouragement' // "You've got this"
    | 'perspective' // Reframing, bigger picture
    | 'humor' // Lightening the mood
    | 'practical_help' // "What can I do?"
    | 'space'; // Sometimes they need distance

  /** When this comfort style works */
  effectiveFor: string; // "work stress", "family issues", etc.

  /** Evidence this works */
  evidence: string;

  /** When we learned this */
  discoveredAt: Date;
}

/**
 * Their emotional "tells" - how we know something's off
 */
export interface EmotionalTell {
  id: string;
  /** What behavior indicates something */
  signal: string; // "short responses", "talking fast", "lots of sighs"

  /** What it usually means */
  interpretation: string; // "stressed about work", "didn't sleep well"

  /** Confidence in this pattern */
  confidence: number; // 0-1

  /** Times we've observed this */
  observations: number;

  /** When we first noticed */
  discoveredAt: Date;
}

/**
 * Stress triggers and anxiety patterns
 */
export interface StressTrigger {
  id: string;
  /** What triggers stress */
  trigger: string;

  /** Category of trigger */
  category:
    | 'work' // Boss, deadlines, meetings
    | 'financial' // Money worries
    | 'health' // Medical, fitness
    | 'relationships' // Family, friends, partner
    | 'time' // Being rushed, lateness
    | 'uncertainty' // Not knowing outcomes
    | 'social' // Events, networking
    | 'seasonal' // Tax time, holidays
    | 'other';

  /** How intense this trigger usually is */
  intensity: 'mild' | 'moderate' | 'significant' | 'severe';

  /** What helps when this is triggered */
  helpfulResponses?: string[];

  /** What to avoid when this is triggered */
  unhelpfulResponses?: string[];

  /** When we learned about this */
  discoveredAt: Date;
}

/**
 * Complete emotional signature
 */
export interface EmotionalSignature {
  /** What makes them laugh */
  humor: HumorProfile;

  /** What comforts them */
  comfortPatterns: ComfortPattern[];

  /** Their tells - how we know something's off */
  tells: EmotionalTell[];

  /** What stresses them */
  stressTriggers: StressTrigger[];

  /** How they celebrate wins */
  celebrationStyle?: 'loud_proud' | 'humble_deflect' | 'quiet_satisfaction' | 'share_credit';

  /** Their default emotional baseline */
  baseline?: 'optimistic' | 'realistic' | 'anxious' | 'stoic' | 'expressive';

  /** How emotionally open they are */
  openness?: 'very_open' | 'warms_up' | 'private' | 'guarded';

  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// RELATIONSHIP TEXTURE - "Remember when we..."
// ============================================================================

/**
 * An inside joke or shared reference
 */
export interface InsideJoke {
  id: string;
  /** The reference or callback */
  reference: string;

  /** Context of how it started */
  origin: string;

  /** When it originated */
  originatedAt: Date;

  /** Times we've used it */
  usageCount: number;

  /** Last time it came up */
  lastUsed?: Date;

  /** Still funny or worn out? */
  status: 'fresh' | 'beloved' | 'retired';
}

/**
 * Running themes in conversations
 */
export interface RunningTheme {
  id: string;
  /** The theme */
  theme: string; // "your garden project", "learning Spanish"

  /** How often it comes up */
  frequency: 'every_session' | 'often' | 'occasionally' | 'rare';

  /** Their typical sentiment about it */
  sentiment: 'positive' | 'mixed' | 'challenging' | 'evolving';

  /** Key moments in this theme */
  keyMoments: Array<{
    summary: string;
    timestamp: Date;
  }>;

  /** First mentioned */
  startedAt: Date;

  /** Last discussed */
  lastMentioned: Date;
}

/**
 * Something they've taught us (makes them feel valued)
 */
export interface UserTeaching {
  id: string;
  /** What they taught */
  topic: string;

  /** The insight or knowledge */
  content: string;

  /** When they shared it */
  sharedAt: Date;

  /** Have we referenced it back? */
  acknowledgedBack: boolean;
}

// ============================================================================
// IDENTITY & VALUES - "This is who they are"
// ============================================================================

/**
 * A core value they hold
 */
export interface CoreValue {
  id: string;
  /** The value */
  value: string; // "family first", "honesty", "hard work"

  /** Evidence we've seen of this */
  evidence: string[];

  /** How strongly they hold this */
  strength: 'mentioned' | 'evident' | 'core_identity';

  /** When we first noticed */
  discoveredAt: Date;
}

/**
 * A dream or aspiration (softer than goals)
 */
export interface Dream {
  id: string;
  /** The dream */
  description: string;

  /** Category */
  category:
    | 'career'
    | 'family'
    | 'creative'
    | 'travel'
    | 'learning'
    | 'lifestyle'
    | 'legacy'
    | 'relationship'
    | 'health'
    | 'other';

  /** How they talk about it */
  sentiment: 'excited' | 'wistful' | 'determined' | 'uncertain';

  /** Is this something they're pursuing or just dreaming? */
  status: 'active_pursuit' | 'someday' | 'back_burner' | 'letting_go';

  /** When they mentioned it */
  firstMentioned: Date;
}

/**
 * A fear or deep worry
 */
export interface Fear {
  id: string;
  /** The fear */
  fear: string;

  /** How often it comes up */
  frequency: 'constant' | 'recurring' | 'occasional' | 'rare';

  /** How they cope with it */
  copingMechanisms?: string[];

  /** When we learned about it */
  discoveredAt: Date;

  /** Sensitivity level for discussing */
  sensitivity: 'can_discuss' | 'tread_carefully' | 'avoid_unless_they_raise';
}

/**
 * Formative experiences that shaped them
 */
export interface FormativeExperience {
  id: string;
  /** Brief description */
  experience: string;

  /** How it shaped them */
  impact: string;

  /** Emotional weight */
  weight: 'defining' | 'significant' | 'notable';

  /** When they shared it */
  sharedAt: Date;
}

/**
 * Identity and values profile
 */
export interface IdentityProfile {
  /** Core values they hold */
  values: CoreValue[];

  /** Dreams and aspirations */
  dreams: Dream[];

  /** Fears and worries */
  fears: Fear[];

  /** Formative experiences */
  formativeExperiences: FormativeExperience[];

  /** How they see themselves (self-perception) */
  selfPerception?: string;

  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// GROWTH ARC - "Look how far you've come"
// ============================================================================

/**
 * A marker of growth or change
 */
export interface GrowthMarker {
  id: string;
  /** What changed */
  description: string;

  /** Before state */
  before: string;

  /** After state */
  after: string;

  /** When we noticed */
  observedAt: Date;

  /** Have we acknowledged this growth? */
  acknowledged: boolean;

  /** Their reaction when we mentioned it */
  reactionWhenAcknowledged?: 'appreciated' | 'deflected' | 'emotional' | 'surprised';
}

/**
 * Progress on a challenge they've been working on
 */
export interface ChallengeProgress {
  id: string;
  /** The challenge */
  challenge: string;

  /** Status */
  status: 'struggling' | 'working_on_it' | 'making_progress' | 'breakthrough' | 'resolved';

  /** Key moments in this journey */
  milestones: Array<{
    description: string;
    timestamp: Date;
  }>;

  /** First mentioned */
  startedAt: Date;

  /** Last update */
  lastUpdate: Date;
}

/**
 * Growth arc tracking
 */
export interface GrowthArc {
  /** Markers of growth we've observed */
  markers: GrowthMarker[];

  /** Challenges they're working through */
  challenges: ChallengeProgress[];

  /** Overall trajectory we've observed */
  trajectory?: 'thriving' | 'growing' | 'stable' | 'struggling' | 'rebuilding';

  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// THE UNSPOKEN - "What they're not saying"
// ============================================================================

/**
 * Topics they consistently avoid
 */
export interface RecurringAvoidance {
  id: string;
  /** Topic or area avoided */
  topic: string;

  /** How they avoid it */
  avoidanceStyle: 'deflects' | 'changes_subject' | 'brief_response' | 'visible_discomfort';

  /** Times we've noticed */
  observations: number;

  /** Our best guess why (if we have one) */
  possibleReason?: string;

  /** Should we ever gently approach this? */
  approach: 'never_raise' | 'only_if_they_do' | 'gentle_check_in_ok';

  /** First noticed */
  firstNoticed: Date;
}

/**
 * Patterns in when they reach out
 */
export interface ReachOutPattern {
  id: string;
  /** When they tend to reach out */
  pattern: string; // "late at night", "Monday mornings", "after work"

  /** What it usually correlates with */
  correlates: string; // "can't sleep", "rough weekend", "need to decompress"

  /** Confidence */
  confidence: number;

  /** Observations */
  observations: number;
}

/**
 * Voice/energy patterns
 */
export interface EnergyPattern {
  id: string;
  /** The pattern */
  pattern: string; // "speaking faster", "lots of pauses", "quieter than usual"

  /** What it indicates */
  indicates: string;

  /** How often we've seen this */
  observations: number;
}

/**
 * The unspoken - patterns in what they don't say
 */
export interface UnspokenPatterns {
  /** Topics they consistently avoid */
  avoidances: RecurringAvoidance[];

  /** Patterns in when they reach out */
  reachOutPatterns: ReachOutPattern[];

  /** Voice/energy patterns */
  energyPatterns: EnergyPattern[];

  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// TEMPORAL PATTERNS - "You always seem stressed in April"
// ============================================================================

/**
 * Seasonal or cyclical pattern
 */
export interface SeasonalPattern {
  id: string;
  /** The pattern */
  pattern: string;

  /** When it occurs */
  timing:
    | 'spring'
    | 'summer'
    | 'fall'
    | 'winter'
    | 'holidays'
    | 'tax_season'
    | 'school_year'
    | 'quarterly'
    | 'monthly'
    | 'weekly'
    | 'custom';

  /** Custom timing description if needed */
  customTiming?: string;

  /** Emotional tone during this period */
  emotionalTone: 'positive' | 'challenging' | 'mixed' | 'neutral';

  /** How to approach them during this time */
  approach?: string;

  /** Confidence in this pattern */
  confidence: number;

  /** Years observed */
  yearsObserved: number;
}

/**
 * Time of day patterns
 */
export interface TimeOfDayPattern {
  id: string;
  /** Time period */
  period: 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'late_night';

  /** How they typically are */
  typicalState: string; // "energized", "winding down", "reflective"

  /** Best type of conversation for this time */
  bestFor?: string; // "serious topics", "light chat", "problem-solving"

  /** Confidence */
  confidence: number;
}

/**
 * Temporal patterns
 */
export interface TemporalPatterns {
  /** Seasonal/cyclical patterns */
  seasonal: SeasonalPattern[];

  /** Time of day patterns */
  timeOfDay: TimeOfDayPattern[];

  /** "This time last year" memories */
  thisTimeLastYear?: Array<{
    description: string;
    mood: string;
    timestamp: Date;
  }>;

  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// COMPLETE HUMAN MEMORY
// ============================================================================

/**
 * Complete human-centric memory profile
 *
 * This captures everything that makes someone feel truly known.
 */
export interface HumanMemory {
  /** Important dates to remember */
  importantDates: ImportantDate[];

  /** Their emotional signature */
  emotionalSignature?: EmotionalSignature;

  /** Relationship texture (jokes, themes, teachings) */
  insideJokes: InsideJoke[];
  runningThemes: RunningTheme[];
  userTeachings: UserTeaching[];

  /** Identity and values */
  identity?: IdentityProfile;

  /** Growth arc */
  growthArc?: GrowthArc;

  /** The unspoken patterns */
  unspoken?: UnspokenPatterns;

  /** Temporal patterns */
  temporal?: TemporalPatterns;

  /** Last comprehensive update */
  updatedAt: Date;
}

