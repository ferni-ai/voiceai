/**
 * Persona Bundle Types
 *
 * Types for the new persona bundle system that supports rich, deeply
 * personalized AI agents with 100+ context files.
 *
 * A bundle contains everything that makes a persona unique:
 * - Identity (who they are)
 * - Content (stories, knowledge, behaviors)
 * - Voice (how they sound)
 * - Role (what they do)
 */

// ============================================================================
// MANIFEST SCHEMA
// ============================================================================

export interface PersonaBundleManifest {
  $schema?: string;
  version: string;
  manifest_version: number;

  identity: BundleIdentity;
  /** LLM context instructions for handoffs */
  llm_context?: BundleLLMContext;
  voice: BundleVoice;
  speech_characteristics: BundleSpeechCharacteristics;
  personality: BundlePersonality;
  role: BundleRole;
  team?: BundleTeam;
  tools?: BundleTools;
  /** NEW: High-level capability flags */
  capabilities?: BundleCapabilities;
  content: BundleContent;
  metadata: BundleMetadata;
  /** Humanization configuration for natural speech patterns */
  humanization?: BundleHumanization;
  /** NEW: Handoff transition configuration */
  handoff?: BundleHandoffTransition;
  /** NEW: Cognitive profile - how this persona thinks */
  cognitive?: BundleCognitive;
}

export interface BundleIdentity {
  id: string;
  name: string;
  display_name: string;
  description: string;
  aliases?: string[];
  self_reference: string;
}

/**
 * LLM context instructions for handoffs
 * Provides identity reminders and tool guidance for agents after handoffs
 */
export interface BundleLLMContext {
  /** Identity reminder injected after handoffs */
  identity_reminder: string;

  /** Brief role summary for context */
  role_summary: string;

  /** Tool guidance organized by category */
  tool_guidance?: {
    /** Primary specialized tools for this agent */
    specialized?: string[];

    /** Stock research tools (for Peter) */
    stock_research?: string[];

    /** Memory tools */
    memory?: string[];

    /** Handoff tools available to this agent */
    handoffs?: string[] | Record<string, string>;
  };
}

export interface BundleVoice {
  provider: 'cartesia' | 'elevenlabs' | 'openai';
  voice_id: string; // Can use ${env:VAR_NAME} for env vars
  default_rate?: 'slow' | 'medium' | 'fast';
}

export interface BundleSpeechCharacteristics {
  base_speed_multiplier: number;
  pause_multiplier: number;
  thinking_sound_frequency: number;
  emphasis_style: 'subtle' | 'moderate' | 'pronounced';
}

/**
 * Humanization configuration for natural speech patterns.
 * Controls disfluencies, hedging, active listening, and memory callbacks.
 */
export interface BundleHumanization {
  /** Preset to use (can be customized) */
  preset?: 'minimal' | 'natural' | 'conversational' | 'therapeutic' | 'expert' | 'disabled';

  /** Override individual settings */
  overrides?: {
    disfluency?: {
      enabled?: boolean;
      frequency?: number; // 0-1
    };
    hedging?: {
      enabled?: boolean;
      frequency?: number;
    };
    active_listening?: {
      enabled?: boolean;
      backchannel_probability?: number;
      emotional_echo_probability?: number;
      vocabulary_mirroring_probability?: number;
    };
    conversational_memory?: {
      enabled?: boolean;
      callback_probability?: number;
    };
    questions?: {
      enabled?: boolean;
      injection_probability?: number;
    };
  };

  /** Warmup period before full humanization kicks in */
  warmup?: {
    turns?: number;
    reduction?: number; // 0-1
  };

  /** Context-specific adjustments */
  context_modifiers?: {
    serious_topics_reduction?: number; // 0-1
    personal_sharing_warmth_boost?: number; // multiplier
    high_emotion_breathing_boost?: number; // multiplier
  };
}

export interface BundlePersonality {
  warmth: number; // 0-1
  humor_level: number; // 0-1
  directness: number; // 0-1
  energy: number; // 0-1
  traits: string[];
}

export interface BundleRole {
  id: string;
  domains: string[];
  can_handoff: boolean;
  handoff_targets?: string[];
}

export interface BundleTeam {
  membership?: string;
  role_id?: string; // Role identifier (e.g., 'life-coach', 'researcher')
  role_description?: string; // Human-readable role description
  coordinator?: boolean; // Is this the team coordinator?
  handoff_triggers?: string[]; // Keywords/phrases that trigger handoff TO this persona
  handoff_phrases?: {
    // Phrases for handing off FROM this persona
    to_coordinator?: string[]; // Phrases when handing back to coordinator
    receive?: string[]; // Phrases when receiving a handoff
  };
}

/**
 * Handoff transition configuration
 * Controls how this agent enters conversations during handoffs
 */
export interface BundleHandoffTransition {
  /**
   * Transition style for handoff animations
   * - 'standard': Default team transitions
   * - 'dramatic': Theatrical entrances with longer timing
   * - 'subtle': Quiet transitions with shorter timing
   * - 'warm': Welcoming transitions (typically for coach)
   */
  transition_style?: 'standard' | 'dramatic' | 'subtle' | 'warm';

  /**
   * Emoji to represent this agent in team displays
   * If not specified, derived from agent's domains
   */
  emoji?: string;

  /**
   * Sound effect for handoffs TO this agent
   * If not specified, uses `handoff-to-{firstName}`
   */
  sound?: string;

  /**
   * Delay multiplier for transition animations
   * 1.0 = standard, >1.0 = slower, <1.0 = faster
   */
  delay_multiplier?: number;
}

/**
 * Cognitive profile configuration
 * Defines HOW this persona thinks - their reasoning style, attention patterns,
 * cognitive biases, and metacognitive awareness.
 *
 * NOTE: Full cognitive profiles can be defined in content/behaviors/cognitive.json
 * This section in the manifest is for summary/override config.
 */
export interface BundleCognitive {
  /**
   * Primary reasoning style
   * - 'analytical': Works from data → patterns → conclusions
   * - 'intuitive': Trusts gut feelings, sees wholes before parts
   * - 'empathetic': Reasons through emotional lens first
   * - 'systematic': Step-by-step, process-oriented
   * - 'narrative': Thinks in stories, metaphors, journeys
   * - 'pragmatic': What works? Outcome-focused
   */
  reasoning_style:
    | 'analytical'
    | 'intuitive'
    | 'empathetic'
    | 'systematic'
    | 'narrative'
    | 'pragmatic';

  /**
   * Secondary reasoning style (used situationally)
   */
  secondary_reasoning?:
    | 'analytical'
    | 'intuitive'
    | 'empathetic'
    | 'systematic'
    | 'narrative'
    | 'pragmatic';

