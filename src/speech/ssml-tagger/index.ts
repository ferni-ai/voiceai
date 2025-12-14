/**
 * SSML Tagger - Main Entry Point
 *
 * Enhanced Intelligent SSML Tagger for Human-Like Natural Speech
 * Implements Cartesia Sonic-3 SSML tags with financial pronunciations.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 *
 * MIGRATION NOTICE:
 * Most functionality has been consolidated into the canonical `src/ssml/` module.
 * New code should import from there:
 *
 * ```typescript
 * import { tagTextWithSsmlPersonaAware, sanitizeSsml } from '../ssml/index.js';
 * ```
 *
 * This module now:
 * 1. Re-exports canonical functions for backwards compatibility
 * 2. Provides the legacy `tagTextWithSsml()` for Jack Bogle-specific processing
 * 3. Will be deprecated in a future version
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SsmlTagger' });

// =============================================================================
// RE-EXPORTS FROM CANONICAL SOURCE (src/ssml/)
// =============================================================================

// Re-export types
export type { PronunciationEntry, TaggingContext } from './types.js';

// Re-export constants (for backwards compatibility)
export {
  EMOTION_KEYWORDS,
  EMPHASIS_KEYWORDS,
  FAST_PACE_KEYWORDS,
  FINANCIAL_PRONUNCIATIONS,
  SLOW_PACE_KEYWORDS,
  WHISPER_KEYWORDS,
} from './constants.js';

// Re-export detection functions
export { detectEmotion, detectPacing, detectVocalCues, detectVolume } from './detection.js';

// Re-export processor utilities
export { clampSpeed, clampVolume, mapToCartesiaEmotion } from './processors.js';

// =============================================================================
// CANONICAL SANITIZATION (from src/ssml/core.ts)
// =============================================================================

// Import the canonical sanitizeSsml
import { sanitizeSsml as canonicalSanitizeSsml } from '../../ssml/core.js';

/**
 * Sanitize malformed SSML output
 *
 * This is a re-export of the canonical implementation from src/ssml/core.ts.
 * Use that module directly for new code.
 */
export const sanitizeSsml = canonicalSanitizeSsml;

// =============================================================================
// LEGACY JACK BOGLE-SPECIFIC TAGGING
// =============================================================================

// Import local dependencies for legacy function
import { FINANCIAL_END, FINANCIAL_PRONUNCIATIONS, FINANCIAL_START } from '../../ssml/constants.js';
import {
  detectEmotion,
  detectPacing,
  detectVocalCues,
  detectVolume,
} from '../../ssml/detection.js';
import { clampSpeed, clampVolume } from '../../ssml/tags.js';
import {
  addActiveListeningSounds,
  addCatchphraseEmphasis,
  addHistoricalYearGravity,
  addHumbleDeflection,
  addLaughterThroughout,
  addNameWarmth,
  addQuotationVoiceShift,
  addSelfCorrections,
  addStorytellingMode,
  addTricolonCadence,
  addWisdomCadence,
  addWordFindingPauses,
} from './jack-bogle.js';
import { addNaturalPauses, addThinkingSounds } from './processors.js';

/**
 * Apply financial pronunciation dictionary to text
 */
function applyFinancialPronunciations(text: string): string {
  let result = text;

  for (const entry of FINANCIAL_PRONUNCIATIONS) {
    entry.pattern.lastIndex = 0;
    result = result.replace(entry.pattern, () => {
      return `${FINANCIAL_START}${entry.replacement}${FINANCIAL_END}`;
    });
  }

  return result;
}

/**
 * Remove protection markers from processed text
 */
function removeProtectionMarkers(text: string): string {
  return text
    .replace(new RegExp(FINANCIAL_START, 'g'), '')
    .replace(new RegExp(FINANCIAL_END, 'g'), '');
}

// Track if deprecation warning has been logged
let deprecationWarningLogged = false;

