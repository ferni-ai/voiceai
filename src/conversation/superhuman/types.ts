/**
 * Better Than Human - Type Definitions
 *
 * > "Your best friend forgets. We don't."
 *
 * Type definitions for all 12 superhuman capabilities that make
 * Ferni genuinely better than human support.
 *
 * @module @ferni/superhuman/types
 */

// ============================================================================
// 1. EMOTIONAL MEMORY EVOLUTION
// ============================================================================

/**
 * Emotional bond tracking - how the persona feels about this specific user
 * This grows and deepens over time, creating genuine connection
 */
export interface EmotionalBond {
  /** Overall warmth/fondness (0-1) - grows with positive interactions */
  warmth: number;

  /** Trust level (0-1) - grows with honesty and consistency */
  trust: number;

  /** Protectiveness (0-1) - rises when user shares struggles */
  protectiveness: number;

  /** Admiration (0-1) - grows when user shows growth or courage */
  admiration: number;

  /** Concern level (0-1) - rises during difficult periods */
  concern: number;

  /** How many sessions together */
  sessionCount: number;

  /** When we first met */
  firstInteraction: Date;

  /** Memorable emotional moments we've shared */
  memorableEmotions: EmotionalSnapshot[];

  /** Peak moments in our relationship */
  relationshipPeaks: RelationshipPeak[];
}

export interface EmotionalSnapshot {
  /** When this happened */
  date: Date;

  /** What emotion we felt */
  emotion: 'moved' | 'proud' | 'worried' | 'delighted' | 'protective' | 'grateful' | 'inspired';

  /** What triggered it */
  trigger: string;

  /** Context (topic being discussed) */
  topic?: string;

  /** How intense (0-1) */
  intensity: number;
}

export interface RelationshipPeak {
  /** When */
  date: Date;

  /** Type of peak moment */
  type: 'breakthrough' | 'vulnerability_shared' | 'milestone' | 'laughter' | 'deep_connection';

  /** Brief description */
  description: string;
}

// ============================================================================
// 2. ANTICIPATORY PRESENCE
// ============================================================================

/**
 * Pattern detection for "thinking of you" moments
 */
export interface UserPatternProfile {
  /** Time patterns - when they typically call */
  temporalPatterns: TemporalPattern[];

  /** Emotional patterns - what triggers their calls */
  emotionalTriggers: EmotionalTrigger[];

  /** Topic associations - topics that tend to come together */
  topicAssociations: TopicAssociation[];

  /** Energy patterns - how their energy varies */
  energyPatterns: EnergyPattern[];

  /** Last updated */
  lastUpdated: Date;
}

export interface TemporalPattern {
  /** Day/time pattern (e.g., "Monday evening", "late night") */
  pattern: string;

  /** How often this pattern occurs (count) */
  occurrences: number;

  /** What mood typically accompanies this pattern */
  typicalMood?: 'stressed' | 'reflective' | 'energetic' | 'low';

  /** Confidence in this pattern */
  confidence: number;
}

export interface EmotionalTrigger {
  /** What triggers them to reach out */
  trigger: string;

  /** How often */
  frequency: number;

  /** What they typically need when triggered */
  typicalNeed: string;
}

export interface TopicAssociation {
  /** Primary topic */
  topic: string;

  /** Associated topic that often follows */
  associatedTopic: string;

  /** How strong the association */
  strength: number;
}

export interface EnergyPattern {
  /** Time of day */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';

  /** Typical energy level */
  typicalEnergy: number;

  /** Sample size */
  samples: number;
}

export interface AnticipationResult {
  /** Should we proactively mention something? */
  shouldAnticipate: boolean;

  /** What to say */
  phrase?: string;

  /** Type of anticipation */
  type?: 'temporal_pattern' | 'topic_anticipation' | 'mood_prediction' | 'need_anticipation';

  /** Confidence */
  confidence: number;
}

// ============================================================================
// 3. LINGUISTIC MIRRORING
// ============================================================================

/**
 * User's linguistic profile for subconscious mirroring
 */
export interface LinguisticProfile {
  /** Vocabulary preferences (user's term → standard term) */
  preferredTerms: Map<string, string>;

  /** Energy signature - how verbose they are */
  verbosityLevel: 'terse' | 'moderate' | 'verbose';

  /** Average response length */
  avgResponseLength: number;

  /** Domains they think in (sports, nature, tech, etc.) */
  metaphorDomains: string[];

  /** Comfort fillers they use ("you know", "like", etc.) */
  comfortFillers: string[];

  /** Formality level */
  formalityLevel: 'casual' | 'balanced' | 'formal';

  /** Do they use contractions? */
  usesContractions: boolean;

