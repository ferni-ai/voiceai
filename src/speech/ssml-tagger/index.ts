/**
 * SSML Tagger - Main Entry Point
 *
 * Enhanced Intelligent SSML Tagger for Human-Like Natural Speech
 * Implements Cartesia Sonic-3 SSML tags with financial pronunciations.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 */

// Re-export types
export type { PronunciationEntry, TaggingContext } from './types.js';

// Re-export constants for external use
export {
  FINANCIAL_PRONUNCIATIONS,
  EMOTION_KEYWORDS,
  SLOW_PACE_KEYWORDS,
  FAST_PACE_KEYWORDS,
  EMPHASIS_KEYWORDS,
  WHISPER_KEYWORDS,
} from './constants.js';

// Import internal dependencies
import { detectEmotion, detectPacing, detectVolume, detectVocalCues } from './detection.js';
import { applyFinancialPronunciations, removeProtectionMarkers } from './financial.js';
import {
  clampSpeed,
  clampVolume,
  addThinkingSounds,
  addNaturalPauses,
} from './processors.js';
import {
  addCatchphraseEmphasis,
  addHistoricalYearGravity,
  addWisdomCadence,
  addStorytellingMode,
  addHumbleDeflection,
  addTricolonCadence,
  addQuotationVoiceShift,
  addNameWarmth,
  addActiveListeningSounds,
  addLaughterThroughout,
  addWordFindingPauses,
  addSelfCorrections,
} from './jack-bogle.js';

/**
 * Main SSML tagging function (LEGACY - Jack Bogle optimized)
 *
 * Applies full Cartesia Sonic-3 SSML support with financial pronunciations.
 * This version is optimized for Jack Bogle's grandfatherly character.
 *
 * FOR PERSONA-AWARE TAGGING, use the new modular system:
 * ```typescript
 * import { tagTextWithSsmlPersonaAware } from './ssml/index.js';
 *
 * const ssml = tagTextWithSsmlPersonaAware(text, {
 *   personaId: 'peter-john',
 *   humanize: true,
 * });
 * ```
 *
 * @deprecated For multi-persona support, use tagTextWithSsmlPersonaAware from ./ssml/
 */
export function tagTextWithSsml(text: string): string {
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
  if (hasLaughter || (emotion === 'affectionate' && laughterCount > 0)) {
    tagged += '<break time="200ms"/>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: CORE NATURAL SPEECH (Always safe)
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addThinkingSounds(processedText);
  processedText = addNaturalPauses(processedText, speed);

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: JACK'S SIGNATURE PERSONALITY (Phrase-specific, no conflicts)
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
  processedText = addLaughterThroughout(processedText, emotion, laughterCount);

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
 * Sanitize malformed SSML output
 * Fixes corrupted tags where content was inserted into attribute values
 * Also removes stage directions like "*chuckles*" that LLMs generate
 */
export function sanitizeSsml(text: string): string {
  let result = text;

  // ================================================
  // FIRST: CONVERT laugh/chuckle to [laughter]
  // Cartesia Sonic-3 supports [laughter] for actual laugh sounds!
  // ================================================

  result = result.replace(/\*[^*]*(?:chuckle|laugh)[^*]*\*/gi, '[laughter]');
  result = result.replace(/\([^)]*(?:chuckle|laugh)[^)]*\)/gi, '[laughter]');
  result = result.replace(/\[chuckles?\]/gi, '[laughter]');
  result = result.replace(
    /(?<!\[)\b(chuckles?|laughs?)\s*(softly|gently|quietly|to himself|to herself|briefly|warmly)?\s*\.?\s*/gi,
    '[laughter] '
  );
  result = result.replace(
    /(?<!\[)\b(he|she|jack|i)\s+(chuckles?|laughs?)\s*(softly|gently|quietly|briefly|warmly)?\.?\s*/gi,
    '[laughter] '
  );

  // CATCH-ALL: Convert ANY remaining "chuckle" or "chuckles" to [laughter]
  result = result.replace(/(?<!\[)\bchuckles?\b[,.!?:;—–-]?\s*/gi, '[laughter] ');

  // NUCLEAR OPTION: If "chuckle" still appears anywhere, remove it entirely
  if (/chuckle/i.test(result)) {
    result = result.replace(/\bchuckles?\b/gi, '');
  }

  // Clean up multiple [laughter] tags in a row
  result = result.replace(/(\[laughter\]\s*){2,}/gi, '[laughter] ');

  // ================================================
  // THEN: Remove stage directions that LLM might generate
  // ================================================

  result = result.replace(/\([^)]*(?:sigh|breath|pause|smile|nod|think|clear|cough)[^)]*\)/gi, '');
  result = result.replace(
    /\[[^\]]*(?:sigh|breath|pause|smile|nod|think|clear|cough)[^\]]*\]/gi,
    ''
  );
  result = result.replace(/\*[^*]*(?:sigh|breath|pause|smile|nod|think|clear|cough)[^*]*\*/gi, '');
  result = result.replace(
    /\b(deep breath|long pause|brief pause|sighs heavily|clears throat)\b/gi,
    ''
  );
  result = result.replace(
    /\b(sighs?|smiles?|grins?|nods?|pauses?|winks?)\s*(softly|gently|quietly|to himself|to herself|briefly|warmly)?\s*\.?\s*/gi,
    ''
  );
  result = result.replace(
    /\b(he|she|jack|i)\s+(sighs?|smiles?|grins?|pauses?|nods?)\s*(softly|gently|quietly|briefly|warmly)?\.?\s*/gi,
    ''
  );

  // NUCLEAR OPTION for action verbs
  result = result.replace(/\bsmiles?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bgrins?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bnods?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bwinks?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bsighs?\b[,.!?:;—–-]?\s*/gi, '');

  // ================================================
  // THEN: Fix malformed SSML tags
  // ================================================

  result = result.replace(/<break\s+time="[^"<]*<[^"]*"\/>/g, '<break time="100ms"/>');
  result = result.replace(/<speed\s+ratio="[^"<]*<[^"]*"\/>/g, '');
  result = result.replace(/<volume\s+ratio="[^"<]*<[^"]*"\/>/g, '');
  result = result.replace(/<emotion\s+value="[^"<]*<[^"]*"\/>/g, '');

  // Clean up orphaned tag remnants
  result = result.replace(/(?<!")\s*\/>/g, '');

  // Clean up doubled-up tags
  result = result.replace(/(<\w+[^>]*\/>)\1+/g, '$1');

  // Clean up excessive breaks
  result = result.replace(/(<break time="[^"]*"\/>){3,}/g, '<break time="200ms"/>');

  // Clean up multiple spaces
  result = result.replace(/\s{2,}/g, ' ');

  return result;
}

/**
 * Batch tag multiple text fragments, maintaining context across them
 */
export function tagTextFragments(fragments: string[]): string[] {
  return fragments.map(tagTextWithSsml);
}

// Re-export detection functions for external use
export { detectEmotion, detectPacing, detectVolume, detectVocalCues } from './detection.js';

// Re-export processor utilities
export { clampSpeed, clampVolume, mapToCartesiaEmotion } from './processors.js';
