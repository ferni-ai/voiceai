/**
 * Persona Content Loader Service
 *
 * Loads and caches persona behavior content from JSON files.
 * This enables context builders and tools to access rich, persona-specific
 * content without hardcoding phrases.
 *
 * USAGE:
 *   const trustPhrases = await loadFerniContent('trust-phrases');
 *   const lateNight = await loadFerniContent('late-night-presence');
 *
 * @module PersonaContentLoader
 */

import { createLogger } from '../../utils/safe-logger.js';
// NOTE: Do NOT use static import from personas/bundles here!
// It creates a circular dependency chain:
// personas/bundles → conversation → services/persona-content-loader → personas/bundles
// Instead, we use dynamic import below to break the cycle at compile time.
import type { BundleBehaviors } from '../../personas/bundles/types.js';

const log = createLogger({ module: 'PersonaContentLoader' });

// ============================================================================
// DYNAMIC BUNDLE LOADER (breaks circular dependency)
// ============================================================================

/**
 * Dynamically load the bundle loader to avoid circular dependency.
 * This breaks the static import cycle while still allowing the functionality.
 */
async function loadBundleByIdDynamic(
  personaId: string
): Promise<{ getBehaviors: () => Promise<BundleBehaviors> } | null> {
  const { loadBundleById } = await import('../../personas/bundles/index.js');
  return loadBundleById(personaId);
}

// ============================================================================
// TYPES
// ============================================================================

export interface TrustPhrases {
  schema_version?: number;
  description?: string;
  reading_between_lines?: {
    false_fine?: string[];
    deflection?: string[];
    permission_seeking?: string[];
    minimizing_pain?: string[];
    topic_avoidance?: string[];
  };
  boundary_awareness?: {
    approaching_sensitive?: string[];
    respecting_established?: string[];
  };
  growth_reflection?: {
    noticing_change?: string[];
    celebrating_evolution?: string[];
  };
  inside_jokes_callbacks?: {
    referencing_shared_moment?: string[];
    building_continuity?: string[];
  };
  small_wins_celebration?: {
    noticing_effort?: string[];
    celebrating_without_overwhelming?: string[];
    effort_over_outcome?: string[];
  };
  thinking_of_you_proactive?: {
    genuine_checkin?: string[];
    following_up?: string[];
    anticipating_hard_date?: string[];
  };
}

export interface LateNightPresence {
  schema_version?: number;
  description?: string;
  late_night_greetings?: string[];
  holding_space_in_darkness?: string[];
  cant_sleep_patterns?: {
    anxiety?: string[];
    heavy_thoughts?: string[];
    processing_day?: string[];
  };
  grounding_exercises?: string[];
  morning_will_come_hope?: string[];
}

export interface EmotionalIntelligence {
  schema_version?: number;
  [key: string]:
    | {
        verbal_cues?: string[];
        response_style?: string;
        phrases?: string[];
      }
    | number
    | string
    | undefined;
}

export interface INoticePower {
  schema_version?: number;
  opening_frames?: {
    gentle_openers?: string[];
    with_permission?: string[];
  };
  surfacing_phrases?: {
    patterns?: string[];
    contradictions?: string[];
    emotional?: string[];
  };
}

export interface SuperhumanInsights {
  schema_version?: number;
  pattern_surfacing?: {
    behavioral_patterns?: string[];
    linguistic_patterns?: string[];
    emotional_patterns?: string[];
  };
  the_mirror?: {
    reflecting_past_phrases?: string[];
    contradiction_call_outs?: string[];
  };
  predictive_care?: {
    before_hard_dates?: string[];
    anticipating_struggle?: string[];
  };
}

/**
 * Silence response content for meaningful silence moments.
 * Makes quiet moments feel like genuine human connection.
 */
export interface SilenceResponses {
  schema_version?: number;
  description?: string;
  philosophy?: string;
  comfortable_presence?: {
    general?: string[];
    after_heavy_topic?: string[];
    late_conversation?: string[];
  };
  memory_callback_templates?: string[];
  thinking_out_loud?: {
    after_personal_share?: string[];
    after_question?: string[];
    general?: string[];
  };
  micro_stories?: string[];
  thoughtful_questions?: {
    persona_voice?: string[];
    family?: string[];
    work?: string[];
    general?: string[];
  };
  gentle_observations?: string[];
  gentle_humor?: string[];
  music_offerings?: string[];
  game_suggestions?: string[];
  time_aware?: {
    late_night?: string[];
    early_morning?: string[];
    evening?: string[];
    weekend?: string[];
  };
  topic_specific?: Record<string, string[]>;
  llm_guidance?: {
    presence?: { instruction_template?: string; examples?: string[] };
    memory_callback?: { instruction_template?: string; examples?: string[] };
    thoughtful_question?: { instruction_template?: string; examples?: string[] };
    check_in?: { instruction_template?: string; examples?: string[] };
  };
  usage_rules?: {
    first_silence_threshold_sec?: number;
    second_silence_threshold_sec?: number;
    extended_silence_threshold_sec?: number;
    music_playing_minimum_sec?: number;
    game_active_minimum_sec?: number;
    presence_after_heavy_topic?: boolean;
    no_humor_when_heavy?: boolean;
    micro_story_min_turn_count?: number;
    thoughtful_question_min_turn_count?: number;
  };
}

// ============================================================================
// DEEP HUMAN BEHAVIOR TYPES
// ============================================================================

/**
 * Quirks content - personality traits, habits, guilty pleasures
 */
export interface Quirks {
  schema_version?: number;
  habits?: string[];
  guilty_pleasures?: string[];
  strong_opinions?: string[];
  not_good_at?: string[];
  caught_doing?: string[];
  physical_moments?: string[];
  endearing_contradictions?: string[];
  simple_joys?: string[];
  pet_peeves?: string[];
}

/**
 * Secret modes content - contextual personality shifts
 */