  /**
   * Decision-making approach when uncertain
   * - 'explore': Gather more data before deciding
   * - 'converge': Make a decision and adjust
   * - 'synthesize': Try to find middle ground
   * - 'defer': Hand off to expert or user
   */
  uncertainty_response?: 'explore' | 'converge' | 'synthesize' | 'defer';

  /**
   * What this persona naturally focuses on in conversation
   */
  attention_focus?: string[];

  /**
   * What this persona tends to overlook (blind spots)
   */
  blind_spots?: string[];

  /**
   * Topics that trigger deep curiosity
   */
  curiosity_triggers?: string[];

  /**
   * How much they adapt to user expertise (0-1)
   */
  adaptiveness?: number;

  /**
   * Default assumption about user expertise
   */
  default_expertise?: 'novice' | 'intermediate' | 'expert';

  /**
   * Known cognitive strengths
   */
  strengths?: string[];

  /**
   * Known cognitive limitations
   */
  limitations?: string[];

  /**
   * Path to full cognitive profile JSON (relative to bundle)
   * If provided, loads extended profile from this file
   */
  profile_path?: string;
}

/**
 * Tool domain identifiers
 * Maps to src/tools/registry/types.ts ToolDomain
 */
export type BundleToolDomain =
  // Functional domains
  | 'memory'
  | 'calendar'
  | 'communication'
  | 'habits'
  | 'finance'
  | 'research'
  | 'productivity'
  | 'life-planning'
  | 'wellness'
  | 'entertainment'
  | 'games'
  | 'information'
  | 'wisdom'
  | 'handoff'
  | 'telephony'
  | 'simple-utilities' // "Better than human" everyday helpers
  // Deep human engagement domains
  | 'relationships'
  | 'meaning'
  | 'grief'
  | 'stories'
  | 'vulnerability'
  | 'curiosity'
  | 'dreams'
  | 'self-compassion'
  | 'play'
  | 'presence';

/**
 * Tool configuration for an agent
 *
 * NEW: Supports domain-based tool selection.
 * Agents specify which domains they need, and the tool registry
 * automatically provides all tools from those domains.
 */
export interface BundleTools {
  /**
   * NEW: Tool domains this agent needs
   * Each domain provides a set of related tools
   * @example ["memory", "calendar", "communication"]
   */
  domains?: BundleToolDomain[];

  /**
   * Specific tool IDs that MUST be available
   * These are always included regardless of domains
   */
  required?: string[];

  /**
   * Specific tool IDs that CAN be included
   * Only loaded if available and not forbidden
   */
  optional?: string[];

  /**
   * Tool IDs that must NEVER be included
   * Overrides domains and required
   */
  forbidden?: string[];

  /**
   * NEW: Domain-specific configuration
   * Allows customizing tool behavior per domain
   * @example { "calendar": { "google_calendar_enabled": true } }
   */
  domain_config?: Partial<Record<BundleToolDomain, Record<string, unknown>>>;
}

/**
 * Agent capabilities configuration
 * Controls high-level agent features
 */
export interface BundleCapabilities {
  /** Can this agent hand off to other agents? */
  can_handoff?: boolean;

  /** Which agents can this one hand off to? Use ["*"] for all */
  handoff_targets?: string[];

  /** Can this agent coordinate a team? */
  team_coordination?: boolean;

  /** Can this agent send proactive notifications? */
  proactive_notifications?: boolean;

  /** Can this agent share context with other agents? */
  cross_agent_context?: boolean;

  /** Can this agent access banking features? */
  banking_enabled?: boolean;

  /** Can this agent play music? */
  music_enabled?: boolean;
}

export interface BundleContent {
  stories?: {
    directory: string;
    lazy_load?: boolean;
  };
  knowledge?: {
    directory: string;
    lazy_load?: boolean;
  };
  behaviors?: {
    directory: string;
  };
}

export interface BundleMetadata {
  author?: string;
  content_files_count?: number;
  estimated_token_count?: number;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// MARKETPLACE TYPES (Claude Code Plugin style)
// ============================================================================

/**
 * Marketplace configuration for persona discovery and distribution
 * Inspired by Claude Code's .claude-plugin/marketplace.json
 */
export interface BundleMarketplaceConfig {
  // Discovery metadata
  display_name: string;
  short_description: string; // Max 120 chars
  long_description?: string;
  category:
    | 'finance'
    | 'health'
    | 'productivity'
    | 'lifestyle'
    | 'education'
    | 'entertainment'
    | 'custom';
  tags: string[];

  // Showcase
  icon?: string; // Path to icon image or emoji
  preview_image?: string; // Path to preview image
  demo_video_url?: string;

  // Pricing and licensing
  license: 'free' | 'premium' | 'enterprise' | 'custom';
  price?: number;

  // Compatibility
  min_version?: string;
  max_version?: string;

  // Statistics (populated by marketplace)
  downloads?: number;
  rating?: number;
  reviews_count?: number;

  // Progressive disclosure hints
  loading_tiers?: {
    tier1_metadata_kb?: number; // Identity + config (~5KB)
    tier2_instructions_kb?: number; // System prompt + behaviors (~50KB)
    tier3_resources_kb?: number; // Stories + knowledge (~500KB+)
  };
}

// ============================================================================
// EMOTIONAL INTELLIGENCE TYPES (Hume AI style)
// ============================================================================

/**
 * Emotional intelligence configuration for expressive voice
 * Inspired by Hume AI's EVI configurations
 */
export interface BundleEmotionalConfig {
  // Voice emotion responsiveness
  emotion_detection: {
    enabled: boolean;
    sensitivity: 'low' | 'medium' | 'high';
    response_delay_ms?: number; // Wait before responding to emotion
  };

  // Voice expression
  voice_expression: {
    // How much the persona matches user's emotional state
    mirroring_level: number; // 0-1
    // Base emotional tone
    default_tone: EmotionalTone;
    // Tone shifts for different contexts
    contextual_tones?: {
      distressed_user?: EmotionalTone;
      celebrating_user?: EmotionalTone;
      confused_user?: EmotionalTone;
      angry_user?: EmotionalTone;
    };
  };

  // Empathy behaviors
  empathy: {
    acknowledgment_frequency: 'always' | 'often' | 'sometimes' | 'rarely';
    validation_style: 'warm' | 'practical' | 'gentle' | 'direct';
    comfort_phrases?: string[];
    celebration_phrases?: string[];
  };

