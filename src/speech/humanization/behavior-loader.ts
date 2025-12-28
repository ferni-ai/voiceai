/**
 * Speech Behavior Loader
 *
 * Unified loader for persona speech behaviors from JSON files.
 * Provides cached, typed access to speech imperfections, thinking sounds,
 * backchannels, and breath sounds.
 *
 * Part of the "Better Than Human" speech humanization system.
 *
 * @module speech/humanization/behavior-loader
 */

import { createLogger } from '../../utils/safe-logger.js';
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
  ImperfectionCategory,
  BehaviorSelectionContext,
  SelectedBehavior,
  InjectionConfig,
  INJECTION_CONFIGS,
  PERSONA_INJECTION_STYLE,
} from './types.js';

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
async function loadBehaviorFile<T>(
  personaId: string,
  fileName: string
): Promise<T | null> {
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
export async function loadSpeechProfile(
  personaId: string
): Promise<PersonaSpeechProfile> {
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

  log.debug({
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
  }, 'Loaded speech profile');

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
// BEHAVIOR SELECTION
// =============================================================================

/**
 * Get a random phrase from an array
 */
function getRandomPhrase(phrases: string[] | undefined, seed?: string): string | null {
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
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Check if context matches usage rules
 */
function matchesContext(
  usageRules: { more_likely_when?: string[]; less_likely_when?: string[] } | undefined,
  context: BehaviorSelectionContext
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
    if (contextKeywords.some(k => k.toLowerCase().includes(condition.toLowerCase()))) {
      return { matches: false, boost: -0.5 };
    }
  }

  // Check for "more likely" matches (positive boost)
  const moreLikely = usageRules.more_likely_when || [];
  let boost = 0;
  for (const condition of moreLikely) {
    if (contextKeywords.some(k => k.toLowerCase().includes(condition.toLowerCase()))) {
      boost += 0.2;
    }
  }

  return { matches: true, boost: Math.min(boost, 0.5) };
}

/**
 * Select an imperfection phrase based on context
 */
export async function selectImperfection(
  personaId: string,
  category: ImperfectionCategory,
  context: BehaviorSelectionContext
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.imperfections) {
    return null;
  }

  // Get phrases for the category
  const phrases = profile.imperfections[category as keyof SpeechImperfectionsSchema];
  if (!Array.isArray(phrases)) {
    return null;
  }

  // Check context match
  const { matches, boost } = matchesContext(profile.imperfections.usage_rules, context);
  if (!matches) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) {
    return null;
  }

  return {
    phrase,
    category,
    position: getPositionForCategory(category),
    confidence: 0.7 + boost,
    metadata: {
      source: 'speech-imperfections',
      personaId,
      contextMatch: [],
    },
  };
}

/**
 * Select a thinking sound based on context
 */
export async function selectThinkingSound(
  personaId: string,
  context: BehaviorSelectionContext
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.thinkingSounds) {
    return null;
  }

  // Determine which category based on context
  let category: keyof ThinkingSoundsSchema;
  if (context.emotional.isVulnerable || context.content.isComforting) {
    category = 'empathy';
  } else if (context.content.isQuestion) {
    category = 'considering';
  } else if (context.emotional.agentTone === 'curious') {
    category = 'uncertainty';
  } else {
    category = 'processing';
  }

  const phrases = profile.thinkingSounds[category];
  if (!Array.isArray(phrases)) {
    // Fallback to general thinking
    const fallback = profile.thinkingSounds.thinking;
    if (!Array.isArray(fallback)) return null;

    const phrase = getRandomPhrase(fallback, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'thinking',
      position: 'prefix',
      confidence: 0.6,
      metadata: {
        source: 'thinking-sounds',
        personaId,
        contextMatch: ['fallback'],
      },
    };
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.75,
    metadata: {
      source: 'thinking-sounds',
      personaId,
      contextMatch: [category],
    },
  };
}

/**
 * Select a backchannel based on context
 */
export async function selectBackchannel(
  personaId: string,
  context: BehaviorSelectionContext
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.backchannels) {
    return null;
  }

  // Determine which category based on context
  let category: keyof BackchannelsSchema;
  if (context.emotional.isVulnerable || context.content.isComforting) {
    category = 'empathetic';
  } else if (context.content.isCelebration) {
    category = 'encouraging';
  } else if (context.content.isQuestion) {
    category = 'curious';
  } else {
    category = 'short';
  }

  const phrases = profile.backchannels[category];
  if (!Array.isArray(phrases)) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.7,
    metadata: {
      source: 'backchannels',
      personaId,
      contextMatch: [category],
    },
  };
}

