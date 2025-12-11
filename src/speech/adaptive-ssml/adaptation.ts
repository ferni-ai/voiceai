/**
 * Core Adaptive SSML Functions
 *
 * Base adaptive tagging and SSML adjustment functions.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { tagTextWithSsmlPersonaAware } from '../../ssml/index.js';
import { sanitizeSsml, tagTextWithSsml } from '../ssml-tagger/index.js';
import type { SpeechContext } from '../speech-context.js';

// ============================================================================
// ADAPTIVE TAGGING
// ============================================================================

/**
 * Tag text with SSML, adapting to speech context
 *
 * @param text - The text to tag
 * @param context - Speech context with pacing, energy, etc.
 * @param personaId - Optional persona ID for persona-specific SSML (e.g., 'nayan-patel', 'peter-john')
 */
export function tagTextWithSsmlAdaptive(
  text: string,
  context: SpeechContext,
  personaId?: string
): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  // If already has SSML tags, adjust existing tags
  if (text.includes('<')) {
    return adjustExistingSsml(text, context);
  }

  // Use persona-aware tagger if personaId provided
  let tagged: string;
  if (personaId) {
    tagged = tagTextWithSsmlPersonaAware(text, {
      personaId,
      baseSpeed: context.baseSpeed * context.energyMultiplier,
      baseVolume: 1.0,
      humanize: true,
    });
    getLogger().debug(
      `Persona-aware SSML (${personaId}): speed=${context.baseSpeed.toFixed(2)}, energy=${context.energyMultiplier.toFixed(2)}`
    );
  } else {
    // Fallback to legacy tagger
    tagged = tagTextWithSsml(text);
    // Then apply adaptive adjustments
    tagged = applySpeedAdaptation(tagged, context);
    tagged = applyPauseAdaptation(tagged, context);
    tagged = applyWarmthAdjustment(tagged, context);
    getLogger().debug(
      `Legacy SSML: speed=${context.baseSpeed.toFixed(2)}, energy=${context.energyMultiplier.toFixed(2)}`
    );
  }

  return tagged;
}

// ============================================================================
// SSML VALIDATION & SANITIZATION
// ============================================================================

/**
 * Check if text contains potentially malformed SSML
 * FIX BUG #voice-14: Detect malformed SSML before processing
 */
function hasMalformedSsml(text: string): boolean {
  // Check for unclosed tags
  const openTags = (text.match(/<(?!\/)[^>]+(?<!\/)>/g) || []).length;
  const closeTags = (text.match(/<\/[^>]+>/g) || []).length;
  const selfClosingTags = (text.match(/<[^>]+\/>/g) || []).length;

  // Simple heuristic: more open tags than close + self-closing is suspicious
  if (openTags > closeTags + selfClosingTags + 2) {
    return true;
  }

  // Check for nested angle brackets (common SSML error)
  if (text.includes('<<') || text.includes('>>')) {
    return true;
  }

  // Check for broken emotion tags
  if (/<emotion[^>]*>[^<]*<emotion/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Strip all SSML tags from text (fallback for malformed SSML)
 */
function stripSsmlTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Adjust existing SSML tags to match context
 * ALSO sanitizes out stage directions like "*chuckles*"
 * FIX BUG #voice-14 & #voice-15: Added malformed SSML handling
 */
function adjustExistingSsml(text: string, context: SpeechContext): string {
  // FIX BUG #voice-14: Check for malformed SSML first
  if (hasMalformedSsml(text)) {
    getLogger().warn('Detected malformed SSML, stripping tags and processing as plain text');
    return sanitizeSsml(stripSsmlTags(text));
  }

  // CRITICAL: Always sanitize out stage directions like "*chuckles*" first
  let result = sanitizeSsml(text);

  // FIX BUG #voice-15: Use more robust regex patterns that handle edge cases
  try {
    // Adjust speed ratios (handling both self-closing and regular syntax)
    result = result.replace(
      /<speed\s+ratio="([\d.]+)"\s*\/?>/gi,
      (match: string, ratio: string) => {
        const original = parseFloat(ratio);
        if (isNaN(original)) return match; // Skip if can't parse
        const adjusted = original * context.baseSpeed * context.energyMultiplier;
        return `<speed ratio="${Math.max(0.6, Math.min(1.2, adjusted)).toFixed(2)}"/>`;
      }
    );

    // Adjust break times based on pause multiplier
    result = result.replace(/<break\s+time="(\d+)ms"\s*\/?>/gi, (match: string, ms: string) => {
      const original = parseInt(ms);
      if (isNaN(original)) return match; // Skip if can't parse
      const adjusted = Math.round(original * context.pauseMultiplier);
      return `<break time="${adjusted}ms"/>`;
    });
  } catch (error) {
    // FIX BUG #voice-14: Graceful degradation on regex errors
    getLogger().warn(
      { error: String(error) },
      'SSML adjustment regex failed, returning sanitized text'
    );
    return sanitizeSsml(text);
  }

  return result;
}

// ============================================================================
// ADAPTATION FUNCTIONS
// ============================================================================

/**
 * Apply speed adaptation
 */
function applySpeedAdaptation(text: string, context: SpeechContext): string {
  const targetSpeed = context.baseSpeed * context.energyMultiplier;

  // Adjust all speed tags proportionally
  return text.replace(/<speed ratio="([\d.]+)"\/>/g, (_match, ratio) => {
    const original = parseFloat(ratio);
    // Scale relative to target (if original is 0.88, and target is 0.80, result is ~0.80)
    const adjusted = original * (targetSpeed / 0.88);
    return `<speed ratio="${Math.max(0.6, Math.min(1.2, adjusted)).toFixed(2)}"/>`;
  });
}

/**
 * Apply pause adaptation
 */
function applyPauseAdaptation(text: string, context: SpeechContext): string {
  // Multiply all pause durations
  return text.replace(/<break time="(\d+)ms"\/>/g, (_match, ms) => {
    const original = parseInt(ms);
    const adjusted = Math.round(original * context.pauseMultiplier);
    // Cap pauses at reasonable values
    const capped = Math.min(adjusted, 1500);
    return `<break time="${capped}ms"/>`;
  });
}

/**
 * Adjust warmth/affectionate tone based on context
 * NOTE: Cartesia Sonic-3 valid emotions: angry, sad, surprised, curious, affectionate
 * We use pauses and speed adjustments to convey warmth variations.
 */
function applyWarmthAdjustment(text: string, context: SpeechContext): string {
  // In light topics with high energy, add brief pauses for warmth (simulates chuckle)
  if (context.topicWeight === 'light' && context.allowLaughter) {
    // Add slight pause after positive phrases to convey warmth
    return text.replace(/(that's wonderful|that's great|i love|how wonderful)/gi, (match) => {
      return `${match}<break time="150ms"/>`;
    });
  }
  return text;
}
