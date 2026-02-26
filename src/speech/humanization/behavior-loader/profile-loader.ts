/**
 * Speech Profile Loading & Caching
 *
 * Loads persona speech behavior profiles from JSON files.
 * Provides cached access with TTL-based invalidation.
 *
 * @module speech/humanization/behavior-loader/profile-loader
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { join } from 'path';
import { promises as fs } from 'fs';
import type {
  PersonaSpeechProfile,
  SpeechImperfectionsSchema,
  ThinkingSoundsSchema,
  BackchannelsSchema,
  BreathSoundsSchema,
  LateNightPresenceSchema,
  CallbacksSchema,
  LaughterContagionSchema,
  EnergyMatchingSchema,
  CelebrationsSchema,
  CatchphrasesSchema,
  AnticipationSchema,
} from '../types.js';

const log = createLogger({ module: 'SpeechBehaviorLoader' });

// =============================================================================
// CONSTANTS
// =============================================================================

const BUNDLES_PATH = join(process.cwd(), 'src', 'personas', 'bundles');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// CACHE
// =============================================================================

interface CachedProfile {
  profile: PersonaSpeechProfile;
  loadedAt: Date;
}

const profileCache = new Map<string, CachedProfile>();

function isCacheValid(cached: CachedProfile): boolean {
  return Date.now() - cached.loadedAt.getTime() < CACHE_TTL_MS;
}

// =============================================================================
// FILE LOADING
// =============================================================================

/**
 * Load a single JSON behavior file
 */