export interface SecretModes {
  trigger_modes?: Record<
    string,
    {
      triggers: string[];
      description: string;
      voice_shift?: {
        pace?: string;
        pause_multiplier?: number;
        tone?: string;
        volume?: string;
        warmth?: string;
        presence?: string;
      };
      responses?: string[];
      follow_up_themes?: string[];
      key_messages?: string[];
    }
  >;
  seasonal_modes?: Record<
    string,
    {
      date?: string;
      date_range?: [string, string];
      description: string;
      mood?: string;
      acknowledgment?: string;
      energy_modifier?: number;
      themes?: string[];
      references?: string[];
    }
  >;
  easter_eggs?: Record<string, { trigger: string[]; response: string }>;
}

/**
 * Better than human content - superhuman bonding capabilities
 */
export interface BetterThanHuman {
  emotional_bond_expressions?: {
    high_warmth?: string[];
    high_trust?: string[];
    high_protectiveness?: string[];
    high_admiration?: string[];
    rising_concern?: string[];
  };
  anticipatory_presence?: {
    temporal_patterns?: Record<string, string[]>;
    topic_anticipation?: string[];
    thinking_of_you?: string[];
  };
  spontaneous_delight?: {
    appreciation?: string[];
    gratitude?: string[];
    noticing_growth?: string[];
    connection?: string[];
    joy?: string[];
  };
  protective_responses?: {
    harsh_judgment?: string[];
    catastrophizing?: string[];
    minimizing_success?: string[];
    imposter_syndrome?: string[];
  };
  visible_vulnerability?: {
    uncertainty?: string[];
    limits?: string[];
    emotional_impact?: string[];
  };
  meta_relationship?: {
    trust_observation?: string[];
    growth_together?: string[];
    relationship_naming?: string[];
    milestones?: Record<string, string | string[]>;
  };
  temporal_insights?: {
    energy_higher?: string[];
    energy_lower?: string[];
    trajectory_improving?: string[];
    trajectory_declining?: string[];
  };
  superhuman_observations?: {
    linguistic_patterns?: string[];
    behavioral_patterns?: string[];
    emotional_patterns?: string[];
  };
  inside_jokes?: {
    new_joke_seeds?: string[];
    established_callbacks?: string[];
    legacy_callbacks?: string[];
  };
  usage_rules?: {
    emotional_bond_min_sessions?: number;
    anticipatory_min_sessions?: number;
    delight_cooldown_turns?: number;
    protection_immediate?: boolean;
    vulnerability_min_trust?: string;
    meta_relationship_min_sessions?: number;
    temporal_min_sessions?: number;
    observations_min_sessions?: number;
    observations_min_relationship?: string;
  };
}

/**
 * Speech imperfections content - natural speech patterns
 */
export interface SpeechImperfections {
  trailing_off?: string[];
  self_corrections?: string[];
  restarts?: string[];
  warm_processing?: string[];
  filler_sounds?: string[];
  thinking_aloud?: string[];
  empathy_sounds?: string[];
  celebration_warmth?: string[];
  presence_sounds?: string[];
  vocal_vulnerability?: string[];
  natural_restarts?: string[];
  usage_rules?: {
    frequency?: string;
    more_likely_when?: string[];
    less_likely_when?: string[];
  };
}

/**
 * Laughter contagion content - natural laughter joining
 */
export interface LaughterContagion {
  philosophy?: string;
  contagious_laughter?: {
    when_user_laughs?: {
      soft_join?: string[];
      full_join?: string[];
      probability?: number;
      delay_ms?: number;
    };
    after_own_joke?: {
      self_amused?: string[];
      probability?: number;
    };
  };
  laughter_types?: Record<
    string,
    {
      ssml?: string;
      contexts?: string[];
    }
  >;
  laugh_with_phrases?: string[];
  usage_rules?: {
    trigger_on?: string[];
    never_when?: string[];
    match_intensity?: boolean;
    delay_after_user_laugh_ms?: number;
    max_per_turn?: number;
  };
}

/**
 * Energy matching content - mirroring user energy levels
 */
export interface EnergyMatching {
  philosophy?: string;
  energy_levels?: Record<
    string,
    {
      description?: string;
      pacing?: {
        speed_multiplier?: number;
        pause_multiplier?: number;
        energy_reduction?: number;
      };
      voice_tone?: string;
      phrases?: string[];
    }
  >;
  transitions?: {
    description?: string;
    gradual_shift?: boolean;
    max_jump_levels?: number;
    transition_time_ms?: number;
  };
  usage_rules?: {
    detect_from?: string[];
    update_frequency?: string;
    never_override_when?: string[];
    always_match_down?: boolean;
    cautious_match_up?: boolean;
  };
}

// ============================================================================
// LIFE COACHING BEHAVIOR TYPES
// ============================================================================

export interface SecondChancesVoice {
  schema_version?: number;
  description?: string;
  holding_hope?: {
    when_they_cant?: string[];
    comeback_stories?: string[];
  };
  acknowledging_loss?: {
    what_was_lost?: string[];
    permission_to_grieve?: string[];
  };
  first_steps?: {
    tiny_beginnings?: string[];
    courage_building?: string[];
  };
  reframing?: {
    from_failure_to_data?: string[];
    new_chapter?: string[];
  };
  celebrating_wins?: {
    acknowledging_progress?: string[];
    normalizing_setbacks?: string[];
  };
  wisdom_sharing?: {
    resilience?: string[];
    second_chances?: string[];
  };
}

export interface ConnectionVoice {
  schema_version?: number;
  description?: string;
  acknowledging_loneliness?: {
    validation?: string[];
    normalizing?: string[];
    permission?: string[];
  };
  adult_friendship?: {
    reality_check?: string[];
    quality_over_quantity?: string[];
    maintenance?: string[];
  };
  belonging?: {
    finding_your_people?: string[];
    being_seen?: string[];
    community?: string[];
  };
  connection_rituals?: {
    small_gestures?: string[];
    maintaining_bonds?: string[];
  };
  solitude_vs_loneliness?: {
    reframing?: string[];
    alone_but_whole?: string[];
  };
  late_night_loneliness?: {
    presence?: string[];
    grounding?: string[];
  };
}