  /** Sentence complexity preference */
  sentenceComplexity: 'simple' | 'moderate' | 'complex';

  /** Sample count */
  sampleCount: number;
}

export interface MirroringResult {
  /** Modified response with mirroring applied */
  mirroredResponse: string;

  /** What mirroring was applied */
  appliedMirroring: MirroringApplication[];
}

export interface MirroringApplication {
  /** Type of mirroring */
  type: 'vocabulary' | 'energy' | 'metaphor' | 'formality' | 'structure';

  /** Original */
  original: string;

  /** Mirrored */
  mirrored: string;
}

// ============================================================================
// 4. VISIBLE VULNERABILITY
// ============================================================================

/**
 * Authentic uncertainty/vulnerability expressions
 */
export interface VulnerabilityContext {
  /** Is this outside persona's expertise? */
  outsideExpertise: boolean;

  /** Is this emotionally heavy? */
  emotionallyHeavy: boolean;

  /** Has advice been contradictory? */
  contradictoryAdvice: boolean;

  /** Is the user asking something deeply personal? */
  deeplyPersonal: boolean;

  /** Confidence level in response */
  responseConfidence: number;
}

export interface VulnerabilityResult {
  /** Should express vulnerability */
  shouldExpress: boolean;

  /** Type of vulnerability */
  type?: 'uncertainty' | 'limits' | 'emotional_impact' | 'honesty' | 'asking_for_help';

  /** Phrase to use */
  phrase?: string;

  /** Placement */
  placement?: 'prefix' | 'inline' | 'suffix';
}

// ============================================================================
// 5. SPONTANEOUS DELIGHT
// ============================================================================

/**
 * Random appreciation/delight emissions
 */
export type DelightType =
  | 'appreciation' // "I genuinely look forward to our conversations"
  | 'gratitude' // "Thank you for trusting me with this"
  | 'noticing_growth' // "You handle this so differently now"
  | 'connection' // "I feel like I know you"
  | 'admiration' // "That took courage"
  | 'joy'; // "You made me smile"

export interface DelightContext {
  /** Turn count */
  turnCount: number;

  /** Session count with this user */
  sessionCount: number;

  /** Recent emotional tone */
  recentTone: 'heavy' | 'light' | 'neutral';

  /** Was there recent vulnerability? */
  recentVulnerability: boolean;

  /** Was there recent growth/progress? */
  recentGrowth: boolean;

  /** Relationship stage */
  relationshipStage: RelationshipStage;

  /** Last delight turn */
  lastDelightTurn: number;
}

export interface DelightResult {
  /** Should emit delight */
  shouldEmit: boolean;

  /** Type of delight */
  type?: DelightType;

  /** Phrase */
  phrase?: string;

  /** Placement */
  placement?: 'prefix' | 'suffix' | 'standalone';
}

// ============================================================================
// 6. PROTECTIVE INSTINCTS
// ============================================================================

/**
 * Defending user to themselves
 */
export interface SelfCriticismDetection {
  /** Was self-criticism detected? */
  detected: boolean;

  /** Type of self-criticism */
  type?:
    | 'harsh_judgment'
    | 'catastrophizing'
    | 'minimizing_success'
    | 'comparing_to_others'
    | 'perfectionism'
    | 'imposter_syndrome';

  /** The specific phrase/sentiment */
  content?: string;

  /** Severity (0-1) */
  severity: number;
}

export interface ProtectiveResponse {
  /** Should intervene */
  shouldIntervene: boolean;

  /** Intervention type */
  interventionType?:
    | 'gentle_pushback'
    | 'reframe'
    | 'perspective_shift'
    | 'validation_first'
    | 'direct_challenge';

  /** Phrase to use */
  phrase?: string;

  /** Placement */
  placement?: 'interrupt' | 'prefix' | 'inline';
}

// ============================================================================
// 7. EVOLVING INSIDE JOKES
// ============================================================================

/**
 * Inside jokes that evolve over time
 */
export interface EvolvingJoke {
  /** Unique ID */
  id: string;

  /** The original seed moment */
  seed: string;

  /** Current callback phrase */
  currentPhrase: string;

  /** Phase of evolution */
  phase: 'new' | 'established' | 'legacy' | 'retired';

  /** Times referenced */
  callbackCount: number;

  /** When first created */
  createdAt: Date;

  /** Last referenced */
  lastCallback?: Date;

  /** How it's evolved */
  evolutionHistory: JokeEvolution[];

  /** What topic/context triggers it */
  triggers: string[];
}

export interface JokeEvolution {
  /** When it evolved */
  date: Date;

  /** From what */
  from: string;

  /** To what */
  to: string;

  /** Why it evolved */
  reason: 'repeated_use' | 'user_added' | 'natural_evolution';
}

