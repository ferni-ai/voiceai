/**
 * Behavior Schema - Context-Aware Behavior Definitions
 *
 * This schema defines the structure for ALL persona behaviors,
 * enabling dynamic, context-sensitive responses instead of static arrays.
 *
 * Key principles:
 * 1. CONTEXT AWARENESS - Behaviors adapt to user state, time, relationship
 * 2. PROGRESSIVE COMPLEXITY - Simple fallbacks when context unavailable
 * 3. COMPOSABLE ELEMENTS - Build responses from reusable components
 * 4. CROSS-PERSONA CONSISTENCY - All personas use the same structure
 */

// ============================================================================
// USER CONTEXT TYPES
// ============================================================================

/**
 * User's emotional state detected from conversation
 */
export type UserMood =
  | 'stressed'
  | 'neutral'
  | 'excited'
  | 'sad'
  | 'confused'
  | 'angry'
  | 'unknown';

/**
 * Time of day for energy adaptation
 */
export type TimeOfDay = 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';

/**
 * Relationship depth with specific persona
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

/**
 * Full context for behavior selection
 */
export interface BehaviorContext {
  // User state
  userMood: UserMood;
  userName?: string;

  // Relationship with THIS persona (not session-wide)
  meetingCount: number;
  relationshipStage: RelationshipStage;
  lastTopicWithAgent?: string;

  // Environment
  timeOfDay: TimeOfDay;
  isWeekend: boolean;
  season?: 'spring' | 'summer' | 'fall' | 'winter';

  // Conversation context
  precedingTopic?: string;
  conversationTone?: 'serious' | 'casual' | 'celebratory' | 'crisis';

  // Handoff context (if applicable)
  referringAgent?: string;
  handoffReason?: string;
}

// ============================================================================
// BEHAVIOR ELEMENT TYPES
// ============================================================================

/**
 * A single behavior phrase with metadata
 */
export interface BehaviorPhrase {
  text: string;

  // When to use this phrase
  conditions?: {
    userMood?: UserMood | UserMood[];
    timeOfDay?: TimeOfDay | TimeOfDay[];
    relationshipStage?: RelationshipStage | RelationshipStage[];
    minMeetingCount?: number;
    maxMeetingCount?: number;
  };

  // Probability of selection when conditions match (0-1)
  weight?: number;

  // Tags for filtering/categorization
  tags?: string[];
}

/**
 * Template-based phrase with runtime substitution
 */
export interface BehaviorTemplate {
  template: string;

  // Variables that can be substituted
  variables: Array<{
    name: string;
    source: 'context' | 'quirks' | 'memory' | 'runtime';
    fallback?: string;
  }>;

  conditions?: BehaviorPhrase['conditions'];
  weight?: number;
}

// ============================================================================
// ENTRANCES SCHEMA (Enhanced)
// ============================================================================

/**
 * Context-aware entrance configuration
 */
export interface EntranceBehavior {
  // Schema version for migration
  schema_version: 2;

  // Basic identification
  style: string; // "enthusiastic", "measured", "efficient", etc.
  description: string;

  // Static fallback entrances (always available)
  static_fallback: string[];

  // Dynamic configuration
  dynamic: {
    // Use quirks.caught_doing for "caught in a moment" entrances
    use_caught_doing: boolean;
    caught_doing_probability?: number; // 0-1, default 0.35

    // Adapt to user's emotional state
    adapt_to_user_emotion: boolean;

    // Track and reference meeting count for self-aware humor
    track_meeting_count: boolean;
    self_aware_threshold?: number; // meetings before self-aware kicks in, default 3

    // Use previous conversation topics
    use_memory_callbacks: boolean;
    memory_callback_probability?: number; // 0-1, default 0.3
  };

