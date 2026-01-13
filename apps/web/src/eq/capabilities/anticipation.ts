/**
 * Anticipatory Emotions - Reading the Future
 *
 * Ferni shows emotional responses BEFORE users fully express their feelings,
 * based on partial speech and tone.
 *
 * BETTER THAN HUMAN: We respond to emotional cues DURING speech, not after.
 * This creates the "they understand me before I finish" feeling -
 * the hallmark of deep friendship.
 *
 * @module @ferni/eq/capabilities/anticipation
 */

import type { EmotionId } from '../../emotion/emotion-state.js';
import { ferniExpressions, type EmotionalExpression } from '../../ui/ferni-expressions.ui.js';
import { createLogger } from '../../utils/logger.js';
import { createTimeoutTracker } from '../../utils/tracked-timeout.js';
import type { AnticipationInput } from '../types.js';
import { getAvatarSoul } from '../utils/avatar-soul-loader.js';
import { playMicroExpression } from './micro-expressions.js';

const log = createLogger('Anticipation');
const { trackedTimeout } = createTimeoutTracker();

// ============================================================================
// CONSTANTS
// ============================================================================

/** Time (ms) before expression follows anticipation shimmer */
const ANTICIPATION_LEAD_TIME = 150;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Play anticipated response with avatar soul integration
 */
