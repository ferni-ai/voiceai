/**
 * Emotion Adaptation
 *
 * Voice tone matching based on user emotional state.
 * Uses Cartesia Sonic-3's FULL 50+ emotion palette for richer expression.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags#emotion-beta
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { SpeechContext } from '../speech-context.js';

// ============================================================================
// CARTESIA SONIC-3 EMOTIONS - FULL PALETTE
// Using the complete emotion set for genuinely human expression
// ============================================================================

/**
 * Cartesia Sonic-3 supported emotions by category
 */
const EMOTIONS = {
  // Warm/Supportive
  affectionate: 'affectionate',
  sympathetic: 'sympathetic',
  trust: 'trust',
  calm: 'calm',
  peaceful: 'peaceful',
  serene: 'serene',
  content: 'content',
  grateful: 'grateful',

  // Engaged/Curious
  curious: 'curious',
  anticipation: 'anticipation',
  surprised: 'surprised',
  amazed: 'amazed',

  // Joyful/Energetic
  happy: 'happy',
  excited: 'excited',
  enthusiastic: 'enthusiastic',
  elated: 'elated',
  triumphant: 'triumphant',
  joking: 'joking',

  // Sad/Empathetic
  sad: 'sad',
  melancholic: 'melancholic',
  dejected: 'dejected',
  disappointed: 'disappointed',
  nostalgic: 'nostalgic',
  wistful: 'wistful',

  // Uncertain/Thoughtful
  hesitant: 'hesitant',
  confused: 'confused',
  resigned: 'resigned',
  apologetic: 'apologetic',
  insecure: 'insecure',

  // Other
  tired: 'tired',
  bored: 'bored',
} as const;

// ============================================================================
// EMOTION ADAPTATION - VOICE TONE MATCHING
// ============================================================================

/**
 * Apply emotion adaptation - VOICE TONE MATCHING
 *
 * Uses nuanced emotions to create genuine human connection:
 * - Sad user → Sympathetic, gentle, slower
 * - Stressed user → Calm, serene, reassuring
 * - Excited user → Enthusiastic, matching energy
 * - Thinking → Curious, engaged
 * - Heavy topics → Sympathetic, patient
 */
