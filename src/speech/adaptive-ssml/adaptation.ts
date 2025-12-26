/**
 * Core Adaptive SSML Functions
 *
 * Base adaptive tagging and SSML adjustment functions.
 * Now integrates Alive Voice and Superhuman Voice features
 * for truly "Better Than Human" speech.
 */

import { sanitizeSsml, tagTextWithSsmlPersonaAware } from '../../ssml/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { EnergyLevel, SpeechContext } from '../speech-context.js';
import { makeVoiceAlive, type AliveVoiceContext } from './alive-voice.js';
import {
  applySuperhmanVoice,
  getLastEmotion,
  updateSuperhmanVoiceSession,
  type SuperhumanVoiceContext,
} from './superhuman-voice.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map 3-level energy to 5-level for humanization system
 */
function mapTo5Level(
  energy: EnergyLevel
): 'very_low' | 'low' | 'neutral' | 'elevated' | 'high' {
  switch (energy) {
    case 'low':
      return 'low';
    case 'high':
      return 'elevated';
    default:
      return 'neutral';
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended speech context with superhuman voice parameters.
 * Includes vulnerability, presence mode, and memory-informed context.
 */
export interface ExtendedSpeechContext extends SpeechContext {
  /** Session ID for tracking */
  sessionId?: string;

  /** Vulnerability depth from vulnerability-matching system */
  vulnerabilityDepth?: 'surface' | 'thoughtful' | 'personal' | 'vulnerable' | 'raw';

  /** Presence level from presence-mode system */
  presenceLevel?: 'normal' | 'gentle' | 'holding' | 'silent';

  /** Known user context from memory (grief, stress, etc.) */
  knownUserContext?: 'grieving' | 'stressed' | 'celebrating' | 'struggling' | 'growing' | null;

  /** Relationship depth in turns */
  relationshipTurns?: number;

  /** Is the response to heavy content? */
  isHeavyContent?: boolean;

  /** Current detected emotion for the response */
  currentEmotion?: string;
}

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

  // Use persona-aware tagger (now the canonical source)
  // Default to 'ferni' if no personaId provided for consistent behavior
  const effectivePersonaId = personaId || 'ferni';
  let tagged = tagTextWithSsmlPersonaAware(text, {
    personaId: effectivePersonaId,
    baseSpeed: context.baseSpeed * context.energyMultiplier,
    baseVolume: 1.0,
    humanize: true,
  });
  getLogger().debug(
    `Persona-aware SSML (${effectivePersonaId}): speed=${context.baseSpeed.toFixed(2)}, energy=${context.energyMultiplier.toFixed(2)}`
  );

  // =========================================================================
  // ALIVE VOICE ENHANCEMENTS
  // Apply sentence-level emotion arcs, dynamic pauses, speed variation,
  // opening sounds, and persona fingerprints to make speech more human.
  // =========================================================================
  const aliveContext: AliveVoiceContext = {
    personaId,
    userEmotion: context.userEmotion,
    topicWeight: context.topicWeight,
    turnCount: context.turnCount,
    // Use extended 5-level energy for humanization if available
    userEnergy: context.extendedUserEnergy || mapTo5Level(context.userEnergy),
    // New humanization fields
    isLateNight: context.isLateNight,
    userJustLaughed: context.userJustLaughed,
    randomSeed: context.randomSeed,
  };

  const aliveResult = makeVoiceAlive(tagged, aliveContext);

  if (aliveResult.appliedFeatures.length > 0) {
    getLogger().debug(
      { features: aliveResult.appliedFeatures, personaId },
      'Applied alive voice enhancements'
    );
  }

  return aliveResult.text;
}

/**
 * Tag text with SSML including superhuman voice enhancements.
 *
 * This is the "Better Than Human" version that includes:
 * - Prosodic mirroring (match user's pace)
 * - Vulnerability voice softening
 * - Silence presence phrases
 * - Anticipatory comfort sounds
 * - Memory-informed baseline
 * - Emotional transition bridges
 *
 * @param text - The text to tag
 * @param context - Extended speech context with superhuman parameters
 * @param personaId - Persona ID
 */
export function tagTextWithSsmlSuperhuman(
  text: string,
  context: ExtendedSpeechContext,
  personaId?: string
): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  const sessionId = context.sessionId || 'default';

  // First apply standard adaptive tagging
  const result = tagTextWithSsmlAdaptive(text, context, personaId);

  // =========================================================================
  // SUPERHUMAN VOICE ENHANCEMENTS
  // Apply prosodic mirroring, vulnerability softening, presence phrases,
  // anticipatory comfort sounds, memory-informed baseline, and
  // emotional transition bridges for truly superhuman presence.
  // =========================================================================
  const superhumanContext: SuperhumanVoiceContext = {
    sessionId,
    personaId,
    userWPM: context.userWPM,
    userEnergy: context.userEnergy,
    vulnerabilityDepth: context.vulnerabilityDepth,
    presenceLevel: context.presenceLevel,
    knownUserContext: context.knownUserContext,
    relationshipTurns: context.relationshipTurns,
    isHeavyContent: context.isHeavyContent || context.topicWeight === 'heavy',
    topicWeight: context.topicWeight,
    turnCount: context.turnCount,
    previousEmotion: getLastEmotion(sessionId) || undefined,
    currentEmotion: context.currentEmotion,
  };

  const superhumanResult = applySuperhmanVoice(result, superhumanContext);

  if (superhumanResult.appliedEnhancements.length > 0) {
    getLogger().debug(
      {
        enhancements: superhumanResult.appliedEnhancements,
        speed: superhumanResult.speedMultiplier.toFixed(2),
        volume: superhumanResult.volumeMultiplier.toFixed(2),
        personaId,
      },
      '✨ Applied superhuman voice enhancements'
    );

    // Update session tracking
    updateSuperhmanVoiceSession(sessionId, superhumanResult, context.currentEmotion);
  }

  return superhumanResult.text;
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
