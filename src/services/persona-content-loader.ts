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

import { createLogger } from '../utils/safe-logger.js';
import { loadBundleById } from '../personas/bundles/index.js';
import type { BundleBehaviors } from '../personas/bundles/types.js';

const log = createLogger({ module: 'PersonaContentLoader' });

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
  topic_specific?: {
    [topic: string]: string[];
  };
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
    const bundle = await loadBundleById(personaId);
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
export async function loadSilenceResponses(
  personaId = 'ferni'
): Promise<SilenceResponses | null> {
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
  // Life coaching domain loaders
  loadSecondChancesVoice,
  loadConnectionVoice,
  loadDifficultConversationsVoice,
  loadLifeTransitionsVoice,
  loadQuietGrowthVoice,
  getRandomPhrase,
  getRandomPhraseClean,
  stripSsml,
  clearContentCache,
  // Cache monitoring
  getContentCacheStats,
  pruneExpiredContent,
};
