/**
 * Persona Speech Traits Loader
 *
 * Dynamically loads and applies persona-specific speech traits.
 * This bridges the persona bundles with the alive-voice SSML pipeline.
 *
 * ## Architecture
 *
 * Two complementary systems work together:
 * 1. **Hardcoded Traits** (speech-traits.ts): Regex-based SSML injection for key phrases
 * 2. **JSON Behaviors** (speech-imperfections.json): Probabilistic human behaviors
 *
 * The JSON system provides "Better Than Human" naturalness by injecting:
 * - Speech imperfections (trailing off, self-corrections)
 * - Thinking sounds (hmm, processing)
 * - Backchannels (mm-hmm, I see)
 *
 * Each persona has unique speech patterns:
 * - **Peter John**: Curious, quick, pattern-spotting research voice
 * - **Maya Santos**: Habit vocabulary, encouragement warmth, practical wisdom
 * - **Alex Chen**: Efficiency emphasis, clear instructions, hidden warmth
 * - **Jordan Taylor**: Life arc language, celebration energy, forward-looking
 * - **Nayan Patel**: Philosophical vocabulary, profound pauses, paradoxes
 *
 * @module speech/adaptive-ssml/persona-speech-traits-loader
 */

// Type-only, through the personas context's public index (architecture gate).
import type { CanonicalPersonaId } from '../../personas/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { quickHumanizeSync, preloadAllSpeechProfiles } from '../humanization/index.js';

const log = getLogger().child({ module: 'PersonaSpeechTraits' });

// =============================================================================
// TYPES
// =============================================================================

/**
 * Context for applying speech traits
 */
export interface SpeechTraitContext {
  /** Detected emotion in the text */
  emotion: string;
  /** Base speech speed */
  baseSpeed: number;
  /** Count of laughter in text */
  laughterCount: number;
  /** Turn number (behaviors more likely after rapport built) */
  turnNumber?: number;
  /** Random seed for deterministic testing */
  randomSeed?: string;
  /** User's original message (for callback detection) */
  userText?: string;
  /** Total conversation count with this user */
  conversationCount?: number;
}

/**
 * Function signature for persona speech trait processors
 */
export type SpeechTraitProcessor = (
  text: string,
  emotion: string,
  baseSpeed: number,
  laughterCount: number
) => string;

/**
 * Speech trait configuration for a persona
 */
export interface PersonaSpeechTraitConfig {
  /** Base speech speed */
  baseSpeed: number;
  /** Main processor function */
  apply: SpeechTraitProcessor;
}

// =============================================================================
// PERSONA TRAIT REGISTRY
// =============================================================================

/**
 * Registry of loaded persona speech traits.
 * Lazily loaded on first access to avoid circular imports.
 */
const traitRegistry = new Map<string, PersonaSpeechTraitConfig>();

/** The pacing data the financial legends' bundles carry (words per minute, pauses, slow phrases). */
interface PacingTraits {
  baseRate: number;
  pauses: { micro: number };
  emphasis: { slowPhrases: readonly string[] };
  storytellingMode: { rateMultiplier: number };
}

/** Conversational pace the speed ratio is measured against. */
const CONVERSATIONAL_WPM = 150;

/**
 * Turn a legend's pacing data into a processor: their pace as the base speed, and
 * their signature phrases ("stay the course") slowed and set off by a short pause.
 */