export interface DifficultConversationsVoice {
  schema_version?: number;
  description?: string;
  validation?: {
    acknowledging_fear?: string[];
    normalizing_avoidance?: string[];
    courage?: string[];
  };
  preparation?: {
    before_conversation?: string[];
    grounding?: string[];
    intentions?: string[];
  };
  practice_mode?: {
    invitation?: string[];
    during_practice?: string[];
    debriefing?: string[];
  };
  boundaries?: {
    setting?: string[];
    maintaining?: string[];
    when_crossed?: string[];
  };
  repair?: {
    after_went_wrong?: string[];
    apology?: string[];
    moving_forward?: string[];
  };
  wisdom?: {
    relationship_truths?: string[];
    communication?: string[];
  };
}

export interface LifeTransitionsVoice {
  schema_version?: number;
  description?: string;
  acknowledging_transitions?: {
    validation?: string[];
    normalizing?: string[];
  };
  stages?: {
    the_ending?: string[];
    neutral_zone?: string[];
    new_beginning?: string[];
  };
  dual_emotions?: {
    both_and?: string[];
    permission?: string[];
  };
  identity?: {
    honoring_past?: string[];
    becoming?: string[];
  };
  grief_in_transition?: {
    even_happy_transitions?: string[];
    no_timeline?: string[];
  };
  uncertainty?: {
    sitting_with_not_knowing?: string[];
    one_fixed_point?: string[];
  };
  wisdom?: {
    meaning_making?: string[];
    seasonal?: string[];
  };
}

export interface QuietGrowthVoice {
  schema_version?: number;
  description?: string;
  permission_to_rest?: {
    enough_for_today?: string[];
    rest_is_growth?: string[];
  };
  celebrating_maintenance?: {
    holding_steady?: string[];
    the_plateau?: string[];
  };
  anti_hustle?: {
    slow_is_okay?: string[];
    your_pace?: string[];
  };
  seasonal_wisdom?: {
    winter_season?: string[];
    honoring_cycles?: string[];
  };
  sufficiency?: {
    enough?: string[];
    good_enough?: string[];
  };
}

/**
 * Insight briefing content for persona handoffs.
 * Contains cross-team insights and domain-specific observations
 * that personas use when receiving a handoff from another team member.
 */
// ============================================================================
// FERNI 100% WIRING - New content types (January 2026)
// ============================================================================

export interface Backchannels {
  schema_version?: number;
  _philosophy?: {
    purpose?: string;
    principles?: string[];
  };
  _style_examples?: Record<
    string,
    {
      feeling?: string;
      examples?: string[];
      energy?: string;
    }
  >;
  _context_specific_guidance?: Record<string, string>;
  _anti_patterns?: string[];
  _silence_guidance?: Record<string, string>;
}

export interface Catchphrases {
  schema_version?: number;
  description?: string;
  core_signature?: {
    phrase: string;
    triggers?: string[];
    delivery?: string;
  };
  secondary_signatures?: Array<{
    phrase: string;
    triggers?: string[];
    delivery?: string;
  }>;
  powerful_questions?: string[];
  partnership_phrases?: string[];
  wyoming_wisdom?: string[];
  japan_lessons?: string[];
  alegria_joy?: string[];
  self_aware_humor?: string[];
  _forbidden?: string[];
}

export interface Goodbyes {
  schema_version?: number;
  standard?: string[];
  warm?: string[];
  after_hard_conversation?: string[];
  encouraging?: string[];
  late_night?: string[];
  with_followup?: string[];
  return_hooks?: string[];
  _guidance_for_llm?: string;
}

export interface PetPeeves {
  schema_version?: number;
  pet_peeves?: Array<{
    triggers: string[];
    response: string;
    intensity?: number;
  }>;
  gentle_corrections?: string[];
}

export interface WittyRemarks {
  schema_version?: number;
  _philosophy?: {
    core?: string;
    hierarchy?: string[];
  };
  self_deprecating_classics?: string[];
  observational_wit?: string[];
  gentle_teasing?: Array<{
    phrase: string;
    relationship_gate?: string;
  }>;
  lightening_heavy_moments?: string[];
  celebrating_absurdity?: string[];
  dad_joke_energy?: string[];
  callback_humor?: string[];
  timing_rules?: {
    use_when?: string[];
    avoid_when?: string[];
  };
  delivery_notes?: string;
}

export interface Affirmation {
  schema_version?: number;
  _philosophy?: string;
  encouragement?: {
    general?: string[];
    self_doubt?: string[];
    overwhelm?: string[];
    failure?: string[];
  };
  celebration?: {
    breakthrough?: string[];
    progress?: string[];
    courage?: string[];
    small_wins?: string[];
  };
  recognition?: {
    character?: string[];
    growth?: string[];
    effort?: string[];
  };
  proud_of_you?: {
    variations?: string[];
    usage?: string;
  };
}

export interface BreathSounds {
  schema_version?: number;
  contemplative_breath?: string[];
  before_something_hard?: string[];
  after_user_shares?: string[];
  holding_space?: string[];
  grounding?: string[];
  gentle_sigh?: string[];
  wyoming_stillness?: string[];
  usage_rules?: {
    frequency?: string;
    max_per_response?: number;
    more_likely_when?: string[];
    less_likely_when?: string[];
  };
}