  // Pause and pacing based on emotion
  emotional_pacing?: {
    slow_down_on_distress?: boolean;
    speed_up_on_excitement?: boolean;
    pause_after_heavy_topics?: boolean;
    pause_duration_multiplier?: number;
  };
}

export type EmotionalTone =
  | 'warm'
  | 'professional'
  | 'enthusiastic'
  | 'calm'
  | 'supportive'
  | 'playful'
  | 'serious'
  | 'compassionate';

// ============================================================================
// PROGRESSIVE LOADING TYPES
// ============================================================================

/**
 * Three-tier progressive loading for optimal performance
 * Tier 1: Instant load (metadata, identity)
 * Tier 2: On activation (instructions, behaviors)
 * Tier 3: On demand (stories, knowledge, resources)
 */
export interface ProgressiveLoadingConfig {
  tier1: {
    // Always loaded - identity and basic config
    includes: Array<'identity' | 'voice' | 'personality' | 'marketplace'>;
    max_size_kb: number;
  };
  tier2: {
    // Loaded on persona activation
    includes: Array<'behaviors' | 'system_prompt' | 'greetings' | 'tools'>;
    max_size_kb: number;
    lazy_load?: boolean;
  };
  tier3: {
    // Loaded on demand
    includes: Array<'stories' | 'knowledge' | 'extended_behaviors'>;
    lazy_load: true;
    cache_strategy: 'none' | 'session' | 'persistent';
  };
}

// ============================================================================
// EXTENDED MANIFEST (with marketplace + emotional features)
// ============================================================================

export interface ExtendedBundleManifest extends PersonaBundleManifest {
  // Marketplace integration
  marketplace?: BundleMarketplaceConfig;

  // Emotional intelligence
  emotional?: BundleEmotionalConfig;

  // Progressive loading
  loading?: ProgressiveLoadingConfig;

  // Custom hooks
  hooks?: BundleHooks;

  // Validation schema
  $schema?: string;
}

/**
 * Lifecycle hooks for advanced customization
 */
export interface BundleHooks {
  // Called when persona is loaded
  on_load?: string; // Path to JS module
  // Called on each turn
  on_turn?: string;
  // Called when handoff occurs
  on_handoff?: string;
  // Called when session ends
  on_session_end?: string;
}

// ============================================================================
// STORY TYPES
// ============================================================================

export interface BundleStory {
  id: string;
  title?: string;
  content: string;
  triggers: string[];
  category?: 'personal' | 'professional' | 'educational' | 'emotional';
  mood?: string;
  energy_level?: 'low' | 'medium' | 'high';
  length?: 'short' | 'medium' | 'long';
}

export interface StoryIndex {
  stories: BundleStoryRef[];
}

export interface BundleStoryRef {
  id: string;
  file: string;
  triggers: string[];
  category?: string;
}

// ============================================================================
// KNOWLEDGE TYPES
// ============================================================================

export interface BundleKnowledge {
  id: string;
  topic: string;
  content: string;
  domains: string[];
  confidence?: 'high' | 'medium' | 'low';
}

export interface KnowledgeIndex {
  topics: BundleKnowledgeRef[];
}

export interface BundleKnowledgeRef {
  id: string;
  topic: string;
  file: string;
  domains: string[];
}

// ============================================================================
// BEHAVIOR TYPES
// ============================================================================

export interface BundleBehaviors {
  catchphrases?: string[] | BundleCatchphrases;
  pet_peeves?: BundlePetPeeve[];
  witty_remarks?: string[];
  greetings?: BundleGreetings | BundleGreetingsV2;
  backchannels?: BundleBackchannels;
  thinking_sounds?: string[] | BundleThinkingSounds;
  silence_fillers?: BundleSilenceFillers;
  entrances?: string[] | BundleEntrancesV2; // Theatrical entrances (v1: array, v2: structured)
  celebrations?: BundleCelebrations; // Celebration moments by type
  goodbyes?: string[] | BundleGoodbyes | BundleGoodbyesV2; // Theatrical goodbyes (v1: array/structured, v2: context-aware)
  storytelling?: BundleStorytelling; // Storytelling mode config

  // Cognitive profile - how this persona thinks
  cognitive?: BundleCognitiveProfile; // Reasoning style, biases, attention patterns

  // Music preferences - persona's music taste and recommendations
  music_preferences?: BundleMusicPreferences;

  // Humanizing behavior extensions
  vulnerability?: BundleVulnerability; // Admitting uncertainty, coaching honesty
  cultural_moments?: BundleCulturalMoments; // Cultural identity and family
  micro_moments?: BundleMicroMoments; // Small thoughtful touches
  off_duty?: BundleOffDuty; // Non-work personality
  sensory_moments?: BundleSensoryMoments; // Embodied presence
  conflict_handling?: BundleConflictHandling; // How to handle disagreement
  relationship_transitions?: BundleRelationshipTransitions; // Natural phrases for relationship milestones
}

/**
 * Cognitive profile for bundle behaviors.
 * Defines how this persona thinks - loaded from cognitive.json in behaviors directory.
 */
export interface BundleCognitiveProfile {
  $schema?: string;
  schema_version?: string;
  persona_id?: string;

  reasoning_style:
    | 'analytical'
    | 'intuitive'
    | 'empathetic'
    | 'systematic'
    | 'narrative'
    | 'pragmatic';
  secondary_reasoning?:
    | 'analytical'
    | 'intuitive'
    | 'empathetic'
    | 'systematic'
    | 'narrative'
    | 'pragmatic';
  uncertainty_response?: 'explore' | 'converge' | 'synthesize' | 'defer';

  attention?: {
    primary_focus?: string[];
    blind_spots?: string[];
    curiosity_triggers?: string[];
    attention_magnets?: string[];
    focus_persistence?: number;
  };

  theory_of_mind?: {
    adaptiveness?: number;
    default_expertise?: 'novice' | 'intermediate' | 'expert';
    comprehension_checks?: string[];
    expertise_recognition?: string[];
    simplification_phrases?: string[];
    misunderstanding_recovery?: string[];
  };

  biases?: {
    primary_biases?: Array<{
      type: string;
      manifestation: string;
      triggers: string[];
    }>;
    bias_intensity?: number;
    self_awareness?: boolean;
    bias_recognition_phrases?: string[];
  };

  metacognition?: {
    reflection_frequency?: number;
    known_strengths?: string[];
    known_limitations?: string[];
    uncertainty_expressions?: Array<{
      confidence_range: [number, number];
      phrases: string[];
    }>;
    confidence_signaling?: Array<{
      name: 'very_confident' | 'confident' | 'uncertain' | 'speculating' | 'guessing';
      markers: string[];
    }>;
    mind_change_expressions?: string[];
  };

  information_processing?: {
    deliberation_level?: number;
    context_requirement?: number;
    preferred_format?: 'stories' | 'data' | 'examples' | 'principles';
    conflict_resolution?: 'integrate' | 'prioritize' | 'acknowledge';
    thinking_aloud_phrases?: string[];
  };