/**
 * Determine injection position based on category
 */
function getPositionForCategory(category: ImperfectionCategory): 'prefix' | 'suffix' | 'inline' {
  switch (category) {
    case 'trailing_off':
      return 'suffix';
    case 'excitement_overflow':
    case 'celebration_overflow':
    case 'celebration_warmth':
      return 'inline';
    case 'self_corrections':
    case 'restarts':
    case 'natural_restarts':
      return 'inline';
    case 'thinking_aloud':
    case 'contemplative_sounds':
    case 'genuine_processing':
    case 'efficient_processing':
    case 'grandfatherly_processing':
      return 'prefix';
    case 'filler_sounds':
      return 'prefix';
    case 'empathy_sounds':
    case 'grounding_sounds':
    case 'overwhelm_support':
    case 'vocal_vulnerability':
      return 'prefix';
    case 'wisdom_building':
    case 'gentle_laughter':
    case 'presence_sounds':
      return 'prefix';
    case 'research_precision':
    case 'elderly_warmth':
    case 'concern_sounds':
    case 'warm_processing':
      return 'prefix';
    default:
      return 'prefix';
  }
}

// =============================================================================
// INJECTION CONFIG
// =============================================================================

/**
 * Get injection config for a persona
 */
export function getInjectionConfig(personaId: string): InjectionConfig {
  // Import inline to avoid circular deps
  const INJECTION_CONFIGS: Record<string, InjectionConfig> = {
    high_energy: {
      baseProbability: 0.25,
      turnMultiplier: 0.05,
      maxBehaviorsPerResponse: 2,
      minCharsBetweenInjections: 50,
      preferredCategories: ['excitement_overflow', 'restarts', 'natural_restarts', 'thinking_aloud', 'vocal_vulnerability'],
      avoidCategories: [],
    },
    warm: {
      baseProbability: 0.2,
      turnMultiplier: 0.04,
      maxBehaviorsPerResponse: 2,
      minCharsBetweenInjections: 60,
      preferredCategories: ['empathy_sounds', 'genuine_processing', 'celebration_overflow', 'vocal_vulnerability', 'natural_restarts', 'warm_processing', 'celebration_warmth'],
      avoidCategories: [],
    },
    efficient: {
      baseProbability: 0.15,
      turnMultiplier: 0.03,
      maxBehaviorsPerResponse: 1,
      minCharsBetweenInjections: 80,
      preferredCategories: ['efficient_processing', 'grounding_sounds', 'natural_restarts', 'vocal_vulnerability'],
      avoidCategories: ['excitement_overflow', 'celebration_overflow'],
    },
    contemplative: {
      baseProbability: 0.2,
      turnMultiplier: 0.02,
      maxBehaviorsPerResponse: 2,
      minCharsBetweenInjections: 100,
      preferredCategories: ['contemplative_sounds', 'wisdom_building', 'presence_sounds', 'vocal_vulnerability', 'natural_restarts'],
      avoidCategories: ['excitement_overflow', 'restarts'],
    },
    analytical: {
      baseProbability: 0.15,
      turnMultiplier: 0.03,
      maxBehaviorsPerResponse: 1,
      minCharsBetweenInjections: 70,
      preferredCategories: ['thinking_aloud', 'self_corrections', 'grandfatherly_processing', 'vocal_vulnerability', 'natural_restarts', 'research_precision', 'elderly_warmth'],
      avoidCategories: ['excitement_overflow', 'empathy_sounds'],
    },
  };

  const PERSONA_INJECTION_STYLE: Record<string, string> = {
    ferni: 'warm',
    'maya-santos': 'warm',
    'jordan-taylor': 'high_energy',
    'alex-chen': 'efficient',
    'nayan-patel': 'contemplative',
    'peter-john': 'analytical',
  };

  const style = PERSONA_INJECTION_STYLE[personaId] || 'warm';
  return INJECTION_CONFIGS[style] || INJECTION_CONFIGS.warm;
}

// =============================================================================
// PRELOADING
// =============================================================================

/**
 * Preload speech profiles for all known personas
 */
