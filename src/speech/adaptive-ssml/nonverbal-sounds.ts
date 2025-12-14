/**
 * Nonverbal Sound Module
 *
 * Adds natural nonverbal sounds to responses for more human speech.
 *
 * IMPORTANT: Cartesia Sonic-3 ONLY supports [laughter] as a bracket notation.
 * [sigh], [cough], [hmm] etc. are NOT currently supported (planned for future).
 *
 * Strategy for unsupported sounds:
 * - [laughter] → Use [laughter] bracket notation (supported)
 * - Thinking sounds → Use plain text "Hmm..." (synthesized with persona voice)
 * - Sighs → Skip or use plain text (bracket notation not supported)
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/**
 * Simplified context for nonverbal sound decisions
 * (doesn't require full SpeechContext)
 */
export interface NonverbalContext {
  /** User's current emotion */
  userEmotion?: string;
  /** Current turn count */
  turnCount?: number;
}

// ============================================================================
// CARTESIA NONVERBAL SOUNDS
// ============================================================================

/**
 * Supported nonverbal sounds in Cartesia
 */
export const NONVERBALS = {
  // NOTE: Bracket notation like [laughter] uses Cartesia's STOCK audio samples
  // which sound like a different voice. Use plain text that will be synthesized
  // with the persona's voice instead.
  laughter: 'haha',
  softLaugh: 'heh',
  sigh: '', // Skip - Cartesia stock sounds don't match persona voice
  hmm: 'Hmm...', // Plain text, will be synthesized with persona's voice
} as const;

/**
 * Patterns that suggest humor/jokes in responses
 */
const HUMOR_PATTERNS = [
  /\bjust kidding\b/i,
  /\bjk\b/i,
  /\bhaha\b/i,
  /\blol\b/i,
  /\bdon't judge\b/i,
  /\bi know, i know\b/i,
  /\bokay,? that was (bad|terrible|cheesy)\b/i,
  /\bI'll see myself out\b/i,
  /\bbut seriously\b/i,
];

/**
 * Patterns that suggest empathetic/heavy moments
 */
const EMPATHY_PATTERNS = [
  /\bthat's (really )?(hard|tough|difficult)\b/i,
  /\bi'm (so )?sorry\b/i,
  /\bi (can )?imagine\b/i,
  /\bthat must (be|feel)\b/i,
  /\bI hear you\b/i,
  /\btake your time\b/i,
];

/**
 * Patterns suggesting thoughtful reflection
 */
const THINKING_PATTERNS = [
  /^(well|hmm|let me think)\b/i,
  /\bthat's (a good|an interesting) (question|point)\b/i,
  /\bi've been thinking\b/i,
];

// ============================================================================
// NONVERBAL SOUND INJECTION
// ============================================================================

export interface NonverbalOptions {
  /** Maximum nonverbal sounds to add (default: 1) */
  maxSounds?: number;
  /** Skip if response already has nonverbal sounds */
  skipIfHasSounds?: boolean;
  /** User's current emotional state */
  userEmotion?: string;
}

/**
 * Add appropriate nonverbal sounds to response text.
 *
 * Analyzes the response content and emotional context to add
 * natural nonverbal sounds that make speech more human.
 *
 * @param text - The response text
 * @param context - Simple context with emotional info
 * @param options - Configuration options
 * @returns Text with nonverbal sounds added
 */
export function addNonverbalSounds(
  text: string,
  context: NonverbalContext = {},
  options: NonverbalOptions = {}
): string {
  const { maxSounds = 1, skipIfHasSounds = true } = options;
  const userEmotion = options.userEmotion || context.userEmotion;

  // Skip if already has nonverbal sounds
  if (skipIfHasSounds && /\[[a-z\s]+\]/i.test(text)) {
    return text;
  }

  // Don't add to very short responses
  if (text.length < 30) {
    return text;
  }

  let result = text;
  let soundsAdded = 0;

  // 1. Check for humor patterns - add [laughter]
  if (soundsAdded < maxSounds) {
    for (const pattern of HUMOR_PATTERNS) {
      if (pattern.test(text)) {
        // Add laughter after the humorous phrase, before punctuation
        result = result.replace(pattern, (match) => {
          soundsAdded++;
          return `${match} ${NONVERBALS.softLaugh}`;
        });
        break;
      }
    }
  }

  // 2. Check for empathetic moments - user is sad/stressed
  if (soundsAdded < maxSounds && (userEmotion === 'sad' || userEmotion === 'stressed')) {
    // Add a gentle sigh for heavy moments (low probability)
    if (Math.random() < 0.15) {
      for (const pattern of EMPATHY_PATTERNS) {
        if (pattern.test(text)) {
          // Add sigh before empathetic phrase
          result = result.replace(pattern, (match) => {
            soundsAdded++;
            return `${NONVERBALS.sigh} ${match}`;
          });
          break;
        }
      }
    }
  }

  // 3. Check for thinking patterns at start - add [hmm]
  // Only add if response starts with a thinking phrase (low probability)
  if (soundsAdded < maxSounds && Math.random() < 0.1) {
    for (const pattern of THINKING_PATTERNS) {
      if (pattern.test(text.substring(0, 50))) {
        // Don't double-add if already starts with hmm
        if (!text.toLowerCase().startsWith('hmm')) {
          result = `${NONVERBALS.hmm} ${result}`;
          soundsAdded++;
        }
        break;
      }
    }
  }

  if (soundsAdded > 0) {
    log.debug({ soundsAdded }, 'Added nonverbal sounds to response');
  }

  return result;
}

/**
 * Check if text already contains nonverbal sounds
 */
export function hasNonverbalSounds(text: string): boolean {
  return /\[[a-z\s]+\]/i.test(text);
}