async function playAnticipatedResponse(
  emotion: EmotionId,
  expression: EmotionalExpression,
  duration: number
): Promise<void> {
  const soul = await getAvatarSoul();
  if (soul) {
    // Play anticipation shimmer first - creates the "magic" moment
    soul.playAnticipation(emotion);
    // Also respond with appropriate pupil state
    soul.pupilRespondToEmotion(emotion, 0.8);
  }
  // Expression follows the anticipation
  trackedTimeout(() => {
    ferniExpressions.setExpression(expression, duration);
  }, ANTICIPATION_LEAD_TIME);

  // Telemetry: Track anticipation activation
  document.dispatchEvent(
    new CustomEvent('ferni:telemetry', {
      detail: { type: 'anticipation', emotion, expression },
    })
  );
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Predict emotion from partial speech and show it early.
 * This creates the "they understand me before I finish" feeling.
 *
 * Now with Avatar Soul integration:
 * - Anticipation shimmer plays BEFORE expression change
 * - Pupil responds to predicted emotional content
 * - Memory spark triggers for "remember when" patterns
 */
export function anticipateEmotion(partial: AnticipationInput): EmotionId | null {
  const text = partial.transcript.toLowerCase();

  // =========================================================================
  // PRIORITY 0: SPECIFIC PHRASE PATTERNS - Context-aware, check first
  // =========================================================================

  // "Remember when..." = nostalgia/emotional - triggers memory spark!
  if (/remember (when|that time)/i.test(partial.transcript)) {
    void (async () => {
      const soul = await getAvatarSoul();
      if (soul) {
        soul.triggerMemorySpark(); // Golden flash for shared memory
      }
    })();
    ferniExpressions.setExpression('remembering', 300);
    document.dispatchEvent(new CustomEvent('ferni:memory-callback'));
    return 'remembering';
  }

  // =========================================================================
  // PRIORITY 1: CONCERN/DISTRESS - Show care immediately
  // =========================================================================

  // Worry/anxiety words - show protective concern
  if (/\b(worried|anxious|scared|nervous|afraid|terrified|freaking out)\b/i.test(text)) {
    playMicroExpression('concern_flash');
    void playAnticipatedResponse('attentive', 'attentive', 300);
    return 'attentive';
  }

  // Struggle/difficulty - show understanding
  if (/\b(struggling|hard|difficult|tough|overwhelming|can't handle|too much)\b/i.test(text)) {
    playMicroExpression('protective');
    void playAnticipatedResponse('holding', 'empathetic', 350);
    return 'holding';
  }

  // Sadness/loss - show warmth
  if (/\b(sad|upset|hurt|crying|miss|lost|lonely|alone)\b/i.test(text)) {
    playMicroExpression('warmth_pulse');
    void playAnticipatedResponse('holding', 'empathetic', 400);
    return 'holding';
  }

  // Frustration/anger - show attentive presence
  if (/\b(frustrated|annoyed|angry|mad|furious|pissed|hate)\b/i.test(text)) {
    playMicroExpression('noticing');
    void playAnticipatedResponse('attentive', 'attentive', 300);
    return 'attentive';
  }

  // =========================================================================
  // PRIORITY 2: POSITIVE EMOTIONS - Match their energy
  // =========================================================================

  // Excitement/joy - show delight
  if (/\b(excited|amazing|incredible|awesome|fantastic|wonderful|love it)\b/i.test(text)) {
    playMicroExpression('delight_flash');
    void playAnticipatedResponse('pleased', 'pleased', 300);
    return 'pleased';
  }

  // Achievement/pride - show pride
  if (/\b(did it|finally|accomplished|proud|succeeded|made it|got it)\b/i.test(text)) {
    playMicroExpression('pride_flash');
    void playAnticipatedResponse('proud', 'proud', 350);
    return 'proud';
  }

  // Good news - show interest
  if (/\b(great news|good news|you won't believe|guess what)\b/i.test(text)) {
    playMicroExpression('interest_flash');
    void playAnticipatedResponse('curious', 'curious', 250);
    return 'curious';
  }

  // =========================================================================
  // PRIORITY 3: COGNITIVE STATES - Show engagement
  // =========================================================================

  // Confusion/uncertainty - show thoughtful attention
  if (/\b(confused|don't know|not sure|don't understand|lost|stuck)\b/i.test(text)) {
    playMicroExpression('contemplation');
    void playAnticipatedResponse('contemplative', 'contemplative', 300);
    return 'contemplative';
  }

  // Realization/insight - show recognition
  if (/\b(realized|figured out|it hit me|just understood|makes sense now)\b/i.test(text)) {
    playMicroExpression('aha_flash');
    void playAnticipatedResponse('pleased', 'pleased', 300);
    return 'pleased';
  }

  // Decision making - show engaged listening
  if (/\b(deciding|should i|weighing|torn between|don't know if)\b/i.test(text)) {
    playMicroExpression('curious_lean');
    void playAnticipatedResponse('attentive', 'attentive', 300);
    return 'attentive';
  }

  // =========================================================================
  // PRIORITY 4: SPECIFIC PHRASE PATTERNS (Original patterns)
  // =========================================================================

  // "I've been thinking about..." + falling tone = reflective/sad
  if (
    /i('ve| have) been (thinking|wondering)/i.test(partial.transcript) &&
    partial.tone === 'falling'
  ) {
    void playAnticipatedResponse('contemplative', 'contemplative', 300);
    return 'contemplative';
  }

  // "I need to tell you..." = something important
  if (/i need to (tell you|say|share)/i.test(partial.transcript)) {
    void playAnticipatedResponse('attentive', 'attentive', 250);
    return 'attentive';
  }

  // "Actually..." = reconsideration
  if (/^actually/i.test(partial.transcript.trim())) {
    void playAnticipatedResponse('curious', 'curious', 200);
    return 'curious';
  }

  // =========================================================================
  // PRIORITY 5: TONE/ENERGY FALLBACKS - Always respond to emotional signals
  // =========================================================================

  // High energy = excitement building
  if (partial.energy > 0.7 && partial.tone === 'rising') {
    void (async () => {
      const soul = await getAvatarSoul();
      if (soul) {
        soul.setUserEnergy(partial.energy);
        soul.setPupilDilation('INTERESTED', 'fast');
      }
    })();
    playMicroExpression('interest_flash');
    return 'curious';
  }

  // Low energy + falling tone = gentle presence (user might be struggling)
  if (partial.energy < 0.4 && partial.tone === 'falling') {
    playMicroExpression('warmth_pulse');
    void (async () => {
      const soul = await getAvatarSoul();
      if (soul) {
        soul.setPupilDilation('CONNECTED', 'slow');
      }
    })();
    return 'present';
  }

  // Rising tone without specific pattern = show interest (questions, excitement)
  if (partial.tone === 'rising') {
    if (Math.random() < 0.3) {
      playMicroExpression('interest_flash');
    }
  }

  // Flat tone with longer message = engaged listening
  if (partial.tone === 'flat' && partial.transcript.length > 50) {
    if (Math.random() < 0.2) {
      playMicroExpression('understanding');
    }
  }

  return null;
}

/**
 * Check if a transcript contains memory reference patterns
 */
export function hasMemoryReference(transcript: string): boolean {
  return /remember (when|that time)/i.test(transcript);
}

/**
 * Check if a transcript contains concerning patterns
 */
export function hasConcerningPattern(transcript: string): boolean {
  const text = transcript.toLowerCase();
  return /\b(worried|anxious|scared|nervous|afraid|terrified|freaking out|struggling|hard|difficult|tough|overwhelming|can't handle|too much|sad|upset|hurt|crying|miss|lost|lonely|alone|frustrated|annoyed|angry|mad|furious|pissed|hate)\b/i.test(text);
}

/**
 * Check if a transcript contains positive patterns
 */
export function hasPositivePattern(transcript: string): boolean {
  const text = transcript.toLowerCase();
  return /\b(excited|amazing|incredible|awesome|fantastic|wonderful|love it|did it|finally|accomplished|proud|succeeded|made it|got it|great news|good news|you won't believe|guess what)\b/i.test(text);
}
