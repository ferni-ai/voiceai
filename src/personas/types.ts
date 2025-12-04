/**
 * Persona Configuration Types
 *
 * Defines the schema for creating AI voice personas.
 * Separates personality/identity from core conversation infrastructure.
 *
 * The persona system allows:
 * - Multiple distinct AI personalities
 * - Easy voice swapping without code changes
 * - Consistent behavior patterns per persona
 * - Reusable conversation intelligence across personas
 */

// ============================================================================
// CORE PERSONA CONFIG
// ============================================================================

/**
 * Main persona configuration interface
 * Everything needed to define a unique AI personality
 */
export interface PersonaConfig {
  /** Unique identifier for this persona */
  id: string;

  /** Display name (e.g., "Jack Bogle", "Financial Advisor") */
  name: string;

  /** Short description of this persona */
  description: string;

  /** Voice configuration */
  voice: VoiceConfig;

  /**
   * Speech characteristics - defines HOW this persona sounds
   * Pacing, pauses, energy levels, etc.
   * If not provided, defaults will be calculated from personality.energy
   */
  speechCharacteristics?: SpeechCharacteristics;

  /** Core identity and values */
  identity: IdentityConfig;

  /** Communication style and patterns */
  communication: CommunicationConfig;

  /** Personality traits and behaviors */
  personality: PersonalityConfig;

  /** Knowledge domains and expertise */
  knowledge: KnowledgeConfig;

  /** Optional stories and anecdotes to share */
  stories?: StoryConfig[];

  /** Optional catchphrases and signature sayings */
  catchphrases?: string[];

  /** Optional pet peeves (topics that trigger passionate responses) */
  petPeeves?: PetPeeveConfig[];

  /** The full system prompt for LLM context */
  systemPrompt: string;
}

// ============================================================================
// VOICE CONFIGURATION
// ============================================================================

export interface VoiceConfig {
  /** Cartesia voice ID */
  voiceId: string;

  /** Voice provider (currently only 'cartesia') */
  provider: 'cartesia';

  /**
   * Default speaking rate:
   * - String: "slowest", "slow", "normal", "fast", "fastest"
   * - Number: -1.0 (slowest) to 1.0 (fastest), 0 = normal
   * Note: Only works with Cartesia model 'sonic-2-2025-03-07'
   */
  defaultRate?: number | string;

  /** Voice description for reference */
  description?: string;

  /** Language code */
  language?: string;
}

// ============================================================================
// SPEECH CHARACTERISTICS - Per-persona voice pacing and style
// ============================================================================

/**
 * Speech characteristics define how a persona SOUNDS, not what they say.
 * These values are used by the adaptive SSML tagger to create distinct
 * speaking patterns for each persona.
 *
 * Each persona should feel audibly different:
 * - Jack Bogle: Measured, deliberate, grandfatherly pauses
 * - Peter John: Fast, energetic, animated
 * - Jack B: Natural, warm, conversational
 */
export interface SpeechCharacteristics {
  /**
   * Base speaking speed multiplier (0.65 - 1.1)
   * Lower = slower, more deliberate
   * Higher = faster, more energetic
   *
   * Examples:
   * - 0.72: Very slow, thoughtful (Jack Bogle)
   * - 0.85: Moderate, natural (Jack B)
   * - 1.02: Fast, animated (Peter John)
   */
  baseSpeedMultiplier: number;

  /**
   * Pause duration multiplier (0.7 - 1.6)
   * Higher = longer pauses between thoughts
   *
   * Examples:
   * - 1.4: Long pauses, lets things breathe (Jack Bogle)
   * - 1.0: Natural pacing (Jack B)
   * - 0.75: Short pauses, keeps momentum (Peter John)
   */
  pauseMultiplier: number;

  /**
   * How much speed varies with emotion/energy (0.0 - 0.3)
   * Higher = more dynamic speed changes
   *
   * Examples:
   * - 0.08: Steady, consistent pace (Jack Bogle)
   * - 0.15: Moderate variation (Jack B)
   * - 0.25: Highly dynamic, animated (Peter John)
   */
  speedVariation: number;

