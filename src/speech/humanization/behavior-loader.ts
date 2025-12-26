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
  ] = await Promise.all([
    loadBehaviorFile<SpeechImperfectionsSchema>(personaId, 'speech-imperfections.json'),
    loadBehaviorFile<ThinkingSoundsSchema>(personaId, 'thinking-sounds.json'),
    loadBehaviorFile<BackchannelsSchema>(personaId, 'backchannels.json'),
    loadBehaviorFile<BreathSoundsSchema>(personaId, 'breath-sounds.json'),
    loadBehaviorFile<LateNightPresenceSchema>(personaId, 'late-night-presence.json'),
    loadBehaviorFile<CallbacksSchema>(personaId, 'callbacks.json'),
    loadBehaviorFile<LaughterContagionSchema>(personaId, 'laughter-contagion.json'),
    loadBehaviorFile<EnergyMatchingSchema>(personaId, 'energy-matching.json'),
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