export async function preloadAllSpeechProfiles(): Promise<void> {
  const personas = ['ferni', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel', 'peter-john'];

  await Promise.all(personas.map(p => loadSpeechProfile(p)));

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

/**
 * Select a thinking sound synchronously (uses cached profile)
 */
export function selectThinkingSoundSync(
  personaId: string,
  context: BehaviorSelectionContext
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);
  if (!profile?.thinkingSounds) {
    return null;
  }

  // Determine which category based on context
  let category: keyof ThinkingSoundsSchema;
  if (context.emotional.isVulnerable || context.content.isComforting) {
    category = 'empathy';
  } else if (context.content.isQuestion) {
    category = 'considering';
  } else if (context.emotional.agentTone === 'curious') {
    category = 'uncertainty';
  } else {
    category = 'processing';
  }

  const phrases = profile.thinkingSounds[category];
  if (!Array.isArray(phrases)) {
    // Fallback to general thinking
    const fallback = profile.thinkingSounds.thinking;
    if (!Array.isArray(fallback)) return null;

    const phrase = getRandomPhrase(fallback, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'thinking',
      position: 'prefix',
      confidence: 0.6,
      metadata: {
        source: 'thinking-sounds',
        personaId,
        contextMatch: ['fallback'],
      },
    };
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.75,
    metadata: {
      source: 'thinking-sounds',
      personaId,
      contextMatch: [category],
    },
  };
}

/**
 * Select an imperfection synchronously (uses cached profile)
 */
export function selectImperfectionSync(
  personaId: string,
  category: ImperfectionCategory,
  context: BehaviorSelectionContext
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);
  if (!profile?.imperfections) {
    return null;
  }

  // Get phrases for the category
  const phrases = profile.imperfections[category as keyof SpeechImperfectionsSchema];
  if (!Array.isArray(phrases)) {
    return null;
  }

  // Check context match
  const { matches, boost } = matchesContext(profile.imperfections.usage_rules, context);
  if (!matches) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) {
    return null;
  }

  return {
    phrase,
    category,
    position: getPositionForCategory(category),
    confidence: 0.7 + boost,
    metadata: {
      source: 'speech-imperfections',
      personaId,
      contextMatch: [],
    },
  };
}

// =============================================================================
// BREATH SOUND SELECTION
// =============================================================================

/**
 * Breath sound categories mapped to context
 */
type BreathCategory =
  | 'contemplative_breath'
  | 'before_something_hard'
  | 'after_user_shares'
  | 'holding_space'
  | 'grounding'
  | 'gentle_sigh'
  | 'encouraging_breath'
  | 'before_celebration'
  | 'empathetic_sigh'
  | 'meditative_breath'
  | 'before_wisdom'
  | 'excited_breath'
  | 'celebration_build'
  | 'grounding_breath'
  | 'overwhelm_support'
  | 'wisdom_breath'
  | 'before_important_point';

/**
 * Select a breath sound based on context (async)
 */
export async function selectBreathSound(
  personaId: string,
  context: BehaviorSelectionContext
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.breathSounds) {
    return null;
  }

  // Check usage rules
  const { matches, boost } = matchesContext(profile.breathSounds.usage_rules, context);
  if (!matches) {
    return null;
  }

  // Determine breath category based on context
  const category = selectBreathCategory(personaId, context);
  const phrases = profile.breathSounds[category as keyof BreathSoundsSchema];
  if (!Array.isArray(phrases)) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.65 + boost,
    metadata: {
      source: 'breath-sounds',
      personaId,
      contextMatch: [category],
    },
  };
}

/**
 * Select a breath sound synchronously (uses cached profile)
 */
export function selectBreathSoundSync(
  personaId: string,
  context: BehaviorSelectionContext
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);
  if (!profile?.breathSounds) {
    return null;
  }

  // Check usage rules
  const { matches, boost } = matchesContext(profile.breathSounds.usage_rules, context);
  if (!matches) {
    return null;
  }

  // Determine breath category based on context
  const category = selectBreathCategory(personaId, context);
  const phrases = profile.breathSounds[category as keyof BreathSoundsSchema];
  if (!Array.isArray(phrases)) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.65 + boost,
    metadata: {
      source: 'breath-sounds',
      personaId,
      contextMatch: [category],
    },
  };
}

// =============================================================================
// LAUGHTER CONTAGION SELECTION
// =============================================================================

/**
 * Select a laughter response when user laughs
 */