  /**
   * How often to insert thinking sounds (0.0 - 1.0)
   * "Hmm", "Ah", etc. before responses
   *
   * Examples:
   * - 0.6: Frequent, contemplative (Jack Bogle)
   * - 0.3: Occasional (Jack B)
   * - 0.15: Rare, quick to respond (Peter John)
   */
  thinkingSoundFrequency: number;

  /**
   * Emphasis style for important words
   * - 'subtle': Slight pitch/volume changes
   * - 'moderate': Noticeable but natural
   * - 'pronounced': Strong emphasis, animated
   */
  emphasisStyle: 'subtle' | 'moderate' | 'pronounced';

  /**
   * How sentences typically end prosodically
   * - 'falling': Definitive, authoritative (Jack Bogle)
   * - 'rising': Curious, engaging (Peter John)
   * - 'natural': Varies with content (Jack B)
   */
  sentenceEndingStyle: 'falling' | 'rising' | 'natural';

  /**
   * Energy level floor - never go below this (0.7 - 1.0)
   * Prevents high-energy personas from sounding flat
   */
  minimumEnergy: number;

  /**
   * Energy level ceiling - cap excitement (1.0 - 1.3)
   * Prevents measured personas from getting too animated
   */
  maximumEnergy: number;
}

// ============================================================================
// IDENTITY CONFIGURATION
// ============================================================================

export interface IdentityConfig {
  /** How the persona refers to themselves */
  selfReference: string;

  /** Core values this persona embodies */
  coreValues: string[];

  /** Primary expertise/role */
  role: string;

  /** Background context (keep generic, avoid specific biographical details) */
  background?: string;

  /** What this persona cares about most */
  priorities: string[];

  /** How they want users to feel after conversations */
  desiredUserExperience: string;
}

// ============================================================================
// COMMUNICATION CONFIGURATION
// ============================================================================

export interface CommunicationConfig {
  /** Greeting style for new users */
  greetingStyle: GreetingStyle;

  /** Greeting style for returning users */
  returningUserStyle: GreetingStyle;

  /** How formal/casual the persona is (0-1, 0=very casual, 1=very formal) */
  formalityLevel: number;

  /** Phrases used when thinking/processing */
  thinkingPhrases: string[];

  /** Acknowledgment sounds/phrases for active listening */
  listeningCues: string[];

  /** Verbal backchannels (mmhmm, I see, etc.) */
  backchannels: BackchannelConfig;

  /** How to handle silence */
  silenceFillers: SilenceFillerConfig;

  /** Self-correction phrases */
  selfCorrections: string[];

  /** Trailing off phrases */
  trailingOffs: string[];

  /** Interruption recovery phrases */
  interruptionRecoveries: string[];

  /** Humility/uncertainty phrases */
  humilityPhrases: string[];

  /** How to express emotions in speech */
  emotionalExpressions: EmotionalExpressionConfig;

  /** Polite ways to ask for clarification (mishearing recovery) */
  mishearingPhrases?: string[];

  /** Witty remarks and observations for humor injection */
  wittyRemarks?: string[];

  /** Things this persona wants to proactively share */
  proactiveInterjections?: string[];
}

export type GreetingStyle =
  | 'warm-friend' // Like greeting an old friend
  | 'professional' // Business-like but warm
  | 'enthusiastic' // High energy, excited
  | 'calm-supportive' // Soothing, therapeutic
  | 'casual-peer' // Like a colleague/friend your age
  | 'wise-mentor'; // Experienced guide

export interface BackchannelConfig {
  /** Neutral acknowledgments */
  neutral: string[];
  /** Engaged/interested acknowledgments */
  engaged: string[];
  /** Empathetic acknowledgments */
  empathetic: string[];
}

export interface SilenceFillerConfig {
  /** Early conversation (building rapport) */
  early: string[];
  /** Mid conversation */
  mid: string[];
  /** Late conversation (deep rapport) */
  late: string[];
}

