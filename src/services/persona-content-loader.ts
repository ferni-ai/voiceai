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

// ============================================================================
// CACHE
// ============================================================================

const behaviorCache = new Map<string, BundleBehaviors>();
const contentCache = new Map<string, unknown>();

// ============================================================================
// LOADER FUNCTIONS
// ============================================================================

/**
 * Load all behaviors for a persona (cached)
 */
export async function loadPersonaBehaviors(personaId: string): Promise<BundleBehaviors | null> {
  const cacheKey = `behaviors:${personaId}`;

  if (behaviorCache.has(cacheKey)) {
    return behaviorCache.get(cacheKey) || null;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      log.warn({ personaId }, 'Persona bundle not found');
      return null;
    }

    const behaviors = await bundle.getBehaviors();
    behaviorCache.set(cacheKey, behaviors);

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
 * Load specific behavior content for ANY persona
 * This is the primary way to access persona-specific 200% content
 */
export async function loadPersonaContent<T>(
  personaId: string,
  behaviorName: keyof BundleBehaviors
): Promise<T | null> {
  const cacheKey = `${personaId}:${behaviorName}`;

  if (contentCache.has(cacheKey)) {
    return contentCache.get(cacheKey) as T;
  }

  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) {
    return null;
  }

  const content = behaviors[behaviorName] as T | undefined;
  if (content) {
    contentCache.set(cacheKey, content);
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
  getRandomPhrase,
  getRandomPhraseClean,
  stripSsml,
  clearContentCache,
};