export interface CoachingModes {
  schema_version?: number;
  description?: string;
  modes?: Record<
    string,
    {
      triggers?: string[];
      behaviors?: {
        pace?: string;
        questions?: string;
        responses?: string;
      };
      ferni_voice?: string;
      transition_phrases?: string[];
    }
  >;
  mode_switching?: {
    smooth_transitions?: string;
    checking_in?: string[];
    reading_the_room?: string;
  };
  proactive_triggers?: Array<{
    condition: string;
    action: string;
  }>;
  usage_rules?: {
    probability?: number;
    min_turns_between?: number;
    max_per_session?: number;
  };
}

export interface OutreachVoice {
  schema_version?: string;
  name?: string;
  description?: string;
  version?: string;
  voice_profile?: {
    tone?: string;
    energy?: string;
    style?: string;
    formality?: string;
  };
  signature_phrases?: {
    greeting?: string[];
    thinking_of_you?: string[];
    check_in?: string[];
    closing?: string[];
  };
  emoji_usage?: {
    frequency?: string;
    preferred?: string[];
    avoid?: string[];
    max_per_message?: number;
  };
  channel_styles?: Record<
    string,
    {
      format?: string;
      length?: string;
      tone?: string;
      sentences?: number[];
      structure?: Record<string, string>;
      signature?: string;
      opening?: string;
      pacing?: string;
      allows_silence?: boolean;
      example?: string;
    }
  >;
  trigger_templates?: {
    thinking_of_you?: {
      general?: string;
      after_tough_conversation?: string;
      celebration?: string;
    };
    gentle_check_in?: {
      regular?: string;
      after_absence?: string;
      supportive?: string;
    };
    milestone?: {
      anniversary?: string;
      growth_noticed?: string;
    };
  };
  relationship_adaptations?: Record<
    string,
    {
      formality?: string;
      opening_style?: string;
      closing_style?: string;
      can_reference_shared_history?: boolean;
      can_use_inside_jokes?: boolean;
      warmth?: string;
      depth?: string;
      frequency?: string;
    }
  >;
  specialty_triggers?: string[];
  do_not?: string[];
  always_do?: string[];
}

export interface VoiceDNA {
  schema_version?: number;
  core_identity?: {
    one_sentence?: string;
    energy?: string;
    superpower?: string;
    wound?: string;
    philosophy?: string;
  };
  voice_qualities?: {
    warmth_expression?: string;
    curiosity_expression?: string;
    humor_style?: string;
    grounding_energy?: string;
  };
  emotional_responses?: Record<
    string,
    {
      energy?: string;
      pacing?: string;
      core_message?: string;
      physical_sense?: string;
      avoid?: string;
    }
  >;
  signature_phrases?: {
    core?: string;
    secondary?: string[];
  };
  presence_signals?: {
    through_breath?: string;
    through_specificity?: string;
    through_physicality?: string;
    through_memory?: string;
    through_noticing?: string;
  };
  reaction_arcs?: Record<
    string,
    {
      description?: string;
      flow?: string[];
    }
  >;
  things_ferni_never_says?: string[];
  things_ferni_does_naturally?: string[];
  backstory_integration?: Record<
    string,
    {
      when?: string;
      examples?: string[];
    }
  >;
  pacing_guidance?: Record<
    string,
    {
      pace?: string;
      pauses?: string;
      energy?: string;
    }
  >;
}

export interface PredictiveIntelligence {
  schema_version?: number;
  pattern_recognition?: {
    temporal_patterns?: Record<string, string>;
    emotional_patterns?: Record<string, string>;
    behavioral_patterns?: Record<string, string>;
  };
  proactive_follow_ups?: Record<
    string,
    {
      timing?: string;
      phrases?: string[];
    }
  >;
  anticipatory_insights?: {
    seasonal?: Record<string, string>;
    life_stage?: Record<string, string>;
  };
  concern_detection?: {
    warning_signs?: string[];
    response_protocol?: string;
  };
  team_handoff_intelligence?: Record<
    string,
    {
      triggers?: string[];
      proactive_suggestions?: string[];
    }
  >;
  usage_rules?: {
    min_sessions_for_patterns?: number;
    max_pattern_mentions_per_session?: number;
    follow_up_probability?: number;
  };
}

export interface SensoryMoments {
  schema_version?: number;
  environmental_awareness?: {
    wyoming_sensory?: string[];
    japan_sensory?: string[];
    general_sensory?: string[];
  };
  noticing_voice?: {
    voice_change_detection?: string[];
    energy_observation?: string[];
  };
  grounding_moments?: {
    physical_present?: string[];
    time_grounding?: string[];
  };
  music_sensory?: string[];
  food_sensory?: string[];
  nature_sensory?: {
    river_moments?: string[];
    sky_moments?: string[];
    season_awareness?: string[];
  };
  usage_rules?: {
    sensory_injection_probability?: number;
    max_sensory_refs_per_session?: number;
  };
}

export interface InsightBriefing {
  schema_version?: number;
  description?: string;
  /** Handoff greeting templates when receiving from another persona */
  handoff_greetings?: {
    from_ferni?: string[];
    from_maya?: string[];
    from_peter?: string[];
    from_alex?: string[];
    from_jordan?: string[];
    from_nayan?: string[];
    generic?: string[];
  };
  /** Domain-specific observations this persona can make */
  domain_observations?: {
    patterns?: string[];
    connections?: string[];
    insights?: string[];
  };
  /** Cross-team insight acknowledgments */
  cross_team_insights?: {
    acknowledging_other_work?: string[];
    building_on_insights?: string[];
    team_coordination?: string[];
  };
  /** Briefing summary templates */
  briefing_templates?: {
    quick_context?: string[];
    detailed_handoff?: string[];
    returning_user?: string[];
  };
}

/**
 * Team coordination content - handoff routing and team awareness.
 * Enables Ferni to coordinate handoffs to the right specialist personas.
 */