async function loadBehaviorFile<T>(personaId: string, fileName: string): Promise<T | null> {
  try {
    const filePath = join(BUNDLES_PATH, personaId, 'content', 'behaviors', fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    // File may not exist for all personas - that's OK
    return null;
  }
}

/**
 * Load complete speech profile for a persona
 */
export async function loadSpeechProfile(personaId: string): Promise<PersonaSpeechProfile> {
  // Check cache
  const cached = profileCache.get(personaId);
  if (cached && isCacheValid(cached)) {
    return cached.profile;
  }

  // Load all behavior files in parallel
  const [
    imperfections,
    thinkingSounds,
    backchannels,
    breathSounds,
    lateNightPresence,
    callbacks,
    laughterContagion,
    energyMatching,
    celebrations,
    catchphrases,
    anticipation,
  ] = await Promise.all([
    loadBehaviorFile<SpeechImperfectionsSchema>(personaId, 'speech-imperfections.json'),
    loadBehaviorFile<ThinkingSoundsSchema>(personaId, 'thinking-sounds.json'),
    loadBehaviorFile<BackchannelsSchema>(personaId, 'backchannels.json'),
    loadBehaviorFile<BreathSoundsSchema>(personaId, 'breath-sounds.json'),
    loadBehaviorFile<LateNightPresenceSchema>(personaId, 'late-night-presence.json'),
    loadBehaviorFile<CallbacksSchema>(personaId, 'callbacks.json'),
    loadBehaviorFile<LaughterContagionSchema>(personaId, 'laughter-contagion.json'),
    loadBehaviorFile<EnergyMatchingSchema>(personaId, 'energy-matching.json'),
    loadBehaviorFile<CelebrationsSchema>(personaId, 'celebrations.json'),
    loadBehaviorFile<CatchphrasesSchema>(personaId, 'catchphrases.json'),
    loadBehaviorFile<AnticipationSchema>(personaId, 'anticipation.json'),
  ]);

  const profile: PersonaSpeechProfile = {
    personaId,
    imperfections,
    thinkingSounds,
    backchannels,
    breathSounds,
    lateNightPresence,
    callbacks,
    laughterContagion,
    energyMatching,
    celebrations,
    catchphrases,
    anticipation,
    loadedAt: new Date(),
  };

  // Cache
  profileCache.set(personaId, { profile, loadedAt: new Date() });

  log.debug(
    {
      personaId,
      hasImperfections: !!imperfections,
      hasThinking: !!thinkingSounds,
      hasLateNight: !!lateNightPresence,
      hasCallbacks: !!callbacks,
      hasLaughter: !!laughterContagion,
      hasEnergy: !!energyMatching,
      hasCelebrations: !!celebrations,
      hasCatchphrases: !!catchphrases,
      hasAnticipation: !!anticipation,
    },
    'Loaded speech profile'
  );

  return profile;
}

/**
 * Clear cache for a persona (useful for testing/hot reload)
 */
export function clearSpeechProfileCache(personaId?: string): void {
  if (personaId) {
    profileCache.delete(personaId);
  } else {
    profileCache.clear();
  }
}

// =============================================================================
// PRELOADING
// =============================================================================

/**
 * Preload speech profiles for all known personas
 */
export async function preloadAllSpeechProfiles(): Promise<void> {
  const personas = [
    'ferni',
    'maya-santos',
    'jordan-taylor',
    'alex-chen',
    'nayan-patel',
    'peter-john',
  ];

  await Promise.all(personas.map((p) => loadSpeechProfile(p)));

  log.info({ count: personas.length }, 'Preloaded speech profiles');
}

// =============================================================================
// SYNC ACCESSORS (for use in sync code paths after preloading)
// =============================================================================

/**
 * Get cached speech profile synchronously.
 * Returns null if profile hasn't been preloaded.
 * Call preloadAllSpeechProfiles() at startup to enable sync access.
 */
export function getSpeechProfileSync(personaId: string): PersonaSpeechProfile | null {
  const cached = profileCache.get(personaId);
  if (cached && isCacheValid(cached)) {
    return cached.profile;
  }
  return null;
}

/**
 * Check if speech profiles have been preloaded
 */
export function areSpeechProfilesPreloaded(): boolean {
  return profileCache.size > 0;
}

// =============================================================================
// SHARED HELPERS (used across behavior-loader modules)
// =============================================================================

/**
 * Get a random phrase from an array
 */
export function getRandomPhrase(phrases: string[] | undefined, seed?: string): string | null {
  if (!phrases || phrases.length === 0) return null;

  // Use seed for deterministic testing if provided
  const index = seed
    ? Math.abs(hashCode(seed)) % phrases.length
    : Math.floor(Math.random() * phrases.length);

  return phrases[index];
}

/**
 * Simple string hash for seeded randomness
 */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Check if context matches usage rules
 */
export function matchesContext(
  usageRules: { more_likely_when?: string[]; less_likely_when?: string[] } | undefined,
  context: import('../types.js').BehaviorSelectionContext
): { matches: boolean; boost: number } {
  if (!usageRules) {
    return { matches: true, boost: 0 };
  }

  const contextKeywords: string[] = [];

  // Build context keywords from emotional context
  if (context.emotional.userEmotion) {
    contextKeywords.push(context.emotional.userEmotion);
  }
  if (context.emotional.agentTone) {
    contextKeywords.push(context.emotional.agentTone);
  }
  if (context.emotional.isVulnerable) {
    contextKeywords.push('vulnerable', 'serious_moment');
  }
  if (context.emotional.isLateNight) {
    contextKeywords.push('late_night');
  }

  // Build context keywords from content context
  if (context.content.isCelebration) {
    contextKeywords.push('celebrating_wins', 'celebration', 'celebratory');
  }
  if (context.content.isComforting) {
    contextKeywords.push('user_struggling', 'serious_setback', 'supportive');
  }
  if (context.content.isQuestion) {
    contextKeywords.push('curious', 'asking');
  }

  // Check for "less likely" matches (negative boost)
  const lessLikely = usageRules.less_likely_when || [];
  for (const condition of lessLikely) {
    if (contextKeywords.some((k) => k.toLowerCase().includes(condition.toLowerCase()))) {
      return { matches: false, boost: -0.5 };
    }
  }

  // Check for "more likely" matches (positive boost)
  const moreLikely = usageRules.more_likely_when || [];
  let boost = 0;
  for (const condition of moreLikely) {
    if (contextKeywords.some((k) => k.toLowerCase().includes(condition.toLowerCase()))) {
      boost += 0.2;
    }
  }

  return { matches: true, boost: Math.min(boost, 0.5) };
}