export async function selectLaughterResponse(
  personaId: string,
  context: BehaviorSelectionContext & { userLaughed?: boolean }
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.laughterContagion) {
    return null;
  }

  const { contagious_laughter, laugh_with_phrases, usage_rules } = profile.laughterContagion;

  // Check if we should laugh
  if (context.userLaughed) {
    const shouldLaugh = Math.random() < contagious_laughter.when_user_laughs.probability;
    if (!shouldLaugh) return null;

    // Choose soft or full join based on energy
    const isHighEnergy = context.emotional.energyLevel === 'high' || context.content.isCelebration;
    const laughOptions = isHighEnergy
      ? contagious_laughter.when_user_laughs.full_join
      : contagious_laughter.when_user_laughs.soft_join;

    const phrase = getRandomPhrase(laughOptions, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'contagious_laughter',
      position: 'prefix',
      confidence: 0.8,
      metadata: {
        source: 'backchannels',
        personaId,
        contextMatch: ['user_laughed'],
      },
    };
  }

  // Select a laugh-with phrase if celebration context
  if (context.content.isCelebration && Math.random() < 0.3) {
    const phrase = getRandomPhrase(laugh_with_phrases, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'laugh_with',
      position: 'prefix',
      confidence: 0.7,
      metadata: {
        source: 'backchannels',
        personaId,
        contextMatch: ['celebration'],
      },
    };
  }

  return null;
}

/**
 * Select a laughter response synchronously
 */
export function selectLaughterResponseSync(
  personaId: string,
  context: BehaviorSelectionContext & { userLaughed?: boolean }
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.laughterContagion) {
    return null;
  }

  const { contagious_laughter, laugh_with_phrases } = profile.laughterContagion;

  if (context.userLaughed) {
    const shouldLaugh = Math.random() < contagious_laughter.when_user_laughs.probability;
    if (!shouldLaugh) return null;

    const isHighEnergy = context.emotional.energyLevel === 'high' || context.content.isCelebration;
    const laughOptions = isHighEnergy
      ? contagious_laughter.when_user_laughs.full_join
      : contagious_laughter.when_user_laughs.soft_join;

    const phrase = getRandomPhrase(laughOptions, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'contagious_laughter',
      position: 'prefix',
      confidence: 0.8,
      metadata: {
        source: 'backchannels',
        personaId,
        contextMatch: ['user_laughed'],
      },
    };
  }

  if (context.content.isCelebration && Math.random() < 0.3) {
    const phrase = getRandomPhrase(laugh_with_phrases, context.randomSeed);
    if (phrase) {
      return {
        phrase,
        category: 'laugh_with',
        position: 'prefix',
        confidence: 0.7,
        metadata: {
          source: 'backchannels',
          personaId,
          contextMatch: ['celebration'],
        },
      };
    }
  }

  return null;
}

// =============================================================================
// LATE NIGHT PACING
// =============================================================================

/**
 * Check if it's late night hours
 */
export function isLateNightHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 5;
}

/**
 * Get late night pacing adjustments for a persona
 */
export function getLateNightPacing(personaId: string): {
  speedMultiplier: number;
  pauseMultiplier: number;
  energyReduction: number;
} | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.lateNightPresence || !isLateNightHours()) {
    return null;
  }

  const { pacing_adjustment } = profile.lateNightPresence;
  return {
    speedMultiplier: 1 - (pacing_adjustment.energy_reduction || 0.2),
    pauseMultiplier: pacing_adjustment.pause_multiplier || 1.3,
    energyReduction: pacing_adjustment.energy_reduction || 0.2,
  };
}

/**
 * Get a late night greeting for a persona
 */
export function getLateNightGreeting(personaId: string, seed?: string): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.lateNightPresence || !isLateNightHours()) {
    return null;
  }

  return getRandomPhrase(profile.lateNightPresence.late_night_greetings, seed);
}

// =============================================================================
// ENERGY MATCHING
// =============================================================================

export type EnergyLevel = 'very_low' | 'low' | 'neutral' | 'elevated' | 'high';

/**
 * Get energy-matched pacing adjustments
 */
