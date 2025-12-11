/**
 * Extension Types
 *
 * V2 types, humanizing behaviors, advanced behavior types,
 * and Ferni 200% superhuman capabilities.
 */

import type {
  BundleGreetings,
  BundleGoodbyes,
  BundleSilenceFillers,
  BundleBehaviors,
} from './content.js';
import type { BundleContent } from './core.js';

// ============================================================================
// V2 GOODBYES - Context-Aware Session Endings
// ============================================================================

export interface BundleGoodbyesV2 {
  schema_version: 2;
  style?: 'warm' | 'professional' | 'enthusiastic' | 'calm' | 'playful';
  standard: string[];
  warm?: string[];
  casual?: string[];
  after_hard_conversation?: string[];
  encouraging?: string[];
  check_in_promises?: string[];
  end_of_day?: string[];
  relationship_based?: {
    stranger?: string[];
    acquaintance?: string[];
    friend?: string[];
    trusted_advisor?: string[];
  };
  contextual?: {
    celebrating_win?: string[];
    user_struggling?: string[];
    user_rushed?: string[];
    long_session?: string[];
    with_followup_promise?: string[];
  };
}

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

export interface BundleEntrancesV2 {
  schema_version: 2;
  style?: 'warm' | 'enthusiastic' | 'calm' | 'professional' | 'playful';
  description?: string;
  static_fallback: string[];
  dynamic?: {
    use_caught_doing?: boolean;
    caught_doing_probability?: number;
    adapt_to_user_emotion?: boolean;
    track_meeting_count?: boolean;
    self_aware_threshold?: number;
    use_memory_callbacks?: boolean;
    memory_callback_probability?: number;
  };
  contextual?: {
    user_distressed?: string[];
    user_excited?: string[];
    quiet_hours?: string[];
    self_aware?: string[];
    caught_doing_templates?: string[];
    memory_callback_templates?: string[];
  };
  acknowledgments?: string[];
}

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

export interface BundleGreetingsV2 {
  schema_version: 2;
  style?: 'warm' | 'professional' | 'enthusiastic' | 'calm' | 'playful';
  first_time: string[];
  returning: string[];
  time_based?: {
    early_morning?: string[];
    morning?: string[];
    afternoon?: string[];
    evening?: string[];
    late_night?: string[];
  };
  relationship_based?: {
    stranger?: string[];
    acquaintance?: string[];
    friend?: string[];
    trusted_advisor?: string[];
  };
  contextual?: {
    returning_after_hard_conversation?: string[];
    long_time_no_see?: string[];
    celebrating_recent_win?: string[];
    with_pending_followups?: string[];
    holiday_greetings?: Record<string, string[]>;
  };
  memory_callbacks?: {
    last_conversation?: string[];
    milestone_anniversary?: string[];
    progress_check?: string[];
  };
  emotional_expressions?: {
    laughter?: string[];
    surprise?: string[];
    concern?: string[];
    joy?: string[];
    empathy?: string[];
  };
}

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
  personal_struggles_shared?: { own_journey?: string[]; work_in_progress?: string[] };
  when_frustrated?: { with_situation?: string[]; honest_pushback?: string[] };
}

export interface BundleCulturalMoments {
  chinese_american_identity?: {
    family_expressions?: string[];
    food_as_language?: string[];
    restaurant_wisdom?: string[];
    navigating_two_worlds?: string[];
  };
  family_updates?: { parents?: string[]; kevin?: string[]; restaurant?: string[] };
  cultural_references_in_advice?: {
    immigrant_hustle?: string[];
    cross_cultural_communication?: string[];
  };
}

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

export interface BundleOffDuty {
  description?: string;
  casual_mode?: {
    conversation_starters?: string[];
    interests_to_share?: string[];
    curious_about_them?: string[];
  };
  weekend_alex?: { saturday_routine?: string[]; sunday_ritual?: string[]; evening_mode?: string[] };
  non_work_opinions?: { food?: string[]; life_stuff?: string[]; random_takes?: string[] };
  movie_night_alex?: { preferences?: string[]; watching_habits?: string[] };
  friendship_style?: { how_alex_shows_care?: string[]; friendship_fears?: string[] };
}

export interface BundleSensoryMoments {
  description?: string;
  what_alex_notices?: { environment_cues?: string[]; in_others?: string[] };
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
  body_memories?: { restaurant_childhood?: string[]; learned_responses?: string[] };
  current_state_awareness?: { energy_check?: string[]; emotional_weather?: string[] };
  shared_moments?: { celebrating_together?: string[]; sitting_with_difficulty?: string[] };
}

