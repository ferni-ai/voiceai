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
  EMOTION_KEYWORDS,
  EMPHASIS_KEYWORDS,
  FAST_PACE_KEYWORDS,
  FINANCIAL_PRONUNCIATIONS,
  SLOW_PACE_KEYWORDS,
  WHISPER_KEYWORDS,
} from './constants.js';

// Import internal dependencies
import { detectEmotion, detectPacing, detectVocalCues, detectVolume } from './detection.js';
import { applyFinancialPronunciations, removeProtectionMarkers } from './financial.js';
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
import { addNaturalPauses, addThinkingSounds, clampSpeed, clampVolume } from './processors.js';

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
 *
 * CRITICAL: This is the safety net that prevents stage directions from being spoken.
 * Any text in *asterisks* or [brackets] that isn't valid SSML should be stripped.
 */
export function sanitizeSsml(text: string): string {
  let result = text;

  // ================================================
  // FIRST: CONVERT laugh/chuckle/giggle to [laughter]
  // Cartesia Sonic-3 supports [laughter] for actual laugh sounds!
  // ================================================

  // Asterisk format: *chuckles*, *laughs softly*, etc.
  result = result.replace(/\*[^*]*(?:chuckle|laugh|giggle)[^*]*\*/gi, '[laughter]');
  // Parenthesis format: (laughs), (chuckles softly), etc.
  result = result.replace(/\([^)]*(?:chuckle|laugh|giggle)[^)]*\)/gi, '[laughter]');
  // Bracket format: [chuckles], [laughs warmly], [soft laughter], [gentle giggle], [warm chuckle]
  result = result.replace(/\[[^\]]*(?:chuckle|laugh|giggle|laughter)[^\]]*\]/gi, '[laughter]');
  // Standalone words with modifiers
  result = result.replace(
    /(?<!\[)\b(chuckles?|laughs?|giggles?)\s*(softly|gently|quietly|to himself|to herself|briefly|warmly)?\s*\.?\s*/gi,
    '[laughter] '
  );
  result = result.replace(
    /(?<!\[)\b(he|she|jack|i)\s+(chuckles?|laughs?|giggles?)\s*(softly|gently|quietly|briefly|warmly)?\.?\s*/gi,
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
  // COMPREHENSIVE STAGE DIRECTION REMOVAL
  // Remove ALL non-verbal actions that LLMs might generate
  // ================================================

  // Comprehensive list of stage direction keywords
  const stageDirectionKeywords = [
    // Breathing/physical
    'sigh',
    'breath',
    'exhale',
    'inhale',
    'breathing',
    // Expressions
    'smile',
    'grin',
    'frown',
    'nod',
    'wink',
    'blink',
    // Actions
    'pause',
    'think',
    'clear',
    'cough',
    'shift',
    'lean',
    'settle',
    'focus',
    'attention',
    'shrug',
    // Physical presence
    'warm',
    'steady',
    'gentle',
    'soft',
    'present',
    'presence',
    // Energy
    'perk',
    'energy',
    'relief',
    // Misc stage directions
    "chef's kiss",
    'taking a breath',
    'visible',
  ];

  // Build regex pattern for stage directions
  const keywordPattern = stageDirectionKeywords.join('|');

  // Remove asterisk-wrapped stage directions: *exhale*, *settles in*, *warm*, etc.
  result = result.replace(new RegExp(`\\*[^*]*(?:${keywordPattern})[^*]*\\*`, 'gi'), '');

  // Remove parenthesis-wrapped stage directions: (sighs), (takes a breath), etc.
  result = result.replace(new RegExp(`\\([^)]*(?:${keywordPattern})[^)]*\\)`, 'gi'), '');

  // Remove bracket-wrapped stage directions (except [laughter]): [pauses], [smiles], etc.
  result = result.replace(new RegExp(`\\[[^\\]]*(?:${keywordPattern})[^\\]]*\\]`, 'gi'), '');

  // Remove common standalone stage direction phrases
  result = result.replace(
    /\b(deep breath|long pause|brief pause|sighs heavily|clears throat|takes a breath|taking a breath)\b/gi,
    ''
  );

  // Remove non-audio action verbs with modifiers
  result = result.replace(
    /\b(sighs?|smiles?|grins?|nods?|pauses?|winks?|exhales?|inhales?|shifts?|leans?|settles?)\s*(softly|gently|quietly|to himself|to herself|briefly|warmly|in|down|up|back)?\s*\.?\s*/gi,
    ''
  );
  result = result.replace(
    /\b(he|she|jack|ferni|maya|jordan|alex|peter|i)\s+(sighs?|smiles?|grins?|pauses?|nods?|exhales?|shifts?|leans?|settles?)\s*(softly|gently|quietly|briefly|warmly)?\.?\s*/gi,
    ''
  );

  // NUCLEAR OPTION for action verbs - standalone words
  result = result.replace(/\bsmiles?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bgrins?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bnods?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bwinks?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bsighs?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bexhales?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\binhales?\b[,.!?:;—–-]?\s*/gi, '');

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
export { detectEmotion, detectPacing, detectVocalCues, detectVolume } from './detection.js';

// Re-export processor utilities
export { clampSpeed, clampVolume, mapToCartesiaEmotion } from './processors.js';