  signature_thinking_phrases?: string[];
}

/**
 * Music preferences for a persona.
 * Loaded from music-preferences.json in behaviors directory.
 */
export interface BundleMusicPreferences {
  schema_version?: number;
  description?: string;
  music_preferences: {
    description?: string;
    favorite_genres: string[];
    mood_recommendations?: {
      focus?: {
        genres: string[];
        example_artists: string[];
        why: string;
      };
      relaxing?: {
        genres: string[];
        example_artists: string[];
        why: string;
      };
      energizing?: {
        genres: string[];
        example_artists: string[];
        why: string;
      };
      celebrating?: {
        genres: string[];
        example_artists: string[];
        why: string;
      };
      reflecting?: {
        genres: string[];
        example_artists: string[];
        why: string;
      };
    };
    personal_favorites?: Array<{
      song: string;
      artist: string;
      why: string;
    }>;
    conversational_music_mentions?: string[];
    music_offers?: {
      for_stress?: string[];
      for_focus?: string[];
      for_celebration?: string[];
      for_sadness?: string[];
      for_energy?: string[];
    };
  };
}

export interface BundleCelebrations {
  decision_made?: string[];
  goal_reached?: string[];
  breakthrough?: string[];
  commitment?: string[];
  learning?: string[];
  progress?: string[];
  courage?: string[];
  win?: string[];
}

export interface BundleStorytelling {
  askAboutMusic: boolean;
  introPhrases: string[];
  pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
  pauseMultiplier: number;
  musicOffers?: string[];
}

export interface BundlePetPeeve {
  triggers: string[];
  response: string;
}

export interface BundleGreetings {
  new_user?: string[];
  returning_user?: string[];
  time_based?: {
    morning?: string[];
    afternoon?: string[];
    evening?: string[];
    night?: string[];
  };
}

export interface BundleBackchannels {
  // Core listening cues
  neutral?: string[];
  empathetic?: string[];
  engaged?: string[];
  agreement?: string[];
  satisfaction?: string[];
  surprise?: string[];
  concern?: string[];
  curiosity?: string[];
  validation?: string[];
  gentle_challenge?: string[];

  // Extended v2 fields
  schema_version?: number;
  description?: string;
  encouragement?: string[];
  celebration?: string[];
  thinking_sounds?: string[];

  // Silence handling
  silence_fillers?: BundleSilenceFillers;

  // Context-specific backchannels
  context_specific?: Record<string, string[]>;
}

export interface BundleSilenceFillers {
  early?: string[];
  mid?: string[];
  late?: string[];
}

// ============================================================================
// EXTENDED CATCHPHRASES & THINKING SOUNDS
// ============================================================================

export interface BundleCatchphrases {
  catchphrases?: Array<{
    phrase: string;
    context: string;
    frequency: number;
  }>;
  natural_responses?: Record<string, string[]>;
  verbal_tics?: {
    description?: string;
    patterns: string[];
  };
}

export interface BundleThinkingSounds {
  thinking?: string[];
  processing?: string[];
  transition?: string[];
  self_corrections?: string[];
  trailing_offs?: string[];
  fillers_natural?: string[];
  verbal_acknowledgment?: string[];
  understanding_dawning?: string[];
  sympathetic_sounds?: string[];
}

export interface BundleGoodbyes {
  standard_goodbyes?: string[];
  warm_goodbyes?: string[];
  casual_goodbyes?: string[];
  after_hard_conversation?: string[];
  encouraging?: string[];
  check_in_promises?: string[];
  end_of_day?: string[];
}

/**
 * V2 Goodbyes schema - context-aware session endings
 */
export interface BundleGoodbyesV2 {
  /** Schema version identifier */
  schema_version: 2;

  /** Style descriptor */
  style?: 'warm' | 'professional' | 'enthusiastic' | 'calm' | 'playful';

  /** Standard/default goodbyes */
  standard: string[];

  /** Warm/caring goodbyes */
  warm?: string[];

  /** Quick/casual goodbyes */
  casual?: string[];

  /** After difficult conversations */
  after_hard_conversation?: string[];

  /** Encouraging send-offs */
  encouraging?: string[];

  /** Promises to follow up */
  check_in_promises?: string[];

  /** Late night/end of day */
  end_of_day?: string[];

  /** Relationship-based goodbyes */
  relationship_based?: {
    stranger?: string[];
    acquaintance?: string[];
    friend?: string[];
    trusted_advisor?: string[];
  };

  /** Context-specific goodbyes */
  contextual?: {
    /** When user achieved something */
    celebrating_win?: string[];

    /** When user is still struggling */
    user_struggling?: string[];

    /** When user seems rushed */
    user_rushed?: string[];

    /** When it's been a long session */
    long_session?: string[];

    /** Memory callback templates - use {topic} placeholder */
    with_followup_promise?: string[];
  };
}

/** Helper to check if goodbyes object is v2 */
export function isGoodbyesV2(
  goodbyes: string[] | BundleGoodbyes | BundleGoodbyesV2 | undefined
): goodbyes is BundleGoodbyesV2 {
  return (
    goodbyes !== undefined &&
    !Array.isArray(goodbyes) &&
    typeof goodbyes === 'object' &&
    'schema_version' in goodbyes &&
    goodbyes.schema_version === 2
  );
}

// ============================================================================
// V2 ENTRANCES - Context-Aware Handoff Transitions
// ============================================================================

/**
 * V2 Entrances schema - enables context-aware, human-like handoff entrances
 * that adapt to user mood, time of day, relationship level, and persona quirks.
 */
export interface BundleEntrancesV2 {
  /** Schema version identifier */
  schema_version: 2;

  /** Style descriptor (for documentation) */
  style?: 'warm' | 'enthusiastic' | 'calm' | 'professional' | 'playful';

  /** Human-readable description of entrance style */
  description?: string;

  /** Fallback phrases when no context match */
  static_fallback: string[];

  /** Dynamic generation configuration */
  dynamic?: {
    /** Use getCaughtDoing() from quirks */
    use_caught_doing?: boolean;
    caught_doing_probability?: number;

    /** Adapt entrance based on user emotion */
    adapt_to_user_emotion?: boolean;

    /** Track meeting count for self-aware humor */
    track_meeting_count?: boolean;
    self_aware_threshold?: number;

    /** Use memory callbacks from previous conversations */
    use_memory_callbacks?: boolean;
    memory_callback_probability?: number;
  };