export function pacingTraitsToConfig(traits: PacingTraits): PersonaSpeechTraitConfig {
  const baseSpeed = Math.round((traits.baseRate / CONVERSATIONAL_WPM) * 100) / 100;
  const slow = Math.round(baseSpeed * traits.storytellingMode.rateMultiplier * 100) / 100;
  const phrases = traits.emphasis.slowPhrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${phrases.join('|')})\\b`, 'gi');
  return {
    baseSpeed,
    apply: (text) =>
      text.replace(
        pattern,
        (m) =>
          `<break time="${traits.pauses.micro}ms"/><speed ratio="${slow}"/>${m}<speed ratio="${baseSpeed}"/>`
      ),
  };
}

/**
 * One loader per canonical persona. Keyed by CanonicalPersonaId so the compiler
 * refuses a persona without speech traits (the john-bogle and peter-lynch legends had none).
 */
const TRAIT_LOADERS: Record<CanonicalPersonaId, () => Promise<PersonaSpeechTraitConfig>> = {
  ferni: async () => {
    const m = await import('../../personas/bundles/ferni/speech-traits.js');
    return { baseSpeed: m.FERNI_SPEECH_CONFIG.baseSpeed, apply: m.applyFerniSpeechTraits };
  },
  'peter-john': async () => {
    const m = await import('../../personas/bundles/peter-john/speech-traits.js');
    return { baseSpeed: m.PETER_JOHN_SPEECH_CONFIG.baseSpeed, apply: m.applyPeterJohnSpeechTraits };
  },
  'maya-santos': async () => {
    const m = await import('../../personas/bundles/maya-santos/speech-traits.js');
    return {
      baseSpeed: m.MAYA_SANTOS_SPEECH_CONFIG.baseSpeed,
      apply: m.applyMayaSantosSpeechTraits,
    };
  },
  'alex-chen': async () => {
    const m = await import('../../personas/bundles/alex-chen/speech-traits.js');
    return { baseSpeed: m.ALEX_CHEN_SPEECH_CONFIG.baseSpeed, apply: m.applyAlexChenSpeechTraits };
  },
  'jordan-taylor': async () => {
    const m = await import('../../personas/bundles/jordan-taylor/speech-traits.js');
    return {
      baseSpeed: m.JORDAN_TAYLOR_SPEECH_CONFIG.baseSpeed,
      apply: m.applyJordanTaylorSpeechTraits,
    };
  },
  'nayan-patel': async () => {
    const m = await import('../../personas/bundles/nayan-patel/speech-traits.js');
    return {
      baseSpeed: m.NAYAN_PATEL_SPEECH_CONFIG.baseSpeed,
      apply: m.applyNayanPatelSpeechTraits,
    };
  },
  'joel-dickson': async () => {
    const m = await import('../../personas/bundles/joel-dickson/speech-traits.js');
    return {
      baseSpeed: m.JOEL_DICKSON_SPEECH_CONFIG.baseSpeed,
      apply: m.applyJoelDicksonSpeechTraits,
    };
  },
  'john-bogle': async () =>
    pacingTraitsToConfig(
      (await import('../../personas/bundles/john-bogle/speech-traits.js')).johnBogleSpeechTraits
    ),
  'peter-lynch': async () =>
    pacingTraitsToConfig(
      (await import('../../personas/bundles/peter-lynch/speech-traits.js')).peterLynchSpeechTraits
    ),
};
const hasTraitLoader = (id: string): id is CanonicalPersonaId => Object.hasOwn(TRAIT_LOADERS, id);

/**
 * Load speech traits for a persona.
 * Uses dynamic import to avoid circular dependencies and bundle all traits.
 */
async function loadPersonaTraits(personaId: string): Promise<PersonaSpeechTraitConfig | null> {
  const cached = traitRegistry.get(personaId);
  if (cached) return cached;

  const loader = hasTraitLoader(personaId) ? TRAIT_LOADERS[personaId] : undefined;
  if (!loader) return null; // Unknown persona - no custom traits

  try {
    const config = await loader();
    traitRegistry.set(personaId, config);
    log.debug({ personaId }, 'Loaded persona speech traits');
    return config;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load persona speech traits');
    return null;
  }
}

// =============================================================================
// SYNCHRONOUS LOADER (Pre-loaded traits)
// =============================================================================

/**
 * Pre-loaded speech traits for synchronous access.
 * Call preloadAllTraits() at startup to enable sync access.
 */
let preloaded = false;

/**
 * Preload all persona speech traits for synchronous access.
 * Call this during application startup.
 *
 * This preloads BOTH:
 * - Layer 1: Hardcoded traits (speech-traits.ts)
 * - Layer 2: JSON behaviors (speech-imperfections.json, etc.)
 */
export async function preloadAllTraits(): Promise<void> {
  if (preloaded) return;

  const personas = Object.keys(TRAIT_LOADERS);

  // Preload both layers in parallel
  await Promise.all([
    // Layer 1: Hardcoded traits
    ...personas.map((id) => loadPersonaTraits(id)),
    // Layer 2: JSON behavior profiles
    preloadAllSpeechProfiles(),
  ]);

  preloaded = true;
  log.info({ count: traitRegistry.size }, 'Preloaded persona speech traits (both layers)');
}

/**
 * Get speech traits synchronously (requires preload).
 * Returns null if not preloaded or persona not found.
 */
export function getPersonaTraitsSync(personaId: string): PersonaSpeechTraitConfig | null {
  return traitRegistry.get(personaId) || null;
}

// =============================================================================
// MAIN APPLICATION FUNCTION
// =============================================================================

/**
 * Apply persona speech traits synchronously (requires preload).
 *
 * This function applies TWO layers of humanization (sync versions):
 * 1. Hardcoded traits (speech-traits.ts) - Regex-based SSML for key phrases
 * 2. JSON behaviors (speech-imperfections.json) - Probabilistic human behaviors
 *
 * IMPORTANT: Call preloadAllTraits() AND preloadAllSpeechProfiles() at startup.
 *
 * @param text - Text to process
 * @param personaId - Persona ID
 * @param context - Speech context
 * @returns Enhanced text with persona speech patterns
 */
export function applyPersonaSpeechTraitsSync(
  text: string,
  personaId: string,
  context: Partial<SpeechTraitContext> = {}
): string {
  const config = getPersonaTraitsSync(personaId);
  const { emotion = 'neutral', baseSpeed = config?.baseSpeed ?? 0.95, laughterCount = 0 } = context;

  let result = text;

  // LAYER 1: Hardcoded traits from speech-traits.ts (regex-based)
  if (config) {
    try {
      result = config.apply(result, emotion, baseSpeed, laughterCount);
      log.debug(
        { personaId, originalLength: text.length, resultLength: result.length },
        'Applied persona speech traits sync (layer 1: hardcoded)'
      );
    } catch (error) {
      log.error({ personaId, error }, 'Error applying persona speech traits sync');
      // Continue with original text
    }
  }

  // LAYER 2: JSON-based behaviors (probabilistic humanization) - SYNC VERSION
  // Uses cached profiles - requires preloadAllSpeechProfiles() at startup
  try {
    result = quickHumanizeSync(result, personaId, {
      emotion,
      isQuestion: result.includes('?'),
      isCelebration: /\b(congrat|amazing|proud|celebrate)\b/i.test(result),
      isComforting: /\b(sorry|understand|hard|tough)\b/i.test(result),
      turnNumber: context.turnNumber,
      randomSeed: context.randomSeed,
      // Pass user text for callback detection
      userText: context.userText,
      conversationCount: context.conversationCount,
    });
    log.debug({ personaId }, 'Applied persona speech traits sync (layer 2: JSON behaviors)');
  } catch (error) {
    log.warn(
      { personaId, error: String(error) },
      'JSON behavior sync humanization failed (non-blocking)'
    );
    // Continue with layer 1 result
  }

  return result;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a persona has custom speech traits.
 */
export function hasCustomSpeechTraits(personaId: string): boolean {
  return hasTraitLoader(personaId);
}

/**
 * Get list of personas with custom speech traits.
 */
export function getPersonasWithSpeechTraits(): string[] {
  return Object.keys(TRAIT_LOADERS);
}

/**
 * Clear the trait registry (for testing).
 */
export function clearTraitRegistry(): void {
  traitRegistry.clear();
  preloaded = false;
}