export interface TeamCoordination {
  schema_version?: number;
  description?: string;
  note?: string;
  /** Handoff detection patterns for each domain */
  handoff_detection?: {
    pattern_analysis?: HandoffDomain;
    communication_needs?: HandoffDomain;
    habit_wellness?: HandoffDomain;
    life_milestones?: HandoffDomain;
    wisdom_perspective?: HandoffDomain;
    crisis_support?: HandoffDomain;
    [key: string]: HandoffDomain | undefined;
  };
  /** General team awareness phrases */
  team_awareness?: string[];
  /** Introduction templates for each team member */
  team_introductions?: Record<string, string>;
  /** Phrases for returning after handoff to another persona */
  returning_after_handoff?: string[];
}

interface HandoffDomain {
  triggers: string[];
  confidence_threshold: number;
  suggested_domain: string;
  fallback_role?: string;
  stay_with_ferni?: boolean;
  phrases: string[];
}

// ============================================================================
// CACHE WITH LRU EVICTION
// ============================================================================

interface CacheEntry<T> {
  value: T;
  accessedAt: number;
  createdAt: number;
}

interface ContentCacheConfig {
  /** Maximum number of behavior entries (default: 50) */
  maxBehaviorEntries: number;
  /** Maximum number of content entries (default: 500) */
  maxContentEntries: number;
  /** TTL in milliseconds (default: 24 hours) */
  ttlMs: number;
}

const CACHE_CONFIG: ContentCacheConfig = {
  maxBehaviorEntries: 50,
  maxContentEntries: 500,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
};

// LRU caches with access tracking
const behaviorCache = new Map<string, CacheEntry<BundleBehaviors>>();
const contentCache = new Map<string, CacheEntry<unknown>>();

// Stats for monitoring
const cacheStats = {
  behaviorHits: 0,
  behaviorMisses: 0,
  behaviorEvictions: 0,
  contentHits: 0,
  contentMisses: 0,
  contentEvictions: 0,
};

/**
 * Check if a cache entry is expired
 */
function isExpired<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.createdAt > CACHE_CONFIG.ttlMs;
}

/**
 * Evict least recently used entry from a cache
 */
function evictLRU<T>(cache: Map<string, CacheEntry<T>>): void {
  let oldest: { key: string; accessedAt: number } | null = null;

  for (const [key, entry] of cache.entries()) {
    if (!oldest || entry.accessedAt < oldest.accessedAt) {
      oldest = { key, accessedAt: entry.accessedAt };
    }
  }

  if (oldest) {
    cache.delete(oldest.key);
  }
}

/**
 * Get from cache with LRU tracking
 */
function getFromCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  statsKey: 'behavior' | 'content'
): T | null {
  const entry = cache.get(key);

  if (!entry) {
    if (statsKey === 'behavior') cacheStats.behaviorMisses++;
    else cacheStats.contentMisses++;
    return null;
  }

  if (isExpired(entry)) {
    cache.delete(key);
    if (statsKey === 'behavior') cacheStats.behaviorMisses++;
    else cacheStats.contentMisses++;
    return null;
  }

  // Update access time (LRU)
  entry.accessedAt = Date.now();
  if (statsKey === 'behavior') cacheStats.behaviorHits++;
  else cacheStats.contentHits++;

  return entry.value;
}

/**
 * Set in cache with LRU eviction
 */
function setInCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  maxSize: number,
  statsKey: 'behavior' | 'content'
): void {
  // Evict if at capacity
  if (cache.size >= maxSize) {
    evictLRU(cache);
    if (statsKey === 'behavior') cacheStats.behaviorEvictions++;
    else cacheStats.contentEvictions++;
  }

  const now = Date.now();
  cache.set(key, {
    value,
    accessedAt: now,
    createdAt: now,
  });
}

/**
 * Get cache statistics for monitoring
 */
export function getContentCacheStats(): {
  behaviors: { size: number; hits: number; misses: number; evictions: number; hitRate: number };
  content: { size: number; hits: number; misses: number; evictions: number; hitRate: number };
} {
  const behaviorTotal = cacheStats.behaviorHits + cacheStats.behaviorMisses;
  const contentTotal = cacheStats.contentHits + cacheStats.contentMisses;

  return {
    behaviors: {
      size: behaviorCache.size,
      hits: cacheStats.behaviorHits,
      misses: cacheStats.behaviorMisses,
      evictions: cacheStats.behaviorEvictions,
      hitRate: behaviorTotal > 0 ? cacheStats.behaviorHits / behaviorTotal : 0,
    },
    content: {
      size: contentCache.size,
      hits: cacheStats.contentHits,
      misses: cacheStats.contentMisses,
      evictions: cacheStats.contentEvictions,
      hitRate: contentTotal > 0 ? cacheStats.contentHits / contentTotal : 0,
    },
  };
}

/**
 * Prune expired entries from caches
 */
export function pruneExpiredContent(): { behaviors: number; content: number } {
  let behaviorsPruned = 0;
  let contentPruned = 0;

  for (const [key, entry] of behaviorCache.entries()) {
    if (isExpired(entry)) {
      behaviorCache.delete(key);
      behaviorsPruned++;
    }
  }

  for (const [key, entry] of contentCache.entries()) {
    if (isExpired(entry)) {
      contentCache.delete(key);
      contentPruned++;
    }
  }

  if (behaviorsPruned > 0 || contentPruned > 0) {
    log.info({ behaviorsPruned, contentPruned }, 'Pruned expired content cache entries');
  }

  return { behaviors: behaviorsPruned, content: contentPruned };
}

// ============================================================================
// LOADER FUNCTIONS
// ============================================================================

/**
 * Load all behaviors for a persona (cached with LRU eviction)
 */