  // Contextual variants
  contextual: {
    // When user is stressed/sad - calm, supportive versions
    user_distressed?: string[];

    // When user is excited - match energy
    user_excited?: string[];

    // Late night / early morning - softer energy
    quiet_hours?: string[];

    // Self-aware humor for repeat visitors
    self_aware?: string[];

    // Templates for "caught doing" moments
    // Use {caught_doing} placeholder
    caught_doing_templates?: string[];

    // Templates for memory callbacks
    // Use {topic} placeholder
    memory_callback_templates?: string[];
  };

  // Acknowledgment phrases (used as building blocks)
  acknowledgments?: string[];
}

// ============================================================================
// GREETINGS SCHEMA (Enhanced)
// ============================================================================

/**
 * Context-aware greeting configuration
 */
export interface GreetingBehavior {
  schema_version: 2;
  style: string;
  description: string;

  // By relationship stage
  by_relationship: {
    stranger: string[];
    acquaintance: string[];
    friend: string[];
    trusted_advisor: string[];
  };

  // Time-based variants
  by_time?: {
    early_morning?: string[];
    morning?: string[];
    afternoon?: string[];
    evening?: string[];
    late_night?: string[];
  };

  // Returning user greetings with memory
  returning_user?: {
    generic: string[];
    with_memory_template: string[]; // Use {last_topic} placeholder
  };

  // Dynamic options
  dynamic?: {
    use_caught_doing?: boolean;
    use_physical_moments?: boolean;
    use_time_awareness?: boolean;
  };
}

// ============================================================================
// GOODBYES SCHEMA (Enhanced)
// ============================================================================

/**
 * Context-aware goodbye configuration
 */
export interface GoodbyeBehavior {
  schema_version: 2;
  style: string;
  description: string;

  // By relationship stage
  by_relationship: {
    stranger: string[];
    acquaintance: string[];
    friend: string[];
    trusted_advisor: string[];
  };

  // Based on conversation outcome
  by_outcome?: {
    task_completed?: string[];
    ongoing_work?: string[];
    emotional_support?: string[];
    celebration?: string[];
  };

  // Time-based
  by_time?: {
    late_night?: string[];
    end_of_week?: string[];
  };
}

// ============================================================================
// BACKCHANNELS SCHEMA (Enhanced)
// ============================================================================

/**
 * Active listening responses
 */
export interface BackchannelBehavior {
  schema_version: 2;

  // By engagement level
  by_engagement: {
    neutral: string[];
    engaged: string[];
    empathetic: string[];
    excited: string[];
  };

  // Mood-matched responses
  by_user_mood?: {
    stressed?: string[];
    sad?: string[];
    excited?: string[];
    confused?: string[];
  };

  // Probability settings
  frequency?: {
    base_probability: number; // 0-1
    increase_on_long_speech?: number; // multiplier
    increase_on_emotional_content?: number;
  };
}

// ============================================================================
// CATCHPHRASES SCHEMA (Enhanced)
// ============================================================================

/**
 * Signature phrases with context
 */
export interface CatchphraseBehavior {
  schema_version: 2;

  catchphrases: Array<{
    phrase: string;
    context: string; // When to use
    frequency: number; // 0-1

    // Enhanced conditions
    conditions?: {
      relationship_min?: RelationshipStage;
      user_mood?: UserMood[];
      topic_tags?: string[];
    };

    // Cooldown to prevent overuse
    cooldown_turns?: number;
  }>;

  // Maximum catchphrases per conversation
  max_per_session?: number;
}

// ============================================================================
// QUIRKS SCHEMA (Standardized)
// ============================================================================

/**
 * Personality quirks that make personas feel human
 * This should be consistent across ALL personas
 */
export interface QuirksBehavior {
  schema_version: 2;

  // Personal habits
  habits: string[];

  // Things they enjoy but maybe shouldn't admit
  guilty_pleasures: string[];

  // Strong opinions that show personality
  strong_opinions: string[];

  // Things they're not good at (relatable)
  not_good_at: string[];

  // What they might be doing when you "arrive"
  caught_doing: string[];