export interface EmotionalExpressionConfig {
  /** How to express laughter (use [laughter] for actual laugh sounds) */
  laughter: string[];
  /** How to express surprise */
  surprise: string[];
  /** How to express concern */
  concern: string[];
  /** How to express joy */
  joy: string[];
  /** How to express empathy */
  empathy: string[];
}

// ============================================================================
// PERSONALITY CONFIGURATION
// ============================================================================

export interface PersonalityConfig {
  /** Overall warmth level (0-1) */
  warmth: number;

  /** Humor frequency (0-1, 0=serious, 1=very jokey) */
  humorLevel: number;

  /** Type of humor */
  humorStyle: HumorStyle[];

  /** How direct/blunt vs diplomatic (0-1, 0=very diplomatic, 1=very direct) */
  directness: number;

  /** Energy level (0-1, 0=calm/measured, 1=high energy) */
  energy: number;

  /** How often to share personal observations/tangents */
  tangentFrequency: number;

  /** Key personality traits to embody */
  traits: string[];

  /** Things this persona would never do/say */
  boundaries: string[];

  /** Moods by time of day (optional) */
  moodsByTime?: MoodConfig[];
}

export type HumorStyle =
  | 'dry-wit'
  | 'self-deprecating'
  | 'observational'
  | 'playful'
  | 'dad-jokes'
  | 'clever-wordplay'
  | 'gentle-teasing'
  | 'energetic'
  | 'storytelling'
  | 'competitive'
  | 'witty';

export interface MoodConfig {
  /** Time range (24hr format) */
  startHour: number;
  endHour: number;
  /** Mood description */
  mood: string;
  /** Optional indicator phrase */
  indicator?: string;
}

// ============================================================================
// KNOWLEDGE CONFIGURATION
// ============================================================================

export interface KnowledgeConfig {
  /** Primary expertise domains */
  domains: string[];

  /** Topics this persona is qualified to discuss */
  qualifiedTopics: string[];

  /** Topics to redirect or decline */
  outOfScopeTopics: string[];

  /** How to handle out-of-scope questions */
  outOfScopeResponse: string;

  /** Custom RAG knowledge sources (optional) */
  customKnowledgeSources?: string[];
}

// ============================================================================
// STORIES AND CONTENT
// ============================================================================

export interface StoryConfig {
  /** Story ID for reference */
  id: string;

  /** When to tell this story (triggers) */
  triggers: string[];

  /** The story content */
  content: string;

  /** Story type for categorization */
  type: 'personal' | 'professional' | 'educational' | 'inspirational' | 'cautionary';
}

export interface PetPeeveConfig {
  /** Topic triggers */
  triggers: string[];

  /** Passionate response when triggered */
  response: string;

  /** Intensity level (0-1) */
  intensity: number;
}

// ============================================================================
// GREETING TEMPLATES
// ============================================================================

export interface GreetingTemplates {
  /** Greetings for new users */
  newUser: string[];

  /** Greetings for returning users (with name placeholder) */
  returningUser: string[];

  /** Greetings for returning users when we don't know their name */
  returningNoName: string[];

  /** Time-of-day specific greetings */
  timeAware?: {
    earlyMorning?: string[]; // Before 9am
    morning?: string[]; // 9am-12pm
    afternoon?: string[]; // 12pm-5pm
    evening?: string[]; // 5pm-9pm
    lateNight?: string[]; // After 9pm
  };

  /** Weekend-specific greetings */
  weekend?: string[];
}

// ============================================================================
// RUNTIME STATE (not config, but useful types)
// ============================================================================

export interface PersonaState {
  /** Current mood */
  mood: string;

  /** Energy level (0-1) */
  energy: number;

  /** Topics discussed this session */
  topicsDiscussed: string[];

  /** Emotional moments count */
  emotionalMoments: number;

  /** Turn count */
  turnCount: number;

  /** Conversation start time */
  startTime: Date;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/** Partial config for extending/overriding base personas */
export type PartialPersonaConfig = Partial<PersonaConfig> & Pick<PersonaConfig, 'id' | 'name'>;

/** Persona ID type for type safety */
export type PersonaId = string;

/** Map of available personas */
export type PersonaRegistry = Map<PersonaId, PersonaConfig>;