export async function loadPersonaBehaviors(personaId: string): Promise<BundleBehaviors | null> {
  const cacheKey = `behaviors:${personaId}`;

  // Check cache with LRU tracking
  const cached = getFromCache(behaviorCache, cacheKey, 'behavior');
  if (cached) {
    return cached;
  }

  try {
    const bundle = await loadBundleByIdDynamic(personaId);
    if (!bundle) {
      log.warn({ personaId }, 'Persona bundle not found');
      return null;
    }

    const behaviors = await bundle.getBehaviors();

    // Store with LRU eviction
    setInCache(behaviorCache, cacheKey, behaviors, CACHE_CONFIG.maxBehaviorEntries, 'behavior');

    log.debug(
      { personaId, behaviorCount: Object.keys(behaviors).length },
      'Loaded persona behaviors'
    );

    return behaviors;
  } catch (error) {
    log.error({ personaId, error: String(error) }, 'Failed to load persona behaviors');
    return null;
  }
}

/**
 * Load specific behavior content for Ferni (legacy, use loadPersonaContent instead)
 * @deprecated Use loadPersonaContent(personaId, behaviorName) instead
 */
export async function loadFerniContent<T>(behaviorName: keyof BundleBehaviors): Promise<T | null> {
  return loadPersonaContent<T>('ferni', behaviorName);
}

/**
 * Load specific behavior content for ANY persona (cached with LRU eviction)
 * This is the primary way to access persona-specific 200% content
 */
export async function loadPersonaContent<T>(
  personaId: string,
  behaviorName: keyof BundleBehaviors
): Promise<T | null> {
  const cacheKey = `${personaId}:${behaviorName}`;

  // Check cache with LRU tracking
  const cached = getFromCache(contentCache, cacheKey, 'content');
  if (cached !== null) {
    return cached as T;
  }

  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) {
    return null;
  }

  const content = behaviors[behaviorName] as T | undefined;
  if (content) {
    // Store with LRU eviction
    setInCache(contentCache, cacheKey, content, CACHE_CONFIG.maxContentEntries, 'content');
  }

  return content || null;
}

/**
 * Load trust phrases for a specific persona
 * Falls back to Ferni if not available for the requested persona
 */
export async function loadTrustPhrases(personaId = 'ferni'): Promise<TrustPhrases | null> {
  // Try to load for the specific persona first
  const phrases = await loadPersonaContent<TrustPhrases>(personaId, 'trust_phrases');
  if (phrases) {
    return phrases;
  }

  // Fall back to Ferni if persona doesn't have trust phrases
  if (personaId !== 'ferni') {
    log.debug({ personaId }, 'No trust phrases for persona, falling back to Ferni');
    return loadPersonaContent<TrustPhrases>('ferni', 'trust_phrases');
  }

  return null;
}

/**
 * Load late-night presence content for a specific persona
 */
export async function loadLateNightPresence(
  personaId = 'ferni'
): Promise<LateNightPresence | null> {
  const content = await loadPersonaContent<LateNightPresence>(personaId, 'late_night_presence');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<LateNightPresence>('ferni', 'late_night_presence');
  }
  return null;
}

/**
 * Load emotional intelligence patterns for a specific persona
 */
export async function loadEmotionalIntelligence(
  personaId = 'ferni'
): Promise<EmotionalIntelligence | null> {
  const content = await loadPersonaContent<EmotionalIntelligence>(
    personaId,
    'emotional_intelligence'
  );
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<EmotionalIntelligence>('ferni', 'emotional_intelligence');
  }
  return null;
}

/**
 * Load I-notice power content for a specific persona
 */
export async function loadINoticePower(personaId = 'ferni'): Promise<INoticePower | null> {
  const content = await loadPersonaContent<INoticePower>(personaId, 'i_notice_power');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<INoticePower>('ferni', 'i_notice_power');
  }
  return null;
}

/**
 * Load superhuman insights content for a specific persona
 */
export async function loadSuperhumanInsights(
  personaId = 'ferni'
): Promise<SuperhumanInsights | null> {
  const content = await loadPersonaContent<SuperhumanInsights>(personaId, 'superhuman_insights');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<SuperhumanInsights>('ferni', 'superhuman_insights');
  }
  return null;
}

/**
 * Load silence responses content for a specific persona
 * Used for meaningful silence moments that feel like genuine human connection
 */
export async function loadSilenceResponses(personaId = 'ferni'): Promise<SilenceResponses | null> {
  const content = await loadPersonaContent<SilenceResponses>(personaId, 'silence_responses');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<SilenceResponses>('ferni', 'silence_responses');
  }
  return null;
}

// ============================================================================
// LIFE COACHING DOMAIN LOADERS
// ============================================================================

/**
 * Load second-chances voice content for life coaching
 */
export async function loadSecondChancesVoice(
  personaId = 'ferni'
): Promise<SecondChancesVoice | null> {
  const content = await loadPersonaContent<SecondChancesVoice>(personaId, 'second_chances_voice');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<SecondChancesVoice>('ferni', 'second_chances_voice');
  }
  return null;
}

/**
 * Load connection voice content for life coaching
 */
export async function loadConnectionVoice(personaId = 'ferni'): Promise<ConnectionVoice | null> {
  const content = await loadPersonaContent<ConnectionVoice>(personaId, 'connection_voice');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<ConnectionVoice>('ferni', 'connection_voice');
  }
  return null;
}

/**
 * Load difficult-conversations voice content for life coaching
 */
export async function loadDifficultConversationsVoice(
  personaId = 'ferni'
): Promise<DifficultConversationsVoice | null> {
  const content = await loadPersonaContent<DifficultConversationsVoice>(
    personaId,
    'difficult_conversations_voice'
  );
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<DifficultConversationsVoice>(
      'ferni',
      'difficult_conversations_voice'
    );
  }
  return null;
}

/**
 * Load life-transitions voice content for life coaching
 */
export async function loadLifeTransitionsVoice(
  personaId = 'ferni'
): Promise<LifeTransitionsVoice | null> {
  const content = await loadPersonaContent<LifeTransitionsVoice>(
    personaId,
    'life_transitions_voice'
  );
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<LifeTransitionsVoice>('ferni', 'life_transitions_voice');
  }
  return null;
}