export function getEnergyMatchedPacing(
  personaId: string,
  userEnergyLevel: EnergyLevel
): {
  speedMultiplier: number;
  pauseMultiplier: number;
  energyReduction: number;
  phrase: string | null;
} | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.energyMatching) {
    return null;
  }

  const levelConfig = profile.energyMatching.energy_levels[userEnergyLevel];
  if (!levelConfig) {
    return null;
  }

  return {
    speedMultiplier: levelConfig.pacing.speed_multiplier,
    pauseMultiplier: levelConfig.pacing.pause_multiplier,
    energyReduction: levelConfig.pacing.energy_reduction,
    phrase: getRandomPhrase(levelConfig.phrases),
  };
}

// =============================================================================
// CALLBACKS SELECTION
// =============================================================================

/**
 * Check if a callback phrase should be used based on conversation history
 */
export function shouldUseCallback(
  personaId: string,
  callbackId: string,
  conversationCount: number
): { shouldUse: boolean; phrase: string | null } {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.callbacks) {
    return { shouldUse: false, phrase: null };
  }

  const callback = profile.callbacks.callbacks.find(c => c.id === callbackId);
  if (!callback) {
    return { shouldUse: false, phrase: null };
  }

  // Check if we've had enough conversations
  if (conversationCount < callback.callbacks.minConversationsForCallback) {
    // Use first-time phrase
    const phrase = getRandomPhrase(callback.firstUse.variations);
    return { shouldUse: true, phrase };
  }

  // Probability check for callback
  if (Math.random() < callback.callbacks.probability) {
    const phrase = getRandomPhrase(callback.callbacks.variations);
    return { shouldUse: true, phrase };
  }

  return { shouldUse: false, phrase: null };
}

// =============================================================================
// BREATH SOUND SELECTION
// =============================================================================

/**
 * Select appropriate breath category based on persona and context
 */
function selectBreathCategory(personaId: string, context: BehaviorSelectionContext): BreathCategory {
  const { emotional, content } = context;

  // Persona-specific category selection
  switch (personaId) {
    case 'ferni':
      if (emotional.isVulnerable) return 'holding_space';
      if (content.isComforting) return 'after_user_shares';
      if (emotional.isLateNight) return 'grounding';
      return 'contemplative_breath';

    case 'maya-santos':
      if (content.isCelebration) return 'before_celebration';
      if (emotional.isVulnerable) return 'empathetic_sigh';
      if (content.isComforting) return 'grounding';
      return 'encouraging_breath';

    case 'nayan-patel':
      if (emotional.isVulnerable) return 'holding_space';
      if (emotional.isLateNight) return 'meditative_breath';
      return 'before_wisdom';

    case 'jordan-taylor':
      if (content.isCelebration) return 'celebration_build';
      if (emotional.isVulnerable) return 'grounding';
      return 'excited_breath';

    case 'alex-chen':
      if (emotional.userEmotion === 'distressed' || emotional.userEmotion === 'anxious') {
        return 'overwhelm_support';
      }
      return 'grounding_breath';

    case 'peter-john':
      if (emotional.isVulnerable) return 'grounding';
      return 'before_important_point';

    default:
      return 'contemplative_breath';
  }
}

// =============================================================================
// CELEBRATION SELECTION
// =============================================================================

/**
 * Celebration intensity levels
 */
export type CelebrationIntensity = 'small' | 'big' | 'growth' | 'effort' | 'quiet' | 'courage' | 'consistency';

/**
 * Detect what type of celebration is appropriate
 */