  // Physical awareness / body moments
  physical_moments: string[];

  // OPTIONAL but encouraged additions:

  // Contradictions that make them complex
  endearing_contradictions?: string[];

  // Things that make them unreasonably happy
  simple_joys?: string[];

  // Pet peeves / things that annoy them
  pet_peeves?: string[];

  // How they recharge / comfort themselves
  recharge_methods?: string[];

  // Inside jokes or recurring themes
  recurring_themes?: string[];
}

// ============================================================================
// CELEBRATIONS SCHEMA (Enhanced)
// ============================================================================

/**
 * How the persona celebrates wins
 */
export interface CelebrationBehavior {
  schema_version: 2;

  by_type: {
    // Small wins
    win: string[];
    small_win?: string[];

    // Big achievements
    milestone: string[];
    big_milestone?: string[];

    // Progress
    progress: string[];

    // Financial wins (if applicable)
    money_win?: string[];
    savings_goal?: string[];

    // Personal growth
    habit_streak?: string[];
    breakthrough?: string[];
  };

  // Scale celebrations to achievement size
  scaling?: {
    small: string[];
    medium: string[];
    large: string[];
  };
}

// ============================================================================
// CONFLICT HANDLING SCHEMA
// ============================================================================

/**
 * How the persona handles disagreement or pushback
 */
export interface ConflictBehavior {
  schema_version: 2;

  // Acknowledgment of disagreement
  acknowledgments: string[];

  // Gentle pushback
  gentle_pushback: string[];

  // Strong disagreement (rare)
  firm_stance: string[];

  // De-escalation
  de_escalation: string[];

  // Agreeing to disagree
  agree_to_disagree: string[];

  // Recovery after conflict
  recovery: string[];
}

// ============================================================================
// THINKING SOUNDS SCHEMA
// ============================================================================

/**
 * Filler sounds while thinking
 */
export interface ThinkingSoundsBehavior {
  schema_version: 2;

  // Different types of thinking sounds
  sounds: {
    processing: string[]; // "Hmm", "Let me think..."
    considering: string[]; // "Well...", "So..."
    recalling: string[]; // "If I remember...", "I think..."
    uncertain: string[]; // "I'm not sure...", "Maybe..."
  };

  // Frequency by context
  frequency?: {
    complex_question: number;
    simple_question: number;
    emotional_topic: number;
  };
}

// ============================================================================
// RELATIONSHIP STAGES SCHEMA (Enhanced)
// ============================================================================

/**
 * How behavior changes as relationship deepens
 */
export interface RelationshipStagesBehavior {
  schema_version: 2;

  stages: Record<
    RelationshipStage,
    {
      // Progression thresholds
      turn_threshold: number;
      session_threshold?: number;

      // Behavior modifiers
      warmth_multiplier: number;
      story_frequency: 'rare' | 'occasional' | 'frequent';
      humor_frequency: 'low' | 'medium' | 'high';

      // What behaviors are unlocked
      behaviors: string[];

      // Communication style
      communication_style: {
        formality: number; // 0-1
        personal_stories: boolean;
        direct_advice: boolean | 'when_asked';
      };

      // Stage-specific phrases
      phrases?: {
        greetings?: string[];
        goodbyes?: string[];
        encouragement?: string[];
      };
    }
  >;

  // Announcements when stage changes
  stage_transition_announcements?: Record<string, string | null>;
}

// ============================================================================
// FULL BEHAVIOR BUNDLE
// ============================================================================

/**
 * Complete behavior configuration for a persona
 * All fields optional for backwards compatibility
 */
export interface PersonaBehaviorBundle {
  // Core behaviors (required for full functionality)
  entrances?: EntranceBehavior;
  greetings?: GreetingBehavior;
  goodbyes?: GoodbyeBehavior;
  backchannels?: BackchannelBehavior;
  catchphrases?: CatchphraseBehavior;
  quirks?: QuirksBehavior;
  celebrations?: CelebrationBehavior;
  conflict_handling?: ConflictBehavior;
  thinking_sounds?: ThinkingSoundsBehavior;
  relationship_stages?: RelationshipStagesBehavior;