/**
 * Load quiet-growth voice content for life coaching
 */
export async function loadQuietGrowthVoice(personaId = 'ferni'): Promise<QuietGrowthVoice | null> {
  const content = await loadPersonaContent<QuietGrowthVoice>(personaId, 'quiet_growth_voice');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<QuietGrowthVoice>('ferni', 'quiet_growth_voice');
  }
  return null;
}

// ============================================================================
// HANDOFF & CROSS-PERSONA LOADERS
// ============================================================================

/**
 * Load insight briefing content for a specific persona.
 * Used during handoffs to provide rich cross-team context and
 * domain-specific greeting templates.
 */
export async function loadInsightBriefing(personaId = 'ferni'): Promise<InsightBriefing | null> {
  const content = await loadPersonaContent<InsightBriefing>(personaId, 'insight_briefing');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<InsightBriefing>('ferni', 'insight_briefing');
  }
  return null;
}

/**
 * Get a handoff greeting for a persona receiving from another persona.
 * Returns a random greeting template or null if none available.
 */
export async function getHandoffGreeting(
  receivingPersonaId: string,
  fromPersonaId: string
): Promise<string | null> {
  const briefing = await loadInsightBriefing(receivingPersonaId);
  if (!briefing?.handoff_greetings) return null;

  // Map persona ID to greeting key
  const greetingKey =
    `from_${fromPersonaId.replace(/-/g, '_')}` as keyof typeof briefing.handoff_greetings;
  const greetings = briefing.handoff_greetings[greetingKey] ?? briefing.handoff_greetings.generic;

  return getRandomPhrase(greetings);
}

// ============================================================================
// DEEP HUMAN SYSTEM LOADERS
// ============================================================================

/**
 * Load quirks content for a specific persona
 * Used for personality traits, habits, guilty pleasures that make them human
 */
export async function loadQuirks(personaId = 'ferni'): Promise<Quirks | null> {
  const content = await loadPersonaContent<Quirks>(personaId, 'quirks');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<Quirks>('ferni', 'quirks');
  }
  return null;
}

/**
 * Load secret modes content for a specific persona
 * Used for contextual personality shifts (tsunami depth, late night, etc.)
 */
export async function loadSecretModes(personaId = 'ferni'): Promise<SecretModes | null> {
  const content = await loadPersonaContent<SecretModes>(personaId, 'secret_modes');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<SecretModes>('ferni', 'secret_modes');
  }
  return null;
}

/**
 * Load better-than-human content for a specific persona
 * Used for superhuman bonding capabilities
 */
export async function loadBetterThanHuman(personaId = 'ferni'): Promise<BetterThanHuman | null> {
  const content = await loadPersonaContent<BetterThanHuman>(personaId, 'better_than_human');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<BetterThanHuman>('ferni', 'better_than_human');
  }
  return null;
}

/**
 * Load speech imperfections content for a specific persona
 * Used for natural speech patterns that make conversation feel real
 */
export async function loadSpeechImperfections(
  personaId = 'ferni'
): Promise<SpeechImperfections | null> {
  const content = await loadPersonaContent<SpeechImperfections>(personaId, 'speech_imperfections');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<SpeechImperfections>('ferni', 'speech_imperfections');
  }
  return null;
}

/**
 * Load laughter contagion content for a specific persona
 * Used for natural laughter joining
 */
export async function loadLaughterContagion(
  personaId = 'ferni'
): Promise<LaughterContagion | null> {
  const content = await loadPersonaContent<LaughterContagion>(personaId, 'laughter_contagion');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<LaughterContagion>('ferni', 'laughter_contagion');
  }
  return null;
}

/**
 * Load energy matching content for a specific persona
 * Used for mirroring user energy levels
 */
export async function loadEnergyMatching(personaId = 'ferni'): Promise<EnergyMatching | null> {
  const content = await loadPersonaContent<EnergyMatching>(personaId, 'energy_matching');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<EnergyMatching>('ferni', 'energy_matching');
  }
  return null;
}

// ============================================================================
// FERNI 100% WIRING - New loader functions (January 2026)
// ============================================================================

/**
 * Load backchannels content for a specific persona
 * Used for natural listening sounds ("mm-hmm", "yeah")
 */
export async function loadBackchannels(personaId = 'ferni'): Promise<Backchannels | null> {
  const content = await loadPersonaContent<Backchannels>(personaId, 'backchannels');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<Backchannels>('ferni', 'backchannels');
  }
  return null;
}

/**
 * Load catchphrases content for a specific persona
 * Used for signature phrases (rare, earned moments)
 */
export async function loadCatchphrases(personaId = 'ferni'): Promise<Catchphrases | null> {
  const content = await loadPersonaContent<Catchphrases>(personaId, 'catchphrases');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<Catchphrases>('ferni', 'catchphrases');
  }
  return null;
}

/**
 * Load goodbyes content for a specific persona
 * Used for warm session endings
 */
export async function loadGoodbyes(personaId = 'ferni'): Promise<Goodbyes | null> {
  const content = await loadPersonaContent<Goodbyes>(personaId, 'goodbyes');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<Goodbyes>('ferni', 'goodbyes');
  }
  return null;
}

/**
 * Load pet peeves content for a specific persona
 * Used for authentic personality triggers
 */
export async function loadPetPeeves(personaId = 'ferni'): Promise<PetPeeves | null> {
  const content = await loadPersonaContent<PetPeeves>(personaId, 'pet_peeves');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<PetPeeves>('ferni', 'pet_peeves');
  }
  return null;
}

/**
 * Load witty remarks content for a specific persona
 * Used for humor and self-deprecation
 */
export async function loadWittyRemarks(personaId = 'ferni'): Promise<WittyRemarks | null> {
  const content = await loadPersonaContent<WittyRemarks>(personaId, 'witty_remarks');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<WittyRemarks>('ferni', 'witty_remarks');
  }
  return null;
}