export function applyEmotionAdaptation(text: string, context: SpeechContext): string {
  let result = text;
  const userEmotion = context.userEmotion?.toLowerCase() || 'neutral';

  // =========================================================================
  // SADNESS / GRIEF - Be genuinely sympathetic
  // =========================================================================
  if (userEmotion === 'sad' || userEmotion === 'grief' || userEmotion === 'disappointed') {
    // Use 'sympathetic' for empathy, 'melancholic' for deeper connection
    const emotion = userEmotion === 'grief' ? EMOTIONS.melancholic : EMOTIONS.sympathetic;
    result = wrapWithEmotion(result, emotion);

    // Slow way down for gentleness
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.82"/>${result}`;
    }

    // Add longer pauses for breathing room and presence
    result = result.replace(/\. /g, '.<break time="450ms"/> ');
    result = result.replace(/\.\s*$/g, '.<break time="550ms"/>');

    getLogger().debug({ emotion }, 'Voice tone: SYMPATHETIC (matching user sadness)');
    return result;
  }

  // =========================================================================
  // STRESS / ANXIETY - Be calm and grounding
  // =========================================================================
  if (
    userEmotion === 'stressed' ||
    userEmotion === 'anxious' ||
    userEmotion === 'overwhelmed' ||
    userEmotion === 'worried'
  ) {
    // Use 'calm' or 'serene' for grounding presence
    const emotion = userEmotion === 'overwhelmed' ? EMOTIONS.serene : EMOTIONS.calm;
    result = wrapWithEmotion(result, emotion);

    // Slow down significantly for calming effect
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.78"/>${result}`;
    }

    // Add grounding pauses
    result = result.replace(/\. /g, '.<break time="380ms"/> ');

    getLogger().debug({ emotion }, 'Voice tone: CALM (grounding anxious user)');
    return result;
  }

  // =========================================================================
  // EXCITEMENT / HAPPINESS - Match the energy authentically!
  // =========================================================================
  if (
    userEmotion === 'excited' ||
    userEmotion === 'happy' ||
    userEmotion === 'joy' ||
    userEmotion === 'enthusiastic'
  ) {
    // Match energy level with appropriate emotion
    const emotion =
      userEmotion === 'excited' || userEmotion === 'enthusiastic'
        ? EMOTIONS.enthusiastic
        : EMOTIONS.happy;
    result = wrapWithEmotion(result, emotion);

    // Speed up slightly for energy
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="1.08"/>${result}`;
    }

    // Shorter pauses for momentum
    result = result.replace(/<break time="(\d+)ms"\/>/g, (_match, ms) => {
      const adjusted = Math.round(parseInt(ms) * 0.75);
      return `<break time="${adjusted}ms"/>`;
    });

    getLogger().debug({ emotion }, 'Voice tone: ENTHUSIASTIC (matching user excitement)');
    return result;
  }

  // =========================================================================
  // CONFUSION / UNCERTAINTY - Be curious and patient
  // =========================================================================
  if (userEmotion === 'confused' || userEmotion === 'uncertain' || userEmotion === 'hesitant') {
    // Use curious (engaged, helpful) tone
    result = wrapWithEmotion(result, EMOTIONS.curious);

    // Slow down for clarity
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.85"/>${result}`;
    }

    // Add pauses between ideas for processing time
    result = result.replace(/, /g, ',<break time="220ms"/> ');

    getLogger().debug('Voice tone: CURIOUS (helping confused user)');
    return result;
  }

  // =========================================================================
  // ANGER / FRUSTRATION - Stay warm and grounded
  // =========================================================================
  if (userEmotion === 'angry' || userEmotion === 'frustrated' || userEmotion === 'irritated') {
    // Use 'affectionate' (staying warm) - don't mirror the frustration
    result = wrapWithEmotion(result, EMOTIONS.affectionate);

    // Slow, steady pace for de-escalation
    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.82"/>${result}`;
    }

    // Longer pauses for calming
    result = result.replace(/\. /g, '.<break time="420ms"/> ');

    getLogger().debug('Voice tone: WARM (de-escalating frustration)');
    return result;
  }

  // =========================================================================
  // NOSTALGIC / REFLECTIVE - Match the wistfulness
  // =========================================================================
  if (userEmotion === 'nostalgic' || userEmotion === 'reflective' || userEmotion === 'wistful') {
    result = wrapWithEmotion(result, EMOTIONS.nostalgic);

    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.88"/>${result}`;
    }

    // Longer pauses for reflection
    result = result.replace(/\. /g, '.<break time="400ms"/> ');

    getLogger().debug('Voice tone: NOSTALGIC (matching reflective mood)');
    return result;
  }

  // =========================================================================
  // GRATEFUL / TOUCHED - Warm acknowledgment
  // =========================================================================
  if (userEmotion === 'grateful' || userEmotion === 'touched' || userEmotion === 'moved') {
    result = wrapWithEmotion(result, EMOTIONS.grateful);

    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.90"/>${result}`;
    }

    getLogger().debug('Voice tone: GRATEFUL (acknowledging appreciation)');
    return result;
  }

  // =========================================================================
  // HEAVY TOPICS or SUPPORTING PHASE - Be genuinely present
  // =========================================================================
  if (context.topicWeight === 'heavy' || context.conversationPhase === 'supporting') {
    result = wrapWithEmotion(result, EMOTIONS.sympathetic);

    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="0.85"/>${result}`;
    }

    getLogger().debug('Voice tone: PRESENT (heavy topic/support)');
    return result;
  }

  // =========================================================================
  // LOW ENERGY USER - Mirror with calm presence
  // =========================================================================
  if (context.userEnergy === 'low') {
    result = wrapWithEmotion(result, EMOTIONS.calm);

    if (!result.includes('<speed ratio=')) {
      result = `<speed ratio="${Math.max(0.75, context.baseSpeed * 0.88).toFixed(2)}"/>${result}`;
    }

    getLogger().debug('Voice tone: PEACEFUL (matching low energy)');
    return result;
  }

  // =========================================================================
  // NEUTRAL - Default to warm, engaged tone
  // =========================================================================
  // Use a gentle, curious default for natural conversation
  if (!result.includes('<emotion')) {
    result = wrapWithEmotion(result, EMOTIONS.affectionate);
  }

  return result;
}

/**
 * Helper to wrap text with emotion tag (only if not already wrapped)
 */
function wrapWithEmotion(text: string, emotion: string): string {
  // Replace existing emotion tags
  if (text.includes('<emotion')) {
    return text.replace(/<emotion value="[^"]+"/g, `<emotion value="${emotion}"`);
  }
  // Wrap entire text in emotion
  return `<emotion value="${emotion}">${text}</emotion>`;
}
