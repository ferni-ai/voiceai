/**
 * Adaptive SSML Tagger
 *
 * Wraps the existing SSML tagger with adaptive parameters based on speech context.
 * Adjusts speed, pauses, laughter, and emotion based on user and conversation state.
 *
 * Now supports persona-aware SSML via the new modular ssml/ system.
 */

import { getLogger } from '../utils/safe-logger.js';
import { tagTextWithSsml, sanitizeSsml, tagTextWithSsmlPersonaAware } from '../ssml/index.js';
import type { SpeechContext } from './speech-context.js';
import type { ConversationPhase } from '../intelligence/conversation-state.js';
import type { CognitiveGuidance, ReasoningStyle } from '../personas/cognitive-types.js';
import {
  applyCognitiveSpeechAdjustments,
  buildCognitiveSSML,
  type CognitiveSpeechInput,
  type CognitiveSpeechResult,
} from './cognitive-speech-integration.js';

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
    tagged = applyEmotionAdaptation(tagged, context);
    getLogger().debug(
      `Legacy SSML: speed=${context.baseSpeed.toFixed(2)}, energy=${context.energyMultiplier.toFixed(2)}`
    );
  }

  return tagged;
}

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
    result = result.replace(/<speed\s+ratio="([\d.]+)"\s*\/?>/gi, (match, ratio) => {
      const original = parseFloat(ratio);
      if (isNaN(original)) return match; // Skip if can't parse
      const adjusted = original * context.baseSpeed * context.energyMultiplier;
      return `<speed ratio="${Math.max(0.6, Math.min(1.2, adjusted)).toFixed(2)}"/>`;
    });

    // Adjust break times based on pause multiplier
    result = result.replace(/<break\s+time="(\d+)ms"\s*\/?>/gi, (match, ms) => {
      const original = parseInt(ms);
      if (isNaN(original)) return match; // Skip if can't parse
      const adjusted = Math.round(original * context.pauseMultiplier);
      return `<break time="${adjusted}ms"/>`;
    });
  } catch (error) {
    // FIX BUG #voice-14: Graceful degradation on regex errors
    getLogger().warn({ error: String(error) }, 'SSML adjustment regex failed, returning sanitized text');
    return sanitizeSsml(text);
  }

  return result;
}

/**
 * Apply speed adaptation
 */