/**
 * Main SSML tagging function (LEGACY - Jack Bogle optimized)
 *
 * Applies full Cartesia Sonic-3 SSML support with financial pronunciations.
 * This version is optimized for Jack Bogle's grandfatherly character.
 *
 * @deprecated For multi-persona support, use tagTextWithSsmlPersonaAware from '../../ssml/':
 *
 * ```typescript
 * import { tagTextWithSsmlPersonaAware } from '../../ssml/index.js';
 *
 * const ssml = tagTextWithSsmlPersonaAware(text, {
 *   personaId: 'peter-john',
 *   humanize: true,
 * });
 * ```
 */
export function tagTextWithSsml(text: string): string {
  // Log deprecation warning once
  if (!deprecationWarningLogged) {
    log.warn(
      'tagTextWithSsml() is deprecated. Use tagTextWithSsmlPersonaAware() from "../../ssml/index.js" instead.'
    );
    deprecationWarningLogged = true;
  }

  if (!text || text.trim().length === 0) {
    return text;
  }

  // If already has SSML tags, still sanitize out stage directions
  if (text.includes('<')) {
    return sanitizeSsml(text);
  }

  // STEP 0: Apply financial pronunciation dictionary FIRST
  let processedText = applyFinancialPronunciations(text);

  // Analyze text (after pronunciation fixes)
  const emotion = detectEmotion(processedText);
  const { speed: rawSpeed } = detectPacing(processedText);
  const { volume: rawVolume } = detectVolume(processedText);
  const { hasLaughter, hasSigh, laughterCount } = detectVocalCues(processedText);

  // Clamp values to Cartesia's valid ranges
  const speed = clampSpeed(rawSpeed);
  const volume = clampVolume(rawVolume);

  // Build opening tags with clamped values
  let tagged = `<speed ratio="${speed.toFixed(2)}"/><volume ratio="${volume.toFixed(2)}"/>`;

  if (emotion) {
    tagged += `<emotion value="${emotion}"/>`;
  }

  // Add pauses at the start for emotional moments
  if (hasSigh) {
    tagged += '<volume ratio="0.85"/><break time="400ms"/><volume ratio="1.0"/>';
  }

  // Add warmth at start if positive emotion detected
  if (hasLaughter || (emotion === 'affectionate' && (laughterCount ?? 0) > 0)) {
    tagged += '<break time="200ms"/>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: CORE NATURAL SPEECH (Always safe)
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addThinkingSounds(processedText);
  processedText = addNaturalPauses(processedText, speed);

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: JACK'S SIGNATURE PERSONALITY (Phrase-specific, no conflicts)
  // These are Jack Bogle-specific and should eventually be moved to persona
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addCatchphraseEmphasis(processedText, emotion);
  processedText = addHistoricalYearGravity(processedText);
  processedText = addWisdomCadence(processedText, emotion);
  processedText = addStorytellingMode(processedText, emotion);
  processedText = addHumbleDeflection(processedText, emotion);
  processedText = addTricolonCadence(processedText, speed);
  processedText = addQuotationVoiceShift(processedText, emotion);

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: WARMTH & EMOTION (Re-enabled with caution)
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addNameWarmth(processedText, emotion);
  processedText = addActiveListeningSounds(processedText, emotion);
  processedText = addLaughterThroughout(processedText, emotion, laughterCount ?? 0);

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: ELDERLY CHARACTER (Age-appropriate hesitations)
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addWordFindingPauses(processedText, emotion);
  processedText = addSelfCorrections(processedText, emotion);

  // CRITICAL: Remove protection markers around financial pronunciations
  processedText = removeProtectionMarkers(processedText);

  // CRITICAL: Sanitize malformed SSML before returning
  processedText = sanitizeSsml(processedText);

  tagged += processedText;

  return tagged;
}

/**
 * Batch tag multiple text fragments, maintaining context across them
 * @deprecated Use tagTextWithSsmlPersonaAware from '../../ssml/' instead
 */
export function tagTextFragments(fragments: string[]): string[] {
  return fragments.map(tagTextWithSsml);
}