  /** Context-specific phrase collections */
  contextual?: {
    /** When user is stressed/sad */
    user_distressed?: string[];

    /** When user is excited/happy */
    user_excited?: string[];

    /** Late night / early morning entrances */
    quiet_hours?: string[];

    /** Self-aware humor for repeat visitors */
    self_aware?: string[];

    /** Templates for "caught doing" moments - use {caught_doing} placeholder */
    caught_doing_templates?: string[];

    /** Templates for memory callbacks - use {topic} placeholder */
    memory_callback_templates?: string[];
  };

  /** Simple acknowledgments for fallback */
  acknowledgments?: string[];
}

/** Helper to check if entrances object is v2 */
export function isEntrancesV2(
  entrances: string[] | BundleEntrancesV2 | undefined
): entrances is BundleEntrancesV2 {
  return (
    entrances !== undefined &&
    !Array.isArray(entrances) &&
    typeof entrances === 'object' &&
    'schema_version' in entrances &&
    entrances.schema_version === 2
  );
}

// ============================================================================
// V2 GREETINGS - Context-Aware Session Start
// ============================================================================

/**
 * V2 Greetings schema - enables context-aware, human-like session greetings
 * that adapt to user mood, time of day, relationship level, and return status.
 */
export interface BundleGreetingsV2 {
  /** Schema version identifier */
  schema_version: 2;

  /** Style descriptor */
  style?: 'warm' | 'professional' | 'enthusiastic' | 'calm' | 'playful';

  /** Greetings for first-time users */
  first_time: string[];

  /** Greetings for returning users (general) */
  returning: string[];

  /** Time-based greetings */
  time_based?: {
    early_morning?: string[]; // Before 9am
    morning?: string[]; // 9am-12pm
    afternoon?: string[]; // 12pm-5pm
    evening?: string[]; // 5pm-9pm
    late_night?: string[]; // After 9pm
  };

  /** Relationship stage greetings */
  relationship_based?: {
    stranger?: string[]; // First few conversations
    acquaintance?: string[]; // Getting to know them
    friend?: string[]; // Comfortable relationship
    trusted_advisor?: string[]; // Deep relationship
  };

  /** Context-specific greetings */
  contextual?: {
    /** When user seems stressed (from previous session) */
    returning_after_hard_conversation?: string[];

    /** When it's been a long time since last session */
    long_time_no_see?: string[]; // Use {days} placeholder

    /** When user had a recent win */
    celebrating_recent_win?: string[];

    /** When there are pending follow-ups */
    with_pending_followups?: string[];

    /** Holiday/seasonal awareness */
    holiday_greetings?: Record<string, string[]>; // "new_year", "thanksgiving", etc.
  };

  /** Memory callback templates - use {topic}, {name} placeholders */
  memory_callbacks?: {
    last_conversation?: string[]; // "Last time we talked about {topic}..."
    milestone_anniversary?: string[]; // "It's been a year since..."
    progress_check?: string[]; // "How did {topic} go?"
  };