function applySpeedAdaptation(text: string, context: SpeechContext): string {
  const targetSpeed = context.baseSpeed * context.energyMultiplier;

  // Adjust all speed tags proportionally
  return text.replace(/<speed ratio="([\d.]+)"\/>/g, (match, ratio) => {
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
  return text.replace(/<break time="(\d+)ms"\/>/g, (match, ms) => {
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

/**
 * Apply emotion adaptation - VOICE TONE MATCHING
 *
 * The agent mirrors the user's emotional state for connection:
 * - Sad user → Softer, gentler, slower speech
 * - Stressed user → Calm, steady, reassuring
 * - Excited user → Energetic, upbeat
 * - Confused user → Clear, patient, slower
 *
 * Valid Cartesia Sonic-3 emotions: angry, sad, surprised, curious, affectionate
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags#emotion-beta
 */
function applyEmotionAdaptation(text: string, context: SpeechContext): string {
  let result = text;
  const userEmotion = context.userEmotion?.toLowerCase() || 'neutral';

  // =========================================================================
  // SADNESS / GRIEF - Be gentle and soft
  // =========================================================================
  if (userEmotion === 'sad' || userEmotion === 'grief' || userEmotion === 'disappointed') {
    // Use 'sad' emotion (empathetic tone) and slow way down
    result = result.replace(/<emotion value="[^"]+"/g, '<emotion value="sad"');

    // Add soft prefix to wrap entire response
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.85"/>${result}`;
    }

    // Add longer pauses after sentences for breathing room
    result = result.replace(/\. /g, '.<break time="400ms"/> ');
    result = result.replace(/\.\s*$/g, '.<break time="500ms"/>');

    getLogger().debug('Voice tone: SOFT (matching user sadness)');
    return result;
  }

  // =========================================================================
  // STRESS / ANXIETY - Be calm and steady
  // =========================================================================
  if (
    userEmotion === 'stressed' ||
    userEmotion === 'anxious' ||
    userEmotion === 'overwhelmed' ||
    userEmotion === 'worried'
  ) {
    // Use affectionate (warm) with steady, slow pacing
    result = result.replace(/<emotion value="[^"]+"/g, '<emotion value="affectionate"');

    // Slow down significantly
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.80"/>${result}`;
    }

    // Add calming pauses
    result = result.replace(/\. /g, '.<break time="350ms"/> ');

    getLogger().debug('Voice tone: CALM (soothing user stress)');
    return result;
  }

  // =========================================================================
  // EXCITEMENT / HAPPINESS - Match the energy!
  // =========================================================================
  if (
    userEmotion === 'excited' ||
    userEmotion === 'happy' ||
    userEmotion === 'joy' ||
    userEmotion === 'enthusiastic'
  ) {
    // Use affectionate or leave default, speed up slightly
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="1.05"/>${result}`;
    }

    // Shorter pauses for energy
    result = result.replace(/<break time="(\d+)ms"\/>/g, (_match, ms) => {
      const adjusted = Math.round(parseInt(ms) * 0.8);
      return `<break time="${adjusted}ms"/>`;
    });

    getLogger().debug('Voice tone: ENERGETIC (matching user excitement)');
    return result;
  }

  // =========================================================================
  // CONFUSION / UNCERTAINTY - Be clear and patient
  // =========================================================================
  if (userEmotion === 'confused' || userEmotion === 'uncertain' || userEmotion === 'hesitant') {
    // Use curious emotion (engaged, helpful tone)
    result = result.replace(/<emotion value="[^"]+"/g, '<emotion value="curious"');

    // Slow down for clarity
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.88"/>${result}`;
    }

    // Add pauses between ideas for processing time
    result = result.replace(/, /g, ',<break time="200ms"/> ');

    getLogger().debug('Voice tone: PATIENT (helping confused user)');
    return result;
  }

  // =========================================================================
  // ANGER / FRUSTRATION - Stay calm, don't escalate
  // =========================================================================
  if (userEmotion === 'angry' || userEmotion === 'frustrated' || userEmotion === 'irritated') {
    // Use affectionate (staying warm) with very steady pacing
    result = result.replace(/<emotion value="[^"]+"/g, '<emotion value="affectionate"');

    // Slow, steady pace - don't match the frustration
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.85"/>${result}`;
    }

    // Longer pauses for de-escalation
    result = result.replace(/\. /g, '.<break time="400ms"/> ');

    getLogger().debug('Voice tone: STEADY (calming frustrated user)');
    return result;
  }

  // =========================================================================
  // HEAVY TOPICS or SUPPORTING PHASE - Be gentle regardless
  // =========================================================================
  if (context.topicWeight === 'heavy' || context.conversationPhase === 'supporting') {
    result = result.replace(/<emotion value="[^"]+"/g, '<emotion value="sad"');
    getLogger().debug('Voice tone: GENTLE (heavy topic/support)');
    return result;
  }

  // =========================================================================
  // LOW ENERGY USER - Mirror calmness
  // =========================================================================
  if (context.userEnergy === 'low') {
    result = result.replace(/<emotion value="affectionate"\/>/g, (match) => {
      return `${match}<speed ratio="${Math.max(0.7, context.baseSpeed * 0.9).toFixed(2)}"/>`;
    });
    getLogger().debug('Voice tone: CALM (matching low energy user)');
    return result;
  }

  return result;
}

// ============================================================================
// SPECIALIZED TAGGERS
// ============================================================================

/**
 * Tag greeting specifically - warmer, slower
 */
export function tagGreeting(text: string, context: SpeechContext, personaId?: string): string {
  // Greetings should be extra warm and slow
  const greetingContext: SpeechContext = {
    ...context,
    baseSpeed: Math.min(context.baseSpeed, 0.8),
    pauseMultiplier: context.pauseMultiplier * 1.2,
    emotionIntensity: 0.9,
  };

  return tagTextWithSsmlAdaptive(text, greetingContext, personaId);
}

/**
 * Tag emotional support response - very gentle
 */
export function tagSupportResponse(
  text: string,
  context: SpeechContext,
  personaId?: string
): string {
  const supportContext: SpeechContext = {
    ...context,
    baseSpeed: 0.75,
    pauseMultiplier: 1.5,
    allowLaughter: false,
    emotionIntensity: 0.5,
  };

  return tagTextWithSsmlAdaptive(text, supportContext, personaId);
}

/**
 * Tag advice/wisdom - measured, thoughtful
 */
export function tagAdvice(text: string, context: SpeechContext, personaId?: string): string {
  const adviceContext: SpeechContext = {
    ...context,
    baseSpeed: Math.min(context.baseSpeed, 0.85),
    pauseMultiplier: 1.3,
  };

  return tagTextWithSsmlAdaptive(text, adviceContext, personaId);
}

/**
 * Tag story/anecdote - more dynamic
 */
export function tagStory(text: string, context: SpeechContext, personaId?: string): string {
  const storyContext: SpeechContext = {
    ...context,
    baseSpeed: context.baseSpeed * 1.05, // Slightly faster for stories
    allowLaughter: true,
    emotionIntensity: 0.85,
  };

  return tagTextWithSsmlAdaptive(text, storyContext, personaId);
}

/**
 * Tag wrap-up/goodbye - warm, unhurried
 */
export function tagWrapUp(text: string, context: SpeechContext, personaId?: string): string {
  const wrapUpContext: SpeechContext = {
    ...context,
    baseSpeed: 0.78,
    pauseMultiplier: 1.4,
    emotionIntensity: 0.9,
  };

  return tagTextWithSsmlAdaptive(text, wrapUpContext, personaId);
}

// ============================================================================
// PHASE-SPECIFIC PERSONALITY TAGGING
// ============================================================================

/**
 * Apply conversation phase personality to text with SSML
 * Maps conversation phases to Jack's authentic voice modes
 */
export function applyPhasePersonality(
  text: string,
  phase: ConversationPhase,
  context: SpeechContext
): string {
  switch (phase) {
    case 'greeting':
      // Warm welcome - slower, warmer, more pauses, affectionate
      return tagGreetingWithPersonality(text, {
        speedRatio: 0.85,
        pauseMultiplier: 1.3,
        emotion: 'affectionate',
        volumeRatio: 1.0,
      });

    case 'warming_up':
      // Curious friend - natural pace, curious emotion
      return `<emotion value="curious"><speed ratio="0.88">${text}</speed></emotion>`;

    case 'exploring':
      // Engaged listener - measured pace, curious/interested
      return `<emotion value="curious"><speed ratio="0.88"><volume ratio="0.95">${text}</volume></speed></emotion>`;

    case 'advising':
      // Wise counselor - slower, measured, NO emotion tag (let content speak)
      return tagAdviceWithPersonality(text, {
        speedRatio: 0.82,
        pauseMultiplier: 1.2,
        volumeRatio: 0.95,
      });

    case 'supporting':
      // Tender elder - very slow, soft volume, sad emotion for empathy
      return tagSupportWithPersonality(text, {
        speedRatio: 0.75,
        volumeRatio: 0.85,
        pauseMultiplier: 1.5,
        emotion: 'sad', // Cartesia uses 'sad' for empathy
      });

    case 'wrapping_up':
      // Warm farewell - slow, warm, affectionate
      return tagWrapUpWithPersonality(text, {
        speedRatio: 0.85,
        emotion: 'affectionate',
        pauseMultiplier: 1.2,
      });

    case 'follow_up':
      // Reconnecting friend - warm, pleased to see them
      return `<emotion value="affectionate"><speed ratio="0.88">${text}</speed></emotion>`;

    default:
      return text;
  }
}

/**
 * Tag greeting with personality - warm pauses and affection
 */
export function tagGreetingWithPersonality(
  text: string,
  options: {
    speedRatio?: number;
    pauseMultiplier?: number;
    emotion?: string;
    volumeRatio?: number;
  }
): string {
  const speed = options.speedRatio || 0.85;
  const emotion = options.emotion || 'affectionate';
  const volume = options.volumeRatio || 1.0;

  // Add natural greeting pauses
  const tagged = text.replace(
    /\b(Hi|Hello|Good morning|Good afternoon|Good evening)\b/i,
    `$1<break time="200ms"/>`
  );

  return `<emotion value="${emotion}"><speed ratio="${speed}"><volume ratio="${volume}">${tagged}</volume></speed></emotion>`;
}

/**
 * Tag support response with personality - gentle, empathetic, slow
 */
export function tagSupportWithPersonality(
  text: string,
  options: {
    speedRatio?: number;
    volumeRatio?: number;
    pauseMultiplier?: number;
    emotion?: string;
  }
): string {
  const speed = options.speedRatio || 0.75;
  const volume = options.volumeRatio || 0.85;
  const emotion = options.emotion || 'sad';

  // Add extra pauses for breathing room
  let tagged = text.replace(/\.\s+/g, '.<break time="400ms"/> ');
  tagged = tagged.replace(/,\s+/g, ',<break time="250ms"/> ');

  return `<emotion value="${emotion}"><speed ratio="${speed}"><volume ratio="${volume}">${tagged}</volume></speed></emotion>`;
}

/**
 * Tag advice with personality - measured, thoughtful pauses
 */
export function tagAdviceWithPersonality(
  text: string,
  options: {
    speedRatio?: number;
    pauseMultiplier?: number;
    volumeRatio?: number;
  }
): string {
  const speed = options.speedRatio || 0.82;
  const volume = options.volumeRatio || 0.95;

  // Add thoughtful pauses before key points
  const tagged = text.replace(
    /\b(Here's what I think|Let me tell you|The truth is|You know what)\b/i,
    `<break time="300ms"/>$1`
  );

  return `<speed ratio="${speed}"><volume ratio="${volume}">${tagged}</volume></speed>`;
}

/**
 * Tag wrap-up with personality - warm, affectionate farewell
 */
export function tagWrapUpWithPersonality(
  text: string,
  options: {
    speedRatio?: number;
    emotion?: string;
    pauseMultiplier?: number;
  }
): string {
  const speed = options.speedRatio || 0.85;
  const emotion = options.emotion || 'affectionate';

  // Add warm pauses
  const tagged = text.replace(
    /\b(Take care|Good luck|Until next time|God bless)\b/i,
    `$1<break time="300ms"/>`
  );

  return `<emotion value="${emotion}"><speed ratio="${speed}">${tagged}</speed></emotion>`;
}

// ============================================================================
// COGNITIVE-AWARE SSML TAGGING
// ============================================================================

export interface CognitiveSsmlOptions {
  /** Speech context with pacing, energy, etc. */
  speechContext: SpeechContext;
  /** Cognitive guidance from the cognitive engine */
  cognitiveGuidance?: CognitiveGuidance;
  /** Persona ID for persona-specific SSML */
  personaId?: string;
  /** Session ID for tracking */
  sessionId?: string;
  /** Emotional weight of conversation */
  emotionalWeight?: number;
  /** Base speech characteristics from persona */
  baseCharacteristics?: {
    baseSpeedMultiplier: number;
    pauseMultiplier: number;
    thinkingSoundFrequency: number;
    emphasisStyle: 'subtle' | 'moderate' | 'pronounced';
    sentenceEndingStyle: 'natural' | 'falling' | 'rising';
    minimumEnergy: number;
    maximumEnergy: number;
    speedVariation: number;
  };
}

/**
 * Tag text with SSML, applying cognitive intelligence adjustments.
 *
 * This is the recommended entry point for cognitive-aware speech generation.
 * It combines:
 * - Base SSML tagging
 * - Persona-specific characteristics
 * - Cognitive state adjustments (reasoning mode, confidence, etc.)
 */
export function tagTextWithCognitiveSsml(
  text: string,
  options: CognitiveSsmlOptions
): { ssml: string; cognitiveResult?: CognitiveSpeechResult } {
  const { speechContext, cognitiveGuidance, personaId, sessionId, emotionalWeight, baseCharacteristics } = options;

  if (!text || text.trim().length === 0) {
    return { ssml: text };
  }

  // First, apply base SSML tagging
  let tagged = tagTextWithSsmlAdaptive(text, speechContext, personaId);

  // If we have cognitive guidance and session, apply cognitive adjustments
  let cognitiveResult: CognitiveSpeechResult | undefined;

  if (cognitiveGuidance && sessionId && baseCharacteristics) {
    const cognitiveInput: CognitiveSpeechInput = {
      speechContext,
      baseCharacteristics,
      cognitiveGuidance,
      emotionalWeight: emotionalWeight || 0.3,
    };

    cognitiveResult = applyCognitiveSpeechAdjustments(cognitiveInput, sessionId);

    // Apply cognitive SSML (thinking sounds, pauses)
    tagged = buildCognitiveSSML(tagged, cognitiveResult);

    // Log cognitive speech adjustments
    getLogger().debug({
      personaId,
      cognitiveMode: cognitiveResult.debug.cognitiveMode,
      confidence: cognitiveResult.debug.confidence,
      speedMult: cognitiveResult.debug.adjustments.speedMultiplier,
      pauseMult: cognitiveResult.debug.adjustments.pauseMultiplier,
    }, '🧠 Cognitive SSML applied');
  }

  return { ssml: tagged, cognitiveResult };
}

/**
 * Get cognitive speech stats for monitoring
 */
export { getCognitiveSpeechStats, clearCognitiveSpeechState } from './cognitive-speech-integration.js';

export default {
  tagTextWithSsmlAdaptive,
  tagTextWithCognitiveSsml,
  tagGreeting,
  tagSupportResponse,
  tagAdvice,
  tagStory,
  tagWrapUp,
  applyPhasePersonality,
  tagGreetingWithPersonality,
  tagSupportWithPersonality,
  tagAdviceWithPersonality,
  tagWrapUpWithPersonality,
};