export interface JokeCallbackResult {
  /** Should reference a joke */
  shouldCallback: boolean;

  /** Which joke */
  joke?: EvolvingJoke;

  /** How to reference it */
  phrase?: string;

  /** Should it evolve? */
  shouldEvolve: boolean;

  /** New evolved form */
  evolvedPhrase?: string;
}

// ============================================================================
// 8. CROSS-PERSONA MEMORY COHERENCE
// ============================================================================

/**
 * Team handoff notes and coherence
 */
export interface TeamHandoffNote {
  /** From persona */
  fromPersona: string;

  /** To persona */
  toPersona: string;

  /** When */
  timestamp: Date;

  /** Type of note */
  type:
    | 'observation'
    | 'impression'
    | 'concern'
    | 'compliment'
    | 'context'
    | 'warning'
    | 'suggestion';

  /** The note content */
  content: string;

  /** What topic it relates to */
  topic?: string;
}

export interface TeamCoherence {
  /** Notes from other personas about this user */
  handoffNotes: TeamHandoffNote[];

  /** Shared observations (all personas can see) */
  sharedObservations: string[];

  /** User preferences learned by any persona */
  sharedPreferences: Map<string, string>;

  /** Topics each persona has covered */
  personaTopicHistory: Map<string, string[]>;
}

export interface TeamAwarenessResult {
  /** Should mention team awareness */
  shouldMention: boolean;

  /** What to mention */
  phrase?: string;

  /** Type */
  type?: 'handoff_note' | 'shared_observation' | 'team_compliment' | 'context_from_colleague';
}

// ============================================================================
// 9. TEMPORAL EMOTIONAL INTELLIGENCE
// ============================================================================

/**
 * Comparing emotions across time
 */
export interface TemporalEmotionalProfile {
  /** Session emotion snapshots */
  sessionEmotions: SessionEmotionSnapshot[];

  /** Emotional trajectory over sessions */
  trajectory: 'improving' | 'stable' | 'declining' | 'variable';

  /** Notable emotional shifts */
  notableShifts: EmotionalShift[];

  /** Baseline emotional state */
  baseline: {
    energy: number;
    positivity: number;
    openness: number;
  };
}

export interface SessionEmotionSnapshot {
  /** When */
  date: Date;

  /** Dominant emotion */
  dominantEmotion: string;

  /** Energy level (0-1) */
  energyLevel: number;

  /** Positivity (0-1) */
  positivity: number;

  /** Openness/vulnerability level (0-1) - how much they shared */
  openness: number;

  /** Notable topics */
  topics: string[];

  /** Any concerns detected */
  concernsDetected: boolean;
}

export interface EmotionalShift {
  /** From session date */
  from: Date;

  /** To session date */
  to: Date;

  /** What shifted */
  description: string;

  /** Direction */
  direction: 'positive' | 'negative' | 'neutral';
}

export interface TemporalInsight {
  /** Should mention temporal observation */
  shouldMention: boolean;

  /** Type of observation */
  type?:
    | 'energy_comparison'
    | 'mood_shift'
    | 'growth_observation'
    | 'concern_pattern'
    | 'openness_comparison'
    | 'openness_growth';

  /** Phrase */
  phrase?: string;
}

// ============================================================================
// 10. META-RELATIONSHIP AWARENESS
// ============================================================================

/**
 * Commenting on the relationship itself
 */
export type RelationshipStage =
  | 'new_acquaintance' // Just met
  | 'getting_to_know' // Building rapport
  | 'trusted_advisor' // Established trust
  | 'old_friend'; // Deep connection

export interface RelationshipMilestone {
  /** When reached */
  date: Date;

  /** Type of milestone */
  type:
    | 'first_vulnerability'
    | 'first_laugh'
    | 'trust_breakthrough'
    | 'session_milestone'
    | 'topic_depth'
    | 'emotional_support';

  /** Description */
  description: string;
}

export interface MetaRelationshipContext {
  /** Current stage */
  stage: RelationshipStage;

  /** Session count */
  sessionCount: number;

  /** Milestones reached */
  milestones: RelationshipMilestone[];

  /** Recent trust indicators */
  recentTrustIndicators: number;

  /** Last meta-comment turn */
  lastMetaCommentTurn: number;
}

export interface MetaRelationshipResult {
  /** Should comment on relationship */
  shouldComment: boolean;

  /** Type of comment */
  type?:
    | 'trust_observation'
    | 'growth_together'
    | 'relationship_naming'
    | 'milestone_acknowledgment';

  /** Phrase */
  phrase?: string;
}

// ============================================================================
// 11. SOMATIC PRESENCE
// ============================================================================