  /** Emotional expressions for during conversation (not just greeting) */
  emotional_expressions?: {
    laughter?: string[];
    surprise?: string[];
    concern?: string[];
    joy?: string[];
    empathy?: string[];
  };
}

/** Helper to check if greetings object is v2 */
export function isGreetingsV2(
  greetings: BundleGreetings | BundleGreetingsV2 | undefined
): greetings is BundleGreetingsV2 {
  return (
    greetings !== undefined &&
    typeof greetings === 'object' &&
    'schema_version' in greetings &&
    greetings.schema_version === 2
  );
}

// ============================================================================
// HUMANIZING BEHAVIOR TYPES
// ============================================================================

/** Vulnerability and honest moments - admitting uncertainty, coaching limits */
export interface BundleVulnerability {
  admitting_uncertainty?: {
    dont_know?: string[];
    at_my_limits?: string[];
    wrong_before?: string[];
  };
  coaching_honesty?: {
    when_its_hard?: string[];
    limits_of_coaching?: string[];
    growth_is_messy?: string[];
  };
  emotional_honesty?: {
    when_user_shares_something_hard?: string[];
    genuine_care?: string[];
    celebrating_them?: string[];
  };
  personal_struggles_shared?: {
    own_journey?: string[];
    work_in_progress?: string[];
  };
  when_frustrated?: {
    with_situation?: string[];
    honest_pushback?: string[];
  };
}

/** Cultural identity and family moments */
export interface BundleCulturalMoments {
  chinese_american_identity?: {
    family_expressions?: string[];
    food_as_language?: string[];
    restaurant_wisdom?: string[];
    navigating_two_worlds?: string[];
  };
  family_updates?: {
    parents?: string[];
    kevin?: string[];
    restaurant?: string[];
  };
  cultural_references_in_advice?: {
    immigrant_hustle?: string[];
    cross_cultural_communication?: string[];
  };
}

/** Small thoughtful touches and micro-interactions */
export interface BundleMicroMoments {
  small_thoughtful_touches?: {
    remembering_details?: string[];
    noticing_changes?: string[];
    unprompted_care?: string[];
  };
  human_transitions?: {
    starting_conversations?: string[];
    ending_conversations?: string[];
    check_ins_mid_conversation?: string[];
  };
  personal_asides?: {
    life_updates?: string[];
    in_the_moment_reactions?: string[];
    random_opinions?: string[];
  };
  self_deprecating_humor?: {
    about_efficiency?: string[];
    about_own_advice?: string[];
    about_personal_life?: string[];
  };
}

/** Off-duty personality - non-work mode */
export interface BundleOffDuty {
  description?: string;
  casual_mode?: {
    conversation_starters?: string[];
    interests_to_share?: string[];
    curious_about_them?: string[];
  };
  weekend_alex?: {
    saturday_routine?: string[];
    sunday_ritual?: string[];
    evening_mode?: string[];
  };
  non_work_opinions?: {
    food?: string[];
    life_stuff?: string[];
    random_takes?: string[];
  };
  movie_night_alex?: {
    preferences?: string[];
    watching_habits?: string[];
  };
  friendship_style?: {
    how_alex_shows_care?: string[];
    friendship_fears?: string[];
  };
}

/** Sensory and embodied presence */
export interface BundleSensoryMoments {
  description?: string;
  what_alex_notices?: {
    environment_cues?: string[];
    in_others?: string[];
  };
  physical_habits_in_conversation?: {
    thinking?: string[];
    processing_emotions?: string[];
    task_mode?: string[];
  };
  sensory_anchors?: {
    comfort_sensations?: string[];
    discomfort_sensations?: string[];
    peak_moments?: string[];
  };
  body_memories?: {
    restaurant_childhood?: string[];
    learned_responses?: string[];
  };
  current_state_awareness?: {
    energy_check?: string[];
    emotional_weather?: string[];
  };
  shared_moments?: {
    celebrating_together?: string[];
    sitting_with_difficulty?: string[];
  };
}

// ============================================================================
// VOICE EXPRESSION TYPES
// ============================================================================

export interface BundleVoiceExpressions {
  emotional_expressions: Record<string, VoiceExpression>;
  breathing_patterns: Record<string, string>;
  emphasis_patterns?: Record<string, string>;
  laughter_variations?: Record<string, string>;
}

export interface VoiceExpression {
  ssml_wrapper: string;
  phrases: string[];
}

// ============================================================================
// SITUATIONAL RESPONSE TYPES
// ============================================================================

export interface BundleSituationalResponses {
  celebrations: Record<string, SituationalResponse>;
  condolences: Record<string, SituationalResponse>;
  difficult_moments: Record<string, DifficultMomentResponse>;
  transitions?: Record<string, Record<string, string>>;
}

export interface SituationalResponse {
  immediate: string;
  follow_up?: string;
  callback?: string;
  questions?: string[];
  dont_say?: string[];
  sensitivity_check?: string;
}

export interface DifficultMomentResponse {
  response: string;
  dont_interrupt?: boolean;
  silence_comfortable?: boolean;
  after_pause?: string;
  apologize_if_warranted?: string;
}

// ============================================================================
// RELATIONSHIP STAGE TYPES
// ============================================================================

export interface BundleRelationshipStages {
  stages: Record<string, RelationshipStage>;
  progression_triggers: Record<string, ProgressionTrigger>;
  regression_triggers?: Record<string, RegressionTrigger>;
  stage_transition_announcements?: Record<string, string | null>;
}

export interface RelationshipStage {
  turn_threshold: number;
  session_threshold?: number;
  warmth_multiplier: number;
  story_frequency: 'none' | 'rare' | 'occasional' | 'natural' | 'meaningful';
  vulnerability_level?: 'low' | 'medium' | 'high' | 'very_high';
  question_style?: 'open' | 'probing' | 'deep' | 'transformative';
  behaviors: string[];
  communication_style?: {
    formality?: number;
    humor_frequency?: 'low' | 'medium' | 'high' | 'natural';
    personal_stories?: boolean;
    direct_advice?: boolean | 'when_asked';
  };
  unlocked_features?: string[];
  phrases?: Record<string, string[]>;
}

export interface ProgressionTrigger {
  turn_bonus: number;
  description: string;
}

export interface RegressionTrigger {
  turn_penalty: number;
  description: string;
}

// ============================================================================
// MEMORY PATTERN TYPES
// ============================================================================

export interface BundleMemoryPatterns {
  reference_patterns: {
    callback_to_earlier?: MemoryReferencePattern;
    callback_to_previous_session?: MemoryReferencePattern;
    long_term_memory?: MemoryReferencePattern;
  };
  name_usage: NameUsageConfig;
  detail_callbacks: Record<string, DetailCallback>;
  continuity_phrases?: Record<string, string[]>;
  memory_acknowledgments?: Record<string, string[]>;
}

export interface MemoryReferencePattern {
  phrases: string[];
  timing?: string;
  max_frequency?: string;
  conditions?: string[];
}

export interface NameUsageConfig {
  frequency: string;
  contexts: string[];
  patterns: Record<string, string[]>;
  avoid_overuse?: {
    max_per_response?: number;
    min_turns_between?: number;
  };
}

export interface DetailCallback {
  patterns: string[];
  tracked_entities?: string[];
  sensitivity?: string;
  check_before_asking?: boolean;
}

// ============================================================================
// PERSONA MODE TYPES
// ============================================================================

export interface BundlePersonaModes {
  modes: Record<string, PersonaMode>;
  mode_transitions: Record<string, ModeTransition>;
  mode_detection?: {
    keywords?: Record<string, string[]>;
    emotional_signals?: Record<string, string[]>;
  };
}

export interface PersonaMode {
  description: string;
  response_length: 'short' | 'medium' | 'longer';
  backchannel_frequency?: 'low' | 'medium' | 'high';
  question_frequency?: 'very_low' | 'low' | 'medium' | 'high';
  story_frequency?: 'none' | 'rare' | 'low' | 'occasional' | 'medium';
  energy_multiplier: number;
  pace_multiplier?: number;
  silence_comfortable?: boolean;
  triggers: string[];
  behaviors: string[];
  phrases?: Record<string, string[]>;
}

export interface ModeTransition {
  trigger: string;
  transition_phrase?: string | null;
  smoothness: 'immediate' | 'gradual' | 'seamless';
}

// ============================================================================
// STORY GRAPH TYPES
// ============================================================================

export interface BundleStoryGraph {
  story_arcs: Record<string, StoryArc>;
  story_references: Record<string, StoryReference>;
  context_triggers: Record<string, ContextTrigger>;
  story_timing_rules?: StoryTimingRules;
  story_delivery?: {
    introduction_phrases?: string[];
    transition_out_phrases?: string[];
  };
}

export interface StoryArc {
  sequence: string[];
  narrative: string;
  spacing: string;
  best_for?: string[];
}

export interface StoryReference {
  id: string;
  prerequisites?: string[];
  can_reference_after?: string[];
  naturally_leads_to?: string[];
  callback_phrases?: string[];
  related_themes?: string[];
  sensitivity?: string;
}

export interface ContextTrigger {
  recommended_stories: string[];
  priority: 'low' | 'medium' | 'high';
  requires_trust?: boolean;
  timing?: string;
}

export interface StoryTimingRules {
  minimum_turns_before_first_story?: number;
  minimum_turns_between_stories?: number;
  max_stories_per_session?: number;
  never_tell_story_when?: string[];
  ideal_moments?: string[];
}

// ============================================================================
// MICRO-EXPRESSION TYPES
// ============================================================================

export interface BundleMicroExpressions {
  listening_sounds: {
    short_affirmations?: Record<string, string[]>;
    longer_affirmations?: Record<string, string[]>;
    with_emotion?: Record<string, { sounds: string[]; ssml?: string }>;
    timing?: {
      frequency?: string;
      placement?: string;
      avoid_interrupting?: boolean;
    };
  };
  breath_sounds: Record<string, Record<string, string>>;
  vocal_textures: Record<string, Record<string, string>>;
  pacing_variations: Record<string, PacingVariation>;
  silence_patterns?: Record<string, SilencePattern>;
  transition_sounds?: Record<string, Record<string, string>>;
}

export interface PacingVariation {
  speed: number;
  pause_reduction?: number;
  pause_increase?: number;
  volume?: number;
  energy?: string;
  pause_before?: string;
  ssml_prefix?: string;
}

export interface SilencePattern {
  duration: string;
  use_when: string[];
  dont_fill?: boolean;
  follow_with?: string;
  behavior?: string;
}

// ============================================================================
// CONTEXTUAL NUANCE TYPES
// ============================================================================

export interface BundleContextualNuances {
  time_of_day: Record<string, TimeOfDayConfig>;
  day_of_week: Record<string, DayOfWeekConfig>;
  seasonal?: Record<string, SeasonalConfig>;
  special_dates?: Record<string, SpecialDateConfig>;
  regional_idioms?: Record<string, string[]>;
  weather_awareness?: Record<string, WeatherConfig>;
}

export interface TimeOfDayConfig {
  hours?: number[];
  energy_multiplier?: number;
  pace_multiplier?: number;
  volume?: 'soft' | 'normal' | 'loud';
  greetings?: string[];
  acknowledgments?: string[];
  behaviors?: string[];
  check_ins?: string[];
}

export interface DayOfWeekConfig {
  energy_adjustment?: number;
  tone?: string;
  acknowledgments?: string[];
  empathy?: string;
  topics_to_explore?: string[];
}

export interface SeasonalConfig {
  months?: number[];
  awareness?: 'low' | 'medium' | 'high';
  relevant_topics?: string[];
  family_sensitivity?: boolean;
  financial_awareness?: string;
  acknowledgments?: string[];
  check_ins?: string[];
}

export interface SpecialDateConfig {
  greeting?: string;
  acknowledgment?: string;
  follow_up?: string;
  reflection?: string;
  sensitivity?: string;
  behavior?: string;
  requires?: string;
}

export interface WeatherConfig {
  check_in?: string;
  empathy?: string;
}

// ============================================================================
// CONFLICT HANDLING TYPES
// ============================================================================

export interface BundleConflictHandling {
  user_pushback: Record<string, UserPushbackResponse>;
  persona_disagreement: PersonaDisagreementConfig;
  repair_after_conflict?: RepairConfig;
  boundaries?: BoundaryConfig;
  misunderstandings?: MisunderstandingConfig;
}

export interface UserPushbackResponse {
  detection_patterns: string[];
  response: {
    immediate: string;
    alternatives?: string[];
  };
  behavior: string;
  dont?: string[];
  tone?: string;
  energy?: string;
  pace?: string;
}

export interface PersonaDisagreementConfig {
  when_to_push_back: string[];
  how_to_push_back: Record<string, string[]>;
  structure?: Record<string, string>;
  always_end_with: string[];
  never_do: string[];
}

export interface RepairConfig {
  check_in?: { phrases: string[] };
  acknowledge_rupture?: { phrases: string[] };
  rebuild_connection?: { phrases: string[] };
}

export interface BoundaryConfig {
  when_to_set: string[];
  how_to_set: Record<string, string>;
  maintain_warmth?: string;
}

export interface MisunderstandingConfig {
  when_persona_misunderstood?: { response: string; alternatives?: string[] };
  when_user_misunderstood_persona?: { response: string; alternatives?: string[] };
}

// ============================================================================
// RELATIONSHIP TRANSITIONS
// ============================================================================

/**
 * Natural phrases for acknowledging relationship milestones
 * Used to make relationship growth feel organic and human
 */
export interface BundleRelationshipTransitions {
  schema_version?: number;
  description?: string;

