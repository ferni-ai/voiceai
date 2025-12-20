/**
 * Persona Speech Traits Loader
 *
 * Dynamically loads and applies persona-specific speech traits.
 * This bridges the persona bundles with the alive-voice SSML pipeline.
 *
 * Each persona has unique speech patterns:
 * - **Peter John (Jack Bogle)**: Grandfatherly warmth, financial wisdom, elderly pauses
 * - **Maya Santos**: Habit vocabulary, encouragement warmth, practical wisdom
 * - **Alex Chen**: Efficiency emphasis, clear instructions, hidden warmth
 * - **Jordan Taylor**: Life arc language, celebration energy, forward-looking
 * - **Nayan Patel**: Philosophical vocabulary, profound pauses, paradoxes
 *
 * @module speech/adaptive-ssml/persona-speech-traits-loader
 */

import { getLogger } from '../../utils/safe-logger.js';

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

/**
 * Load speech traits for a persona.
 * Uses dynamic import to avoid circular dependencies and bundle all traits.
 */
async function loadPersonaTraits(personaId: string): Promise<PersonaSpeechTraitConfig | null> {
  // Check cache first
  if (traitRegistry.has(personaId)) {
    return traitRegistry.get(personaId)!;
  }

  try {
    let config: PersonaSpeechTraitConfig | null = null;

    switch (personaId) {
      case 'ferni': {
        const module = await import('../../personas/bundles/ferni/speech-traits.js');
        config = {
          baseSpeed: module.FERNI_SPEECH_CONFIG.baseSpeed,
          apply: module.applyFerniSpeechTraits,
        };
        break;
      }
      case 'peter-john': {
        const module = await import('../../personas/bundles/peter-john/speech-traits.js');
        config = {
          baseSpeed: module.PETER_JOHN_SPEECH_CONFIG.baseSpeed,
          apply: module.applyPeterJohnSpeechTraits,
        };
        break;
      }
      case 'maya-santos': {
        const module = await import('../../personas/bundles/maya-santos/speech-traits.js');
        config = {
          baseSpeed: module.MAYA_SANTOS_SPEECH_CONFIG.baseSpeed,
          apply: module.applyMayaSantosSpeechTraits,
        };
        break;
      }
      case 'alex-chen': {
        const module = await import('../../personas/bundles/alex-chen/speech-traits.js');
        config = {
          baseSpeed: module.ALEX_CHEN_SPEECH_CONFIG.baseSpeed,
          apply: module.applyAlexChenSpeechTraits,
        };
        break;
      }
      case 'jordan-taylor': {
        const module = await import('../../personas/bundles/jordan-taylor/speech-traits.js');
        config = {
          baseSpeed: module.JORDAN_TAYLOR_SPEECH_CONFIG.baseSpeed,
          apply: module.applyJordanTaylorSpeechTraits,
        };
        break;
      }
      case 'nayan-patel': {
        const module = await import('../../personas/bundles/nayan-patel/speech-traits.js');
        config = {
          baseSpeed: module.NAYAN_PATEL_SPEECH_CONFIG.baseSpeed,
          apply: module.applyNayanPatelSpeechTraits,
        };
        break;
      }
      default:
        // Unknown persona - no custom traits
        return null;
    }

    if (config) {
      traitRegistry.set(personaId, config);
      log.debug({ personaId }, 'Loaded persona speech traits');
    }

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
 */
export async function preloadAllTraits(): Promise<void> {
  if (preloaded) return;

  const personas = ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel'];

  await Promise.all(personas.map((id) => loadPersonaTraits(id)));

  preloaded = true;
  log.info({ count: traitRegistry.size }, 'Preloaded persona speech traits');
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
 * Apply persona speech traits to text (async).
 *
 * @param text - Text to process
 * @param personaId - Persona ID
 * @param context - Speech context
 * @returns Enhanced text with persona speech patterns
 */
export async function applyPersonaSpeechTraits(
  text: string,
  personaId: string,
  context: Partial<SpeechTraitContext> = {}
): Promise<string> {
  const config = await loadPersonaTraits(personaId);

  if (!config) {
    return text;
  }

  const { emotion = 'neutral', baseSpeed = config.baseSpeed, laughterCount = 0 } = context;

  try {
    const result = config.apply(text, emotion, baseSpeed, laughterCount);
    log.debug(
      { personaId, originalLength: text.length, resultLength: result.length },
      'Applied persona speech traits'
    );
    return result;
  } catch (error) {
    log.error({ personaId, error }, 'Error applying persona speech traits');
    return text;
  }
}

/**
 * Apply persona speech traits synchronously (requires preload).
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

  if (!config) {
    // Not preloaded or not found - return original
    return text;
  }

  const { emotion = 'neutral', baseSpeed = config.baseSpeed, laughterCount = 0 } = context;

  try {
    return config.apply(text, emotion, baseSpeed, laughterCount);
  } catch (error) {
    log.error({ personaId, error }, 'Error applying persona speech traits');
    return text;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a persona has custom speech traits.
 */
export function hasCustomSpeechTraits(personaId: string): boolean {
  const withTraits = ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel'];
  return withTraits.includes(personaId);
}

/**
 * Get list of personas with custom speech traits.
 */
export function getPersonasWithSpeechTraits(): string[] {
  return ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel'];
}

/**
 * Clear the trait registry (for testing).
 */
export function clearTraitRegistry(): void {
  traitRegistry.clear();
  preloaded = false;
}