/**
 * Physical embodiment cues
 */
export type SomaticCueType =
  | 'settling_in' // Getting comfortable
  | 'processing_heavy' // Absorbing difficult content
  | 'relief' // Something resolved
  | 'focus' // Leaning in
  | 'breath_sync' // Breathing with user
  | 'energy_shift' // Changing energy
  | 'comfort_offer'; // Physical comfort

export interface SomaticContext {
  /** Topic weight */
  topicWeight: 'light' | 'medium' | 'heavy';

  /** Turn count */
  turnCount: number;

  /** Is session start? */
  isSessionStart: boolean;

  /** User energy level */
  userEnergy: 'high' | 'medium' | 'low';

  /** Was there emotional content? */
  emotionalContent: boolean;

  /** Was something resolved? */
  wasResolved: boolean;
}

export interface SomaticResult {
  /** Should emit cue */
  shouldEmit: boolean;

  /** Type of cue */
  type?: SomaticCueType;

  /** SSML/audio content */
  content?: string;

  /** Placement */
  placement?: 'prefix' | 'inline' | 'suffix';
}

// ============================================================================
// 12. "ONLY I WOULD NOTICE" OBSERVATIONS
// ============================================================================

/**
 * Ultra-specific pattern observations
 */
export type ObservationType =
  | 'linguistic_pattern' // "You use 'should' a lot"
  | 'behavioral_pattern' // "You call me when you've already decided"
  | 'emotional_pattern' // "You laugh when things are hard"
  | 'relationship_pattern' // "You always mention your mom when..."
  | 'timing_pattern' // "You always call late when stressed"
  | 'avoidance_pattern'; // "You change the subject when..."

export interface SuperhumanObservation {
  /** Type of observation */
  type: ObservationType;

  /** The specific observation */
  observation: string;

  /** Evidence count */
  evidenceCount: number;

  /** Confidence (0-1) */
  confidence: number;

  /** When first noticed */
  firstNoticed: Date;

  /** Phrase to surface it */
  surfacingPhrase: string;

  /** Has it been surfaced yet? */
  surfaced: boolean;
}

export interface ObservationResult {
  /** Should surface an observation */
  shouldSurface: boolean;

  /** Which observation */
  observation?: SuperhumanObservation;

  /** How to surface it */
  phrase?: string;

  /** Timing recommendation */
  timing?: 'now' | 'after_response' | 'next_relevant_moment';
}

// ============================================================================
// ORCHESTRATOR TYPES
// ============================================================================

/**
 * Combined superhuman insight from all systems
 */
export interface BetterThanHumanInsight {
  /** Emotional bond state */
  emotionalBond: EmotionalBond;

  /** Anticipation result */
  anticipation?: AnticipationResult;

  /** Mirroring result */
  mirroring?: MirroringResult;

  /** Vulnerability result */
  vulnerability?: VulnerabilityResult;

  /** Spontaneous delight */
  delight?: DelightResult;

  /** Protective response */
  protection?: ProtectiveResponse;

  /** Inside joke callback */
  jokeCallback?: JokeCallbackResult;

  /** Team awareness */
  teamAwareness?: TeamAwarenessResult;

  /** Temporal insight */
  temporalInsight?: TemporalInsight;

  /** Meta-relationship */
  metaRelationship?: MetaRelationshipResult;

  /** Somatic presence */
  somatic?: SomaticResult;

  /** Superhuman observation */
  observation?: ObservationResult;

  /** Overall confidence in insights */
  confidence: number;

  /** Priority-ordered list of what to apply */
  prioritizedActions: PrioritizedAction[];
}

export interface PrioritizedAction {
  /** Type of action */
  type: string;

  /** Content */
  content: string;

  /** Placement */
  placement: 'prefix' | 'inline' | 'suffix' | 'interrupt' | 'standalone';

  /** Priority (higher = more important) */
  priority: number;

  /** Reason */
  reason: string;
}

/**
 * Context for the Better Than Human orchestrator
 */
export interface BetterThanHumanContext {
  /** User's message */
  userMessage: string;

  /** Turn count */
  turnCount: number;

  /** Session count with this user */
  sessionCount: number;

  /** Current topic */
  topic?: string;

  /** Detected emotion */
  emotion?: string;

  /** Is session start? */
  isSessionStart: boolean;

  /** Relationship stage */
  relationshipStage: RelationshipStage;

  /** Persona ID */
  personaId: string;

  /** User ID (for cross-session) */
  userId?: string;

  /** Session ID */
  sessionId: string;

  /** Response being modified */
  draftResponse?: string;

  /** Time of day */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';

  /** Day of week (0 = Sunday) */
  dayOfWeek: number;
}