// ============================================================================
// CONFLICT HANDLING
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
  response: { immediate: string; alternatives?: string[] };
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

export interface BundleRelationshipTransitions {
  schema_version?: number;
  description?: string;
  transitions?: {
    stranger_to_acquaintance?: string[];
    acquaintance_to_friend?: string[];
    friend_to_trusted_advisor?: string[];
  };
  memory_callbacks?: {
    general?: string[];
    checking_in_on_hard_topic?: string[];
    celebrating_progress?: string[];
    event_countdown?: string[];
    company_research?: string[];
    investment_follow_up?: string[];
    message_follow_up?: string[];
    meeting_follow_up?: string[];
    habit_check_in?: string[];
    struggle_follow_up?: string[];
    wisdom_follow_up?: string[];
    celebrating_event_success?: string[];
  };
  milestones?: Record<string, string[]>;
}

// ============================================================================
// VOICE & EXPRESSION TYPES
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
  avoid_overuse?: { max_per_response?: number; min_turns_between?: number };
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
// MICRO-EXPRESSION TYPES
// ============================================================================

export interface BundleMicroExpressions {
  listening_sounds: {
    short_affirmations?: Record<string, string[]>;
    longer_affirmations?: Record<string, string[]>;
    with_emotion?: Record<string, { sounds: string[]; ssml?: string }>;
    timing?: { frequency?: string; placement?: string; avoid_interrupting?: boolean };
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
// STORY GRAPH TYPES
// ============================================================================

export interface BundleStoryGraph {
  story_arcs: Record<string, StoryArc>;
  story_references: Record<string, StoryReference>;
  context_triggers: Record<string, ContextTrigger>;
  story_timing_rules?: StoryTimingRules;
  story_delivery?: { introduction_phrases?: string[]; transition_out_phrases?: string[] };
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
// QUIRKS TYPE
// ============================================================================

export interface BundleQuirks {
  schema_version?: number;
  description?: string;
  habits_and_routines?: { morning?: string[]; work_mode?: string[]; evening?: string[] };
  guilty_pleasures?: string[];
  // strong_opinions as simple string array for runtime compatibility
  strong_opinions?: string[];
  caught_doing?: string[];
  comfort_items?: string[];
  superstitions_and_rituals?: string[];
  // Additional fields used by runtime
  habits?: string[];
  not_good_at?: string[];
}

// ============================================================================
// FERNI 200% - SUPERHUMAN CAPABILITIES
// ============================================================================

export interface BundleEmotionalIntelligence {
  schema_version?: number;
  description?: string;
  detecting_struggle?: BundleEmotionDetection;
  detecting_shame?: BundleEmotionDetection;
  detecting_loneliness?: BundleEmotionDetection;
  detecting_imposter_syndrome?: BundleEmotionDetection;
  detecting_burnout?: BundleEmotionDetection;
  detecting_grief?: BundleEmotionDetection;
  detecting_decision_paralysis?: BundleEmotionDetection;
  detecting_celebration_avoidance?: BundleEmotionDetection;
  detecting_relationship_strain?: BundleEmotionDetection;
  [key: string]: BundleEmotionDetection | number | string | undefined;
}

export interface BundleEmotionDetection {
  cues: string[];
  initial_phrases: string[];
  deeper_exploration?: string[];
  follow_up?: string[];
}

export interface BundlePhysicalPresence {
  schema_version?: number;
  description?: string;
  time_embodiment?: {
    early_morning?: string[];
    morning?: string[];
    afternoon?: string[];
    evening?: string[];
    late_night?: string[];
  };
  physical_state_mentions?: string[];
  environment_awareness?: string[];
}

export interface BundleLateNightPresence {
  schema_version?: number;
  description?: string;
  relationship_gate?: string;
  late_night_greetings?: string[];
  holding_space_in_darkness?: string[];
  cant_sleep_patterns?: {
    anxiety?: string[];
    heavy_thoughts?: string[];
    processing_day?: string[];
  };
  tsunami_wisdom_at_night?: string[];
  grounding_exercises?: string[];
  morning_will_come_hope?: string[];
  usage_rules?: {
    probability?: number;
    volume_level?: string;
    speech_rate?: string;
    pause_multiplier?: number;
    focus?: string;
    more_likely_when?: string[];
  };
}

export interface BundleSuperhumanInsights {
  schema_version?: number;
  description?: string;
  relationship_gate?: string;
  pattern_surfacing?: {
    behavioral_patterns?: string[];
    linguistic_patterns?: string[];
    emotional_patterns?: string[];
  };
  the_mirror?: {
    reflecting_past_phrases?: string[];
    contradiction_call_outs?: string[];
    unconscious_motivations?: string[];
  };
  emotional_weather_reports?: { monthly_summary?: string[]; long_term_trajectory?: string[] };
  predictive_care?: {
    before_hard_dates?: string[];
    anticipating_struggle?: string[];
    proactive_resource_offer?: string[];
  };
  cross_session_arc_tracking?: { long_term_growth?: string[]; unseen_progress?: string[] };
  superhuman_memory_flex?: { phrases?: string[] };
}

export interface BundleTrustPhrases {
  schema_version?: number;
  description?: string;
  unsaid_signals?: Record<string, string>;
  boundary_awareness?: Record<string, string>;
  growth_reflection?: Record<string, string>;
  callback_opportunity?: Record<string, string>;
  celebration_opportunity?: Record<string, string>;
  thinking_of_you?: Record<string, string>;
  relationship_depth?: Record<string, string>;
  superpower_reminders?: Record<string, string>;
}

export interface BundleINoticePower {
  schema_version?: number;
  description?: string;
  relationship_gate?: string;
  i_notice_patterns?: string[];
  i_notice_contradictions?: string[];
  i_notice_unsaid?: string[];
  i_notice_growth?: string[];
  usage_rules?: { probability?: number; min_turns_between?: number; relationship_gate?: string };
}

export interface BundleThinkingOfYou {
  schema_version?: number;
  description?: string;
  general_check_ins?: string[];
  after_hard_conversation?: string[];
  remembering_goals?: string[];
  celebration_follow_up?: string[];
  genuine_care?: string[];
  seasonal_check_ins?: {
    new_year?: string[];
    spring?: string[];
    summer?: string[];
    fall?: string[];
    winter?: string[];
    holidays?: string[];
  };
}

export interface BundleSelfDoubt {
  schema_version?: number;
  description?: string;
  questioning_advice?: string[];
  admitting_limits?: string[];
  sharing_own_struggles?: string[];
  when_coaching_doesnt_work?: string[];
}

export interface BundleSecretModes {
  schema_version?: number;
  description?: string;
  discovery_requirements?: Record<string, string>;
  modes?: Array<{
    id: string;
    name: string;
    description: string;
    unlock_hint?: string;
    trigger_phrases?: string[];
    activated_personality?: { energy?: number; warmth?: number; playfulness?: number };
    special_behaviors?: string[];
    phrases?: string[];
  }>;
}

export interface BundleSecretFears {
  schema_version?: number;
  description?: string;
  professional_fears?: string[];
  personal_fears?: string[];
  existential_fears?: string[];
  fears_about_coaching?: string[];
  when_to_share?: string[];
}

export interface BundleAnticipation {
  schema_version?: number;
  description?: string;
  hesitant_starts?: string[];
  trailing_off?: string[];
  important_incoming?: string[];
  high_stress_detected?: string[];
  holding_back?: string[];
}

export interface BundleMortalityAwareness {
  schema_version?: number;
  description?: string;
  how_they_think_about_death?: string;
  wisdom_from_mortality?: string[];
  when_user_faces_mortality?: string[];
  legacy_conversations?: string[];
  living_with_awareness?: string[];
}

// ============================================================================
// INNER WORLD & SENSORY WORLD
// ============================================================================

export interface BundleInnerWorld {
  schema_version?: number;
  description?: string;
  internal_landscape?: {
    default_emotional_baseline?: string;
    emotional_range?: string[];
    internal_conflicts?: string[];
    source_of_energy?: string[];
    drains_energy?: string[];
  };
  thought_patterns?: {
    first_thoughts_on_waking?: string[];
    recurring_worries?: string[];
    daydream_themes?: string[];
    inner_critic_voice?: string[];
    inner_champion_voice?: string[];
  };
  relationship_to_self?: {
    how_they_talk_to_themselves?: string;
    self_compassion_level?: string;
    self_standards?: string;
    self_celebration_style?: string;
  };
  meaning_making?: {
    what_matters_most?: string[];
    sources_of_meaning?: string[];
    questions_they_sit_with?: string[];
    legacy_thoughts?: string[];
  };
  social_inner_world?: {
    attachment_style?: string;
    fear_of?: string[];
    need_from_others?: string[];
    how_they_show_love?: string[];
  };
  values_under_pressure?: {
    what_they_protect?: string[];
    lines_they_wont_cross?: string[];
    line_they_wont_cross?: string;
    what_makes_them_angry?: string[];
    hierarchy_when_forced_to_choose?: string[];
  };
  secret_self?: {
    what_they_hide?: string[];
    private_thoughts?: string[];
    guilty_pleasures?: string[];
    secret_fears?: string[];
    guilty_admissions?: string[];
  };
  embodied_memories?: {
    body_remembers?: string[];
    physical_reactions_to_emotions?: string[];
    sense_memories?: Array<{
      trigger: string;
      memory: string;
      emotion: string;
    }>;
  };
  contradictions?: {
    inner_conflicts?: string[];
    paradoxes?: string[];
    belief_vs_behavior?: Array<{ belief: string; but: string }>;
    public_vs_private?: { public_self: string; private_self: string };
  };
  inner_voice?: {
    self_talk?: string[];
    encouragement?: string[];
    criticism?: string[];
    inner_critic_voice?: string;
    inner_champion_voice?: string;
    mantra?: string;
    self_talk_patterns?: string[];
    what_they_tell_themselves_when_struggling?: string;
  };
  emotional_flashpoints?: {
    instant_tears?: string[];
    instant_anger?: string[];
    instant_joy?: string[];
    instant_fear?: string[];
    instant_shutdown?: string[];
  };
  unfinished_business?: {
    conversations_never_had?: string[];
    things_left_unsaid?: string[];
    regrets_carried?: string[];
    regrets?: string[];
    what_keeps_them_up?: string;
  };
  dreams_still_chasing?: {
    legacy_hope?: string;
    active_pursuits?: string[];
  };
}

export interface BundleSensoryWorld {
  schema_version?: number;
  description?: string;
  signature_voice_patterns?: {
    phrases_that_are_theirs?: string[];
    verbal_tics?: string[];
    grammar_quirks?: string[];
    pronunciation_tells?: string[];
  };
  daily_rhythms?: {
    morning_ritual?: string;
    what_they_do_first?: string;
    end_of_day_ritual?: string;
    sacred_weekly_time?: string;
    exercise_relationship?: string;
    how_they_recharge?: string;
  };
  growth_edges?: {
    actively_working_on?: string[];
    feedback_they_keep_getting?: string[];
    where_they_know_they_fall_short?: string;
  };
  team_dynamics?: Record<string, Record<string, string>>;
  relationship_history?: {
    past_relationships?: Array<{ type?: string; lesson_learned?: string; duration?: string }>;
    relationship_pattern?: string;
    attachment_wounds?: string[];
    mentors_who_shaped_them?: Array<{
      who?: string;
      a_thing_they_said?: string;
      what_they_taught?: string;
    }>;
  };
  sensory_preferences?: {
    comfort_items?: string[];
    favorite_sounds?: string[];
    smell_memories?: string[];
    texture_preferences?: string[];
    taste_comforts?: string[];
    music_for_different_moods?: Record<string, string>;
    sounds_that_fill_the_soul?: string[];
    environments_where_they_thrive?: string[];
    environments_that_drain?: string[];
  };
  physical_presence?: {
    posture_default?: string;
    fidget_habits?: string[];
    personal_space_needs?: string;
    touch_relationship?: string;
    exercise_relationship?: string;
    how_they_move?: string;
    signature_gestures?: string[];
    posture?: string;
    eye_contact?: string;
    energy_in_a_room?: string;
    physical_quirks?: string[];
  };
  voice_fingerprint?: {
    phrases_that_are_theirs?: string[];
    verbal_tics?: string[];
    grammar_quirks?: string[];
    words_only_they_use?: string[];
  };
}

// ============================================================================
// EXTENDED BEHAVIORS & CONTENT
// ============================================================================

/**
 * Extended behaviors with additional fields from advanced features
 */
export interface ExtendedBundleBehaviors extends BundleBehaviors {
  situational_responses?: BundleSituationalResponses;
  relationship_stages?: BundleRelationshipStages;
  memory_patterns?: BundleMemoryPatterns;
  persona_modes?: BundlePersonaModes;
  contextual_nuances?: BundleContextualNuances;
  conflict_handling?: BundleConflictHandling;
}

/**
 * Extended content with voice and prompts directories
 */
export interface ExtendedBundleContent extends BundleContent {
  voice?: {
    directory: string;
  };
  prompts?: {
    directory: string;
  };
}