export function detectCelebrationIntensity(userText: string): CelebrationIntensity | null {
  const lowerText = userText.toLowerCase();

  // Big milestones
  if (/\b(promoted|graduated|married|engaged|hired|closed|launched|published)\b/i.test(lowerText)) {
    return 'big';
  }

  // Courage moments
  if (/\b(finally|first time|scared|nervous|hard conversation|set a boundary)\b/i.test(lowerText)) {
    return 'courage';
  }

  // Consistency
  if (/\d+\s*(days?|weeks?)\s*(straight|in a row|streak)/i.test(lowerText)) {
    return 'consistency';
  }

  // Growth acknowledgment
  if (/\b(changed|different|grown|used to|before I|now I)\b/i.test(lowerText)) {
    return 'growth';
  }

  // Effort over outcome
  if (/\b(tried|attempted|didn't work|failed but)\b/i.test(lowerText)) {
    return 'effort';
  }

  // Small wins
  if (/\b(managed to|even though|didn't want to|pushed myself)\b/i.test(lowerText)) {
    return 'small';
  }

  // Default to quiet if nothing specific detected
  return null;
}

/**
 * Select a celebration phrase based on intensity
 */
export function selectCelebration(
  personaId: string,
  intensity: CelebrationIntensity,
  seed?: string
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.celebrations) {
    return null;
  }

  const celebrations = profile.celebrations;
  let phrases: string[] = [];

  switch (intensity) {
    case 'small':
      phrases = celebrations.small_wins || [];
      break;
    case 'big':
      phrases = celebrations.big_milestones || [];
      break;
    case 'growth':
      phrases = celebrations.growth_acknowledgment || [];
      break;
    case 'effort':
      phrases = celebrations.effort_over_outcome || [];
      break;
    case 'quiet':
      phrases = celebrations.quiet_celebrations || [];
      break;
    case 'courage':
      phrases = celebrations.celebrating_courage || [];
      break;
    case 'consistency':
      phrases = celebrations.celebrating_consistency || [];
      break;
  }

  const phrase = getRandomPhrase(phrases, seed);
  if (!phrase) return null;

  return {
    phrase,
    category: `celebration_${intensity}`,
    position: 'prefix',
    confidence: 0.85,
    metadata: {
      source: 'breath-sounds', // Using breath-sounds as the closest category
      personaId,
      contextMatch: [intensity],
    },
  };
}

/**
 * Sync version of celebration selection
 */
export function selectCelebrationSync(
  personaId: string,
  context: BehaviorSelectionContext
): SelectedBehavior | null {
  if (!context.userText) return null;

  const intensity = detectCelebrationIntensity(context.userText);
  if (!intensity) return null;

  // Check probability (40% base, increases with intensity)
  const baseProbability = intensity === 'big' || intensity === 'courage' ? 0.6 : 0.4;
  if (Math.random() > baseProbability) return null;

  return selectCelebration(personaId, intensity, context.randomSeed);
}

// =============================================================================
// CATCHPHRASE SELECTION
// =============================================================================

/**
 * Catchphrase trigger patterns
 * Maps trigger keywords to regex patterns for detection
 */
export const CATCHPHRASE_TRIGGERS: Record<string, RegExp[]> = {
  // Ferni's "cracks/gold" - kintsugi moments
  failure: [
    /\b(failed|failure|fell apart|broke|broken|messed up|screwed up)\b/i,
    /\b(wasn't good enough|let.*down|disappointed)\b/i,
  ],
  vulnerability: [
    /\b(vulnerable|scared|afraid|weak|don't know what to do)\b/i,
    /\b(hard to admit|never told|first time saying)\b/i,
  ],
  // Ferni's "net worth" - money vs self-worth
  money_comparison: [
    /\b(not.*successful|behind|peers|net worth|making.*less)\b/i,
    /\b(comparing|feel like a failure|not enough)\b/i,
  ],
  // Ferni's "second chances"
  redemption: [
    /\b(second chance|start over|try again|fresh start|new beginning)\b/i,
    /\b(forgive|forgiveness|redemption|another shot)\b/i,
  ],
};

/**
 * Select a signature catchphrase based on context
 * RARE - should only fire on perfect trigger moments
 */
export function selectCatchphrase(
  personaId: string,
  userText: string,
  conversationCount: number,
  usedThisSession = new Set<string>()
): { phrase: string; delivery: string; id: string } | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.catchphrases) {
    return null;
  }

  const { core_signature, secondary_signatures } = profile.catchphrases;
  const lowerText = userText.toLowerCase();

  // Check for core signature triggers (VERY rare - once per 3-4 conversations)
  if (core_signature && conversationCount % 4 === 0 && !usedThisSession.has('core')) {
    for (const triggerKey of core_signature.triggers) {
      const patterns = CATCHPHRASE_TRIGGERS[triggerKey] || [new RegExp(triggerKey, 'i')];
      for (const pattern of patterns) {
        if (pattern.test(lowerText)) {
          // 30% chance even when triggered (keeps it rare)
          if (Math.random() < 0.3) {
            return {
              phrase: core_signature.phrase,
              delivery: core_signature.delivery,
              id: 'core',
            };
          }
        }
      }
    }
  }

  // Check secondary signatures (once per conversation max)
  if (secondary_signatures?.phrases) {
    for (const sig of secondary_signatures.phrases) {
      if (usedThisSession.has(sig.phrase)) continue;

      for (const triggerKey of sig.triggers) {
        const patterns = CATCHPHRASE_TRIGGERS[triggerKey] || [new RegExp(triggerKey, 'i')];
        for (const pattern of patterns) {
          if (pattern.test(lowerText)) {
            // 25% chance
            if (Math.random() < 0.25) {
              return {
                phrase: sig.phrase,
                delivery: sig.delivery,
                id: sig.phrase,
              };
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Get a powerful question from the persona (more freely used)
 */
export function getPowerfulQuestion(personaId: string, seed?: string): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.catchphrases?.powerful_questions?.deep_questions) {
    return null;
  }

  return getRandomPhrase(profile.catchphrases.powerful_questions.deep_questions, seed);
}

/**
 * Get a partnership phrase from the persona
 */
export function getPartnershipPhrase(personaId: string, seed?: string): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.catchphrases?.partnership_phrases?.phrases) {
    return null;
  }

  return getRandomPhrase(profile.catchphrases.partnership_phrases.phrases, seed);
}

// =============================================================================
// ANTICIPATION SELECTION
// =============================================================================

export type AnticipationType =
  | 'opening_warmth'
  | 'between_sessions'
  | 'returning_after_time'
  | 'topic_callback'
  | 'future_looking'
  | 'growth_reference'
  | 'journey_acknowledgment';

/**
 * Get an opening anticipation phrase for a returning user
 */
export function getSessionOpeningPhrase(
  personaId: string,
  context: {
    daysSinceLastSession?: number;
    isFirstSession?: boolean;
  } = {},
  seed?: string
): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation || context.isFirstSession) {
    return null;
  }

  const { session_anticipation, usage_rules } = profile.anticipation;

  // Check probability
  const probability = usage_rules?.opening_anticipation_probability ?? 0.4;
  if (Math.random() > probability) {
    return null;
  }

  // Select category based on context
  if (context.daysSinceLastSession && context.daysSinceLastSession > 3) {
    return getRandomPhrase(session_anticipation.returning_after_time, seed);
  }

  return getRandomPhrase(session_anticipation.opening_warmth, seed);
}

/**
 * Get a topic callback phrase with {topic} placeholder
 */
export function getTopicCallbackPhrase(personaId: string, seed?: string): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation?.looking_forward_to_topic) {
    return null;
  }

  const probability = profile.anticipation.usage_rules?.topic_callback_probability ?? 0.35;
  if (Math.random() > probability) {
    return null;
  }

  return getRandomPhrase(profile.anticipation.looking_forward_to_topic, seed);
}