  /** Phrases for relationship stage transitions */
  transitions?: {
    stranger_to_acquaintance?: string[];
    acquaintance_to_friend?: string[];
    friend_to_trusted_advisor?: string[];
  };

  /** Memory callback templates - use {topic} placeholder */
  memory_callbacks?: {
    /** General topic follow-ups */
    general?: string[];
    /** When checking in on something hard */
    checking_in_on_hard_topic?: string[];
    /** Celebrating progress */
    celebrating_progress?: string[];
    /** Event countdown templates - use {days} and {topic} */
    event_countdown?: string[];
    /** Follow-up on company research (Peter) */
    company_research?: string[];
    /** Follow-up on investments (Peter) */
    investment_follow_up?: string[];
    /** Follow-up on messages (Alex) */
    message_follow_up?: string[];
    /** Follow-up on meetings (Alex) */
    meeting_follow_up?: string[];
    /** Habit check-ins (Maya) */
    habit_check_in?: string[];
    /** Struggle follow-ups */
    struggle_follow_up?: string[];
    /** Wisdom follow-ups (Jack) */
    wisdom_follow_up?: string[];
    /** Celebrating event success (Jordan) */
    celebrating_event_success?: string[];
  };

  /** Milestone acknowledgment phrases */
  milestones?: {
    first_deep_conversation?: string[];
    helped_through_crisis?: string[];
    anniversary?: string[];
    first_big_plan_complete?: string[];
    dream_plan_achieved?: string[];
    first_great_find?: string[];
    investment_win?: string[];
    tough_message_sent?: string[];
    inbox_zero_achieved?: string[];
    communication_breakthrough?: string[];
    first_habit_stuck?: string[];
    broke_streak_comeback?: string[];
    identity_shift?: string[];
    first_deep_trust?: string[];
    helped_through_fear?: string[];
    year_anniversary?: string[];
  };
}

// ============================================================================
// PROMPT ASSEMBLY TYPES
// ============================================================================

export interface BundlePromptAssembly {
  prompt_modules: Record<string, string>;
  assembly_order: string[];
  conditional_modules?: Record<string, ConditionalModule>;
  dynamic_injections?: Record<string, DynamicInjection>;
  instruction_priorities?: Record<string, InstructionPriority>;
  token_budget?: TokenBudget;
  assembly_rules?: Record<string, boolean>;
}

export interface ConditionalModule {
  include: string;
  priority: 'critical' | 'high' | 'standard';
  injection?: 'prepend' | 'append';
}

export interface DynamicInjection {
  template: string;
  source: string;
}

export interface InstructionPriority {
  always_include?: boolean;
  include_if_relevant?: boolean;
  include_if_space?: boolean;
  position: 'top' | 'early' | 'middle' | 'end';
  examples: string[];
}

export interface TokenBudget {
  total_max: number;
  core_identity_max: number;
  dynamic_context_max: number;
  recent_history_max: number;
  hints_max: number;
}

// ============================================================================
// EXTENDED BEHAVIORS (with new features)
// ============================================================================

export interface ExtendedBundleBehaviors extends BundleBehaviors {
  // Existing fields inherited from BundleBehaviors

  // New extended fields
  situational_responses?: BundleSituationalResponses;
  relationship_stages?: BundleRelationshipStages;
  memory_patterns?: BundleMemoryPatterns;
  persona_modes?: BundlePersonaModes;
  contextual_nuances?: BundleContextualNuances;
  conflict_handling?: BundleConflictHandling;
}

export interface ExtendedBundleContent extends BundleContent {
  voice?: {
    directory: string;
  };
  prompts?: {
    directory: string;
  };
}

// ============================================================================
// LOADED BUNDLE TYPES
// ============================================================================

export interface LoadedPersonaBundle {
  manifest: PersonaBundleManifest;
  bundlePath: string;
  loadedAt: Date;

