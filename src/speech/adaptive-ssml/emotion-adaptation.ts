/**
 * Emotion Adaptation
 *
 * Voice tone matching based on user emotional state.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { SpeechContext } from '../speech-context.js';

// ============================================================================
// EMOTION ADAPTATION - VOICE TONE MATCHING
// ============================================================================

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
export function applyEmotionAdaptation(text: string, context: SpeechContext): string {
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