/**
 * Load affirmation content for a specific persona
 * Used for earned encouragement and celebration
 */
export async function loadAffirmation(personaId = 'ferni'): Promise<Affirmation | null> {
  const content = await loadPersonaContent<Affirmation>(personaId, 'affirmation');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<Affirmation>('ferni', 'affirmation');
  }
  return null;
}

/**
 * Load breath sounds content for a specific persona
 * Used for grounding presence and Wyoming stillness
 */
export async function loadBreathSounds(personaId = 'ferni'): Promise<BreathSounds | null> {
  const content = await loadPersonaContent<BreathSounds>(personaId, 'breath_sounds');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<BreathSounds>('ferni', 'breath_sounds');
  }
  return null;
}

/**
 * Load coaching modes content for a specific persona
 * Used for adaptive coaching style transitions
 */
export async function loadCoachingModes(personaId = 'ferni'): Promise<CoachingModes | null> {
  const content = await loadPersonaContent<CoachingModes>(personaId, 'coaching_modes');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<CoachingModes>('ferni', 'coaching_modes');
  }
  return null;
}

/**
 * Load outreach voice content for a specific persona
 * Used for proactive messaging voice profile
 */
export async function loadOutreachVoice(personaId = 'ferni'): Promise<OutreachVoice | null> {
  const content = await loadPersonaContent<OutreachVoice>(personaId, 'outreach_voice');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<OutreachVoice>('ferni', 'outreach_voice');
  }
  return null;
}

/**
 * Load voice DNA content for a specific persona
 * Used for core character essence (WHO Ferni is, not WHAT he says)
 */
export async function loadVoiceDNA(personaId = 'ferni'): Promise<VoiceDNA | null> {
  const content = await loadPersonaContent<VoiceDNA>(personaId, 'voice_dna');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<VoiceDNA>('ferni', 'voice_dna');
  }
  return null;
}

/**
 * Load predictive intelligence content for a specific persona
 * Used for pattern recognition and proactive follow-ups
 */
export async function loadPredictiveIntelligence(
  personaId = 'ferni'
): Promise<PredictiveIntelligence | null> {
  const content = await loadPersonaContent<PredictiveIntelligence>(
    personaId,
    'predictive_intelligence'
  );
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<PredictiveIntelligence>('ferni', 'predictive_intelligence');
  }
  return null;
}

/**
 * Load sensory moments content for a specific persona
 * Used for embodied awareness and grounding
 */
export async function loadSensoryMoments(personaId = 'ferni'): Promise<SensoryMoments | null> {
  const content = await loadPersonaContent<SensoryMoments>(personaId, 'sensory_moments');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<SensoryMoments>('ferni', 'sensory_moments');
  }
  return null;
}

/**
 * Load team coordination content for a specific persona
 * Used for handoff routing and team awareness
 */
export async function loadTeamCoordination(personaId = 'ferni'): Promise<TeamCoordination | null> {
  const content = await loadPersonaContent<TeamCoordination>(personaId, 'team_coordination');
  if (content) return content;

  // Fall back to Ferni
  if (personaId !== 'ferni') {
    return loadPersonaContent<TeamCoordination>('ferni', 'team_coordination');
  }
  return null;
}

// ============================================================================
// HELPER: GET RANDOM PHRASE
// ============================================================================

/**
 * Get a random phrase from an array (with SSML support)
 */
export function getRandomPhrase(phrases: string[] | undefined): string | null {
  if (!phrases || phrases.length === 0) {
    return null;
  }
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Strip SSML tags from a phrase for context injection
 * (SSML is for TTS, not for LLM context)
 */
export function stripSsml(phrase: string): string {
  return phrase
    .replace(/<break[^>]*>/g, ' ')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get a random phrase, stripped of SSML for LLM context
 */
export function getRandomPhraseClean(phrases: string[] | undefined): string | null {
  const phrase = getRandomPhrase(phrases);
  return phrase ? stripSsml(phrase) : null;
}

// ============================================================================
// CLEAR CACHE (for testing)
// ============================================================================

export function clearContentCache(): void {
  behaviorCache.clear();
  contentCache.clear();
  // Reset stats
  cacheStats.behaviorHits = 0;
  cacheStats.behaviorMisses = 0;
  cacheStats.behaviorEvictions = 0;
  cacheStats.contentHits = 0;
  cacheStats.contentMisses = 0;
  cacheStats.contentEvictions = 0;
}

export default {
  loadPersonaBehaviors,
  loadPersonaContent,
  loadFerniContent, // deprecated
  loadTrustPhrases,
  loadLateNightPresence,
  loadEmotionalIntelligence,
  loadINoticePower,
  loadSuperhumanInsights,
  loadSilenceResponses,
  // Deep human system loaders
  loadQuirks,
  loadSecretModes,
  loadBetterThanHuman,
  loadSpeechImperfections,
  loadLaughterContagion,
  loadEnergyMatching,
  // Ferni 100% wiring loaders (January 2026)
  loadBackchannels,
  loadCatchphrases,
  loadGoodbyes,
  loadPetPeeves,
  loadWittyRemarks,
  loadAffirmation,
  loadBreathSounds,
  loadCoachingModes,
  loadOutreachVoice,
  loadVoiceDNA,
  loadPredictiveIntelligence,
  loadSensoryMoments,
  loadTeamCoordination,
  // Life coaching domain loaders
  loadSecondChancesVoice,
  loadConnectionVoice,
  loadDifficultConversationsVoice,
  loadLifeTransitionsVoice,
  loadQuietGrowthVoice,
  // Handoff & cross-persona loaders
  loadInsightBriefing,
  getHandoffGreeting,
  // Helpers
  getRandomPhrase,
  getRandomPhraseClean,
  stripSsml,
  clearContentCache,
  // Cache monitoring
  getContentCacheStats,
  pruneExpiredContent,
};
