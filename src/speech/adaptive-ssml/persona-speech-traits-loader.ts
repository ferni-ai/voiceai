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
 * - **Peter John (Jack Bogle)**: Grandfatherly warmth, financial wisdom, elderly pauses
 * - **Maya Santos**: Habit vocabulary, encouragement warmth, practical wisdom
 * - **Alex Chen**: Efficiency emphasis, clear instructions, hidden warmth
 * - **Jordan Taylor**: Life arc language, celebration energy, forward-looking
 * - **Nayan Patel**: Philosophical vocabulary, profound pauses, paradoxes
 *
 * @module speech/adaptive-ssml/persona-speech-traits-loader
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  humanizeSpeech,
  quickHumanizeSync,
  preloadAllSpeechProfiles,
  type BehaviorSelectionContext,
} from '../humanization/index.js';

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
      case 'joel-dickson': {
        const module = await import('../../personas/bundles/joel-dickson/speech-traits.js');
        config = {
          baseSpeed: module.JOEL_DICKSON_SPEECH_CONFIG.baseSpeed,
          apply: module.applyJoelDicksonSpeechTraits,
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
 *
 * This preloads BOTH:
 * - Layer 1: Hardcoded traits (speech-traits.ts)
 * - Layer 2: JSON behaviors (speech-imperfections.json, etc.)
 */
export async function preloadAllTraits(): Promise<void> {
  if (preloaded) return;

  const personas = [
    'ferni',
    'peter-john',
    'maya-santos',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
    'joel-dickson',
  ];

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
 * Apply persona speech traits to text (async).
 *
 * This function applies TWO layers of humanization:
 * 1. Hardcoded traits (speech-traits.ts) - Regex-based SSML for key phrases
 * 2. JSON behaviors (speech-imperfections.json) - Probabilistic human behaviors
 *
 * @param text - Text to process
 * @param personaId - Persona ID
 * @param context - Speech context (emotion, baseSpeed, turnNumber, etc.)
 * @returns Enhanced text with persona speech patterns
 */
export async function applyPersonaSpeechTraits(
  text: string,
  personaId: string,
  context: Partial<SpeechTraitContext> = {}
): Promise<string> {
  const config = await loadPersonaTraits(personaId);

  const { emotion = 'neutral', baseSpeed = config?.baseSpeed || 0.95, laughterCount = 0 } = context;
  let result = text;

  // LAYER 1: Hardcoded traits from speech-traits.ts (regex-based)
  if (config) {
    try {
      result = config.apply(result, emotion, baseSpeed, laughterCount);
      log.debug(
        { personaId, originalLength: text.length, resultLength: result.length },
        'Applied persona speech traits (layer 1: hardcoded)'
      );
    } catch (error) {
      log.error({ personaId, error }, 'Error applying persona speech traits');
      // Continue with original text
    }
  }

  // LAYER 2: JSON-based behaviors (probabilistic humanization)
  // This adds speech imperfections, thinking sounds, etc. from JSON files
  try {
    const behaviorContext: BehaviorSelectionContext = {
      personaId,
      emotional: {
        userEmotion: mapEmotionToUserEmotion(emotion),
        agentTone: mapEmotionToAgentTone(emotion),
        isVulnerable: emotion === 'sympathetic' || emotion === 'sad',
        isLateNight: isLateNight(),
      },
      content: {
        isQuestion: result.includes('?'),
        isCelebration: /\b(congrat|amazing|proud|celebrate)\b/i.test(result),
        isComforting: /\b(sorry|understand|hard|tough)\b/i.test(result),
      },
      turnNumber: context.turnNumber,
      randomSeed: context.randomSeed,
    };

    const humanized = await humanizeSpeech(result, behaviorContext);
    if (humanized.wasHumanized) {
      result = humanized.text;
      log.debug(
        { personaId, features: humanized.features },
        'Applied persona speech traits (layer 2: JSON behaviors)'
      );
    }
  } catch (error) {
    log.warn(
      { personaId, error: String(error) },
      'JSON behavior humanization failed (non-blocking)'
    );
    // Continue with layer 1 result
  }

  return result;
}

/**
 * Map emotion string to user emotion type
 */
function mapEmotionToUserEmotion(
  emotion: string
): 'distressed' | 'excited' | 'sad' | 'angry' | 'neutral' | 'reflective' | 'anxious' | undefined {
  switch (emotion.toLowerCase()) {
    case 'distressed':
    case 'stressed':
      return 'distressed';
    case 'excited':
    case 'happy':
    case 'enthusiastic':
      return 'excited';
    case 'sad':
    case 'sympathetic':
      return 'sad';
    case 'angry':
    case 'frustrated':
      return 'angry';
    case 'anxious':
    case 'worried':
      return 'anxious';
    case 'reflective':
    case 'thoughtful':
      return 'reflective';
    default:
      return 'neutral';
  }
}

/**
 * Map emotion string to agent tone
 */
function mapEmotionToAgentTone(
  emotion: string
): 'celebratory' | 'supportive' | 'curious' | 'serious' | 'playful' | 'grounding' | undefined {
  switch (emotion.toLowerCase()) {
    case 'excited':
    case 'happy':
    case 'enthusiastic':
      return 'celebratory';
    case 'sympathetic':
    case 'sad':
    case 'compassionate':
      return 'supportive';
    case 'curious':
    case 'interested':
      return 'curious';
    case 'serious':
    case 'concerned':
      return 'serious';
    case 'playful':
    case 'joking':
      return 'playful';
    case 'calm':
    case 'grounding':
      return 'grounding';
    default:
      return undefined;
  }
}

/**
 * Check if it's late night (10pm - 6am)
 */
function isLateNight(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

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
  const withTraits = [
    'ferni',
    'peter-john',
    'maya-santos',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
    'joel-dickson',
  ];
  return withTraits.includes(personaId);
}

/**
 * Get list of personas with custom speech traits.
 */
export function getPersonasWithSpeechTraits(): string[] {
  return ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel', 'joel-dickson'];
}

/**
 * Clear the trait registry (for testing).
 */
export function clearTraitRegistry(): void {
  traitRegistry.clear();
  preloaded = false;
}