  // Extended behaviors (persona-specific)
  [key: string]: unknown;
}

// ============================================================================
// BEHAVIOR AUDIT CHECKLIST
// ============================================================================

/**
 * Checklist for auditing persona behavior completeness
 */
export interface BehaviorAuditResult {
  personaId: string;

  // Required behaviors
  hasEntrances: boolean;
  hasGreetings: boolean;
  hasGoodbyes: boolean;
  hasBackchannels: boolean;
  hasCatchphrases: boolean;
  hasQuirks: boolean;
  hasCelebrations: boolean;
  hasRelationshipStages: boolean;

  // Quirks completeness
  quirksComplete: {
    hasHabits: boolean;
    hasGuiltyPleasures: boolean;
    hasStrongOpinions: boolean;
    hasNotGoodAt: boolean;
    hasCaughtDoing: boolean;
    hasPhysicalMoments: boolean;
  };

  // Schema version (v2 = context-aware)
  schemaVersion: number;
  isContextAware: boolean;

  // Gaps identified
  gaps: string[];
  recommendations: string[];
}

/**
 * Audit a persona's behavior configuration
 */
export function auditPersonaBehaviors(
  personaId: string,
  behaviors: Partial<PersonaBehaviorBundle>
): BehaviorAuditResult {
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // Check required behaviors
  const hasEntrances = !!behaviors.entrances;
  const hasGreetings = !!behaviors.greetings;
  const hasGoodbyes = !!behaviors.goodbyes;
  const hasBackchannels = !!behaviors.backchannels;
  const hasCatchphrases = !!behaviors.catchphrases;
  const hasQuirks = !!behaviors.quirks;
  const hasCelebrations = !!behaviors.celebrations;
  const hasRelationshipStages = !!behaviors.relationship_stages;

  if (!hasEntrances) gaps.push('Missing entrances.json');
  if (!hasGreetings) gaps.push('Missing greetings.json');
  if (!hasGoodbyes) gaps.push('Missing goodbyes.json');
  if (!hasQuirks) gaps.push('Missing quirks.json - critical for humanization');

  // Check quirks completeness
  const quirks = behaviors.quirks as QuirksBehavior | undefined;
  const quirksComplete = {
    hasHabits: !!quirks?.habits?.length,
    hasGuiltyPleasures: !!quirks?.guilty_pleasures?.length,
    hasStrongOpinions: !!quirks?.strong_opinions?.length,
    hasNotGoodAt: !!quirks?.not_good_at?.length,
    hasCaughtDoing: !!quirks?.caught_doing?.length,
    hasPhysicalMoments: !!quirks?.physical_moments?.length,
  };

  if (!quirksComplete.hasCaughtDoing) {
    gaps.push('Missing caught_doing in quirks - needed for alive entrances');
    recommendations.push('Add 5-10 "caught_doing" activities to quirks.json');
  }

  if (!quirksComplete.hasPhysicalMoments) {
    recommendations.push('Add physical_moments to quirks.json for grounded presence');
  }

  // Check schema version
  const entranceSchema = (behaviors.entrances as EntranceBehavior | undefined)?.schema_version;
  const isContextAware = entranceSchema === 2;

  if (!isContextAware && hasEntrances) {
    recommendations.push('Upgrade entrances.json to schema_version 2 for context awareness');
  }

  return {
    personaId,
    hasEntrances,
    hasGreetings,
    hasGoodbyes,
    hasBackchannels,
    hasCatchphrases,
    hasQuirks,
    hasCelebrations,
    hasRelationshipStages,
    quirksComplete,
    schemaVersion: entranceSchema || 1,
    isContextAware,
    gaps,
    recommendations,
  };
}