/**
 * Get a future-looking phrase (curiosity, seeds, or hope)
 */
export function getFutureLookingPhrase(
  personaId: string,
  type: 'curiosity' | 'seeds' | 'hope' = 'curiosity',
  seed?: string
): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation?.future_looking) {
    return null;
  }

  const probability = profile.anticipation.usage_rules?.future_looking_probability ?? 0.3;
  if (Math.random() > probability) {
    return null;
  }

  const { future_looking } = profile.anticipation;

  switch (type) {
    case 'seeds':
      return getRandomPhrase(future_looking.planting_seeds, seed);
    case 'hope':
      return getRandomPhrase(future_looking.expressing_hope, seed);
    default:
      return getRandomPhrase(future_looking.curiosity_about_outcome, seed);
  }
}

/**
 * Get a continuity marker phrase (growth reference or journey acknowledgment)
 */
export function getContinuityMarker(
  personaId: string,
  type: 'growth' | 'journey' = 'growth',
  seed?: string
): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation?.continuity_markers) {
    return null;
  }

  const { continuity_markers } = profile.anticipation;

  switch (type) {
    case 'journey':
      return getRandomPhrase(continuity_markers.acknowledging_journey, seed);
    default:
      return getRandomPhrase(continuity_markers.referencing_growth, seed);
  }
}

/**
 * Get a pending item follow-up phrase with placeholder
 */
export function getPendingItemPhrase(
  personaId: string,
  type: 'goal' | 'person' | 'decision' = 'goal',
  seed?: string
): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation?.pending_items) {
    return null;
  }

  const { pending_items } = profile.anticipation;

  switch (type) {
    case 'person':
      return getRandomPhrase(pending_items.person_mentioned, seed);
    case 'decision':
      return getRandomPhrase(pending_items.decision_pending, seed);
    default:
      return getRandomPhrase(pending_items.goal_tracking, seed);
  }
}