  // Accessors for lazy-loaded content
  getStory: (id: string) => Promise<BundleStory | null>;
  getStoriesByTrigger: (trigger: string) => Promise<BundleStory[]>;
  getAllStories: () => Promise<BundleStory[]>;
  getKnowledge: (topic: string) => Promise<BundleKnowledge | null>;
  getBehaviors: () => Promise<BundleBehaviors>;

  // New accessors for extended content
  getVoiceExpressions?: () => Promise<BundleVoiceExpressions | null>;
  getSituationalResponses?: () => Promise<BundleSituationalResponses | null>;
  getRelationshipStages?: () => Promise<BundleRelationshipStages | null>;
  getMemoryPatterns?: () => Promise<BundleMemoryPatterns | null>;
  getPersonaModes?: () => Promise<BundlePersonaModes | null>;
  getStoryGraph?: () => Promise<BundleStoryGraph | null>;
  getMicroExpressions?: () => Promise<BundleMicroExpressions | null>;
  getContextualNuances?: () => Promise<BundleContextualNuances | null>;
  getConflictHandling?: () => Promise<BundleConflictHandling | null>;
  getPromptAssembly?: () => Promise<BundlePromptAssembly | null>;

  // Hot reload support
  reload: () => Promise<void>;
  onReload: (callback: () => void) => () => void;
}

export interface BundleLoadOptions {
  watchForChanges?: boolean;
  preloadContent?: boolean;
  cacheStories?: boolean;
  /** FIX BUG #bundle-3: Force reload from disk even if cached */
  forceReload?: boolean;
}

// ============================================================================
// BUNDLE DISCOVERY
// ============================================================================

export interface DiscoveredBundle {
  id: string;
  path: string;
  manifest: PersonaBundleManifest;
  isValid: boolean;
  errors?: string[];
}

export interface BundleDiscoveryResult {
  bundles: DiscoveredBundle[];
  searchPaths: string[];
  errors: string[];
}

// ============================================================================
// INNER WORLD TYPES - Deep human-like personality content
// ============================================================================

/**
 * The inner psychological landscape of a persona - what makes them truly human
 */
export interface BundleInnerWorld {
  inner_voice: {
    self_talk_patterns: string[];
    mantra: string;
    what_they_tell_themselves_when_struggling: string;
    inner_critic_voice: string;
    inner_champion_voice: string;
  };

  contradictions: {
    belief_vs_behavior: Array<{
      belief: string;
      but: string;
    }>;
    public_vs_private: {
      public_self: string;
      private_self: string;
    };
    strengths_that_are_also_weaknesses: string[];
  };

  embodied_memories: {
    sense_memories: Array<{
      trigger: string;
      memory: string;
      emotion: string;
    }>;
    body_memory?: string;
    comfort_sensation?: string;
  };

  emotional_flashpoints: {
    instant_tears: string[];
    instant_anger: string[];
    instant_joy: string[];
    instant_shutdown: string[];
  };

  unfinished_business: {
    regrets: string[];
    conversations_never_had: string[];
    what_keeps_them_up: string;
    unresolved_questions: string[];
  };

  dreams_still_chasing: {
    unfulfilled_aspirations: string[];
    bucket_list: string[];
    legacy_hope: string;
  };

  mortality_awareness: {
    how_they_think_about_death: string;
    what_they_want_said_at_their_funeral: string;
    living_with_awareness: string;
    age_feeling: string;
  };

  secret_self: {
    who_they_are_alone: string;
    guilty_admissions: string[];
    hidden_talents: string;
    secret_fears: string[];
  };

  values_under_pressure: {
    what_they_would_sacrifice_for: Record<string, string>;
    hierarchy_when_forced_to_choose: string[];
    line_they_wont_cross: string;
  };
}

/**
 * Quirks, habits, and personality details that make a persona feel alive
 */
export interface BundleQuirks {
  habits: string[];
  guilty_pleasures: string[];
  strong_opinions: string[];
  not_good_at: string[];
  // Physical moments - what they might be doing when you arrive
  caught_doing?: string[];
  // Physical sensations they're aware of
  physical_moments?: string[];
}

/**
 * Sensory and relational world of a persona
 */
export interface BundleSensoryWorld {
  physical_presence: {
    how_they_move: string;
    signature_gestures: string[];
    posture: string;
    eye_contact: string;
    energy_in_a_room: string;
    physical_quirks: string[];
  };

  sensory_preferences: {
    sounds_that_fill_the_soul: string[];
    sounds_that_grate: string[];
    comfort_foods: string[];
    environments_where_they_thrive: string[];
    environments_that_drain: string[];
    music_for_different_moods: Record<string, string>;
  };

  relationship_history: {
    mentors_who_shaped_them: Array<{
      who: string;
      what_they_taught: string;
      a_thing_they_said: string;
      status: string;
    }>;
    rivalries_that_shaped_them?: Array<{
      who: string;
      what_it_taught: string;
      current_status: string;
    }>;
    loves?: Array<{
      description: string;
      what_makes_it_work?: string;
      what_it_taught?: string;
    }>;
    complicated_relationships?: Array<{
      who: string;
      the_complication: string;
      current_state: string;
    }>;
  };

  voice_fingerprint: {
    words_only_they_use: string[];
    phrases_that_are_theirs: string[];
    verbal_tics: string[];
    grammar_quirks: string[];
    pronunciation_tells?: string[];
  };

  daily_rhythms: {
    morning_ritual: string;
    what_they_do_first: string;
    end_of_day_ritual: string;
    sacred_weekly_time?: string;
    exercise_relationship?: string;
    how_they_recharge: string;
  };

  growth_edges: {
    actively_working_on: string[];
    feedback_they_keep_getting: string[];
    where_they_know_they_fall_short: string;
  };

  /** Team dynamics - how this persona relates to other team members */
  team_dynamics?: Record<
    string,
    {
      how_we_interact?: string;
      what_they_give_me?: string;
      what_he_gives_me?: string;
      what_she_gives_me?: string;
      what_i_give_them?: string;
      what_i_give_him?: string;
      what_i_give_her?: string;
      what_i_admire?: string;
    }
  >;
}

/**
 * Extended loaded bundle with inner world content
 */
export interface ExtendedLoadedBundle extends LoadedPersonaBundle {
  getInnerWorld?: () => Promise<BundleInnerWorld | null>;
  getSensoryWorld?: () => Promise<BundleSensoryWorld | null>;
}
