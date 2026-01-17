/**
 * Micro-Expressions - Subliminal Emotional Flashes
 *
 * Micro-expressions last 40-150ms - below conscious perception but
 * affecting how the user *feels* about Ferni's emotional authenticity.
 *
 * These are the "Better than Human" subliminal trust builders.
 * Real humans display micro-expressions that reveal true emotions.
 * By replicating this, Ferni feels genuine without users knowing why.
 *
 * @module @ferni/eq/capabilities/micro-expressions
 */

import { emotionState, type EmotionId } from '../../emotion/emotion-state.js';
import { soulStatsService } from '../../services/soul-stats.service.js';
import { ferniExpressions, type EmotionalExpression } from '../../ui/ferni-expressions.ui.js';
import { createLogger } from '../../utils/logger.js';
import { createTimeoutTracker } from '../../utils/tracked-timeout.js';
import type { MicroExpression, MicroExpressionTriggerContent } from '../types.js';
import { getAvatarSoul } from '../utils/avatar-soul-loader.js';

const log = createLogger('MicroExpressions');
const { trackedTimeout } = createTimeoutTracker();

// ============================================================================
// TIMING ENFORCEMENT
// Brand requirement: 40-150ms for subliminal trust building
// ============================================================================

/** Minimum micro-expression duration (ms) - below this is imperceptible */
export const MICRO_EXPRESSION_MIN_MS = 40;

/** Maximum micro-expression duration (ms) - above this is consciously noticeable */
export const MICRO_EXPRESSION_MAX_MS = 150;

/**
 * Enforce micro-expression timing within brand guidelines (40-150ms)
 * This ensures expressions are subliminal - felt but not consciously seen
 */
export function enforceMicroExpressionTiming(requestedDuration: number): number {
  const enforced = Math.max(
    MICRO_EXPRESSION_MIN_MS,
    Math.min(MICRO_EXPRESSION_MAX_MS, requestedDuration)
  );

  if (requestedDuration !== enforced) {
    log.debug('Micro-expression timing enforced:', {
      requested: requestedDuration,
      enforced,
      reason: requestedDuration < MICRO_EXPRESSION_MIN_MS ? 'too_short' : 'too_long',
    });
  }

  return enforced;
}

// ============================================================================
// MICRO-EXPRESSION DEFINITIONS
// ============================================================================

export const MICRO_EXPRESSIONS: Record<string, MicroExpression> = {
  // =========================================================================
  // RECOGNITION & CONNECTION
  // =========================================================================

  // Recognition flash when user mentions something familiar
  recognition: {
    expression: 'curious',
    duration: 80,
    intensity: 0.4,
    probability: 0.7,
  },

  // Memory callback - when something triggers shared history
  memory_spark: {
    expression: 'remembering',
    duration: 100,
    intensity: 0.5,
    probability: 0.8,
  },

  // Inside joke recognition - brief knowing look
  insider: {
    expression: 'warm',
    duration: 90,
    intensity: 0.4,
    probability: 0.75,
  },

  // =========================================================================
  // CONCERN & CARE
  // =========================================================================

  // Brief concern flash before empathy kicks in
  concern_flash: {
    expression: 'worried',
    duration: 60,
    intensity: 0.3,
    probability: 0.8,
  },

  // Protective instinct - when sensing vulnerability
  protective: {
    expression: 'attentive',
    duration: 70,
    intensity: 0.35,
    probability: 0.7,
  },

  // "I noticed that" - catching something unsaid
  noticing: {
    expression: 'noticing',
    duration: 80,
    intensity: 0.4,
    probability: 0.65,
  },

  // =========================================================================
  // POSITIVE EMOTIONS
  // =========================================================================

  // Micro-delight when user achieves something
  delight_flash: {
    expression: 'pleased',
    duration: 100,
    intensity: 0.5,
    probability: 0.9,
  },

  // Pride on behalf of user
  pride_flash: {
    expression: 'proud',
    duration: 110,
    intensity: 0.45,
    probability: 0.85,
  },

  // Tiny warmth pulse during connection
  warmth_pulse: {
    expression: 'warm',
    duration: 120,
    intensity: 0.3,
    probability: 0.6,
  },

  // =========================================================================
  // CURIOSITY & ENGAGEMENT
  // =========================================================================

  // Brief surprise/interest at unexpected content
  interest_flash: {
    expression: 'curious',
    duration: 70,
    intensity: 0.4,
    probability: 0.5,
  },

  // "Tell me more" lean-in
  curious_lean: {
    expression: 'curiousLean',
    duration: 130,
    intensity: 0.5,
    probability: 0.6,
  },

  // Processing something complex/deep
  contemplation: {
    expression: 'contemplative',
    duration: 140,
    intensity: 0.35,
    probability: 0.55,
  },

  // =========================================================================
  // UNDERSTANDING & VALIDATION
  // =========================================================================

  // "I get it" moment
  understanding: {
    expression: 'warm',
    duration: 85,
    intensity: 0.4,
    probability: 0.7,
  },

  // Validation pulse - "that makes sense"
  validation: {
    expression: 'encouraging',
    duration: 95,
    intensity: 0.35,
    probability: 0.65,
  },

  // Moment of insight recognition
  aha_flash: {
    expression: 'pleased',
    duration: 90,
    intensity: 0.5,
    probability: 0.8,
  },

  // =========================================================================
  // LIFE COACHING - Better-Than-Human Life Support
  // =========================================================================

  // Hope holding - when user expresses hopelessness, steady unwavering presence
  hope_holding: {
    expression: 'warm',
    duration: 140,
    intensity: 0.6,
    probability: 0.95,
  },

  // Steady presence - for loneliness/isolation, "I'm here with you"
  steady_presence: {
    expression: 'attentive',
    duration: 150,
    intensity: 0.5,
    probability: 0.9,
  },

  // Courage support - before difficult conversations, "you've got this"
  courage_support: {
    expression: 'encouraging',
    duration: 120,
    intensity: 0.5,
    probability: 0.85,
  },

  // Rest permission - for burnout/exhaustion, soft acceptance
  rest_permission: {
    expression: 'warm',
    duration: 130,
    intensity: 0.4,
    probability: 0.8,
  },

  // Transition witness - for major life changes, holding space for contradictions
  transition_witness: {
    expression: 'contemplative',
    duration: 140,
    intensity: 0.45,
    probability: 0.85,
  },

  // Comeback recognition - celebrating progress in rebuilding
  comeback_recognition: {
    expression: 'proud',
    duration: 100,
    intensity: 0.55,
    probability: 0.9,
  },
};

// ============================================================================
// EMOTION TO EXPRESSION MAP
// ============================================================================

const EMOTION_TO_EXPRESSION: Record<EmotionId, EmotionalExpression> = {
  neutral: 'neutral',
  happy: 'happy',
  excited: 'excited',
  curious: 'curious',
  thinking: 'thinking',
  calm: 'empathetic',
  sad: 'sad',
  frustrated: 'worried',
  listening: 'attentive',
  speaking: 'neutral',
  contemplative: 'contemplative',
  noticing: 'noticing',
  holdingSpace: 'holdingSpace',
  attentive: 'attentive',
  absorbing: 'absorbing',
  receiving: 'receiving',
  curiousLean: 'curiousLean',
  warm: 'warm',
  pleased: 'pleased',
  delighted: 'happy',
  proud: 'proud',
  celebrating: 'celebrating',
  present: 'present',
  holding: 'holding',
  accompanying: 'accompanying',
  waiting: 'waiting',
  encouraging: 'encouraging',
  challenging: 'challenging',
  reflecting: 'reflecting',
  recognizing: 'noticing',
  remembering: 'remembering',
  reconnecting: 'warm',
  insider: 'warm',
  growing: 'pleased',
  processing: 'processing',
  realizing: 'curious',
  shifting: 'present',
  settling: 'neutral',
};

// ============================================================================
// MICRO-EXPRESSION TYPES (for export)
// ============================================================================

export type MicroExpressionType = keyof typeof MICRO_EXPRESSIONS;

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Play a micro-expression - subliminal emotional flash.
 * These are intentionally barely perceptible but affect trust building.
 *
 * TIMING ENFORCEMENT: All micro-expressions are clamped to 40-150ms
 * as required by brand guidelines for subliminal trust building.
 *
 * Now integrated with Avatar Soul for enhanced visual feedback:
 * - Pupil dilation for interest/concern
 * - Iris shimmer flash for recognition
 * - Anticipation shimmer for emotional preparation
 */
export function playMicroExpression(type: MicroExpressionType): void {
  const micro = MICRO_EXPRESSIONS[type];
  if (!micro) return;

  // Probability check
  if (Math.random() > micro.probability) return;

  // ENFORCE TIMING: Micro-expressions MUST be 40-150ms (subliminal)
  const enforcedDuration = enforceMicroExpressionTiming(micro.duration);

  // Telemetry: Track micro-expression activation
  document.dispatchEvent(
    new CustomEvent('ferni:telemetry', {
      detail: { type: 'micro_expression', expressionType: type, duration: enforcedDuration },
    })
  );

  // Play the micro-expression with enforced timing
  ferniExpressions.setExpression(micro.expression, enforcedDuration / 3);

  // Track micro-expression for admin stats
  soulStatsService.recordMicroExpression(type);

  // Avatar Soul integration - enhance with visual effects
  void (async () => {
    const soul = await getAvatarSoul();
    if (!soul) return;

    // Map micro-expression types to avatar soul effects
    switch (type) {
      case 'recognition':
      case 'memory_spark':
      case 'insider':
        soul.flashShimmer(0.8);
        soul.setPupilDilation('INTERESTED', 'fast');
        break;

      case 'concern_flash':
      case 'protective':
      case 'noticing':
        soul.setPupilDilation('NEUTRAL', 'fast');
        soul.setGlowBleed(0.25, 'rgba(166, 122, 106, 0.45)');
        break;

      case 'delight_flash':
      case 'pride_flash':
      case 'aha_flash':
        soul.setPupilDilation('DILATED', 'fast');
        soul.flashShimmer(1.0);
        soul.setGlowBleed(0.3, 'rgba(196, 162, 101, 0.5)');
        break;

      case 'warmth_pulse':
      case 'understanding':
      case 'validation':
        soul.setPupilDilation('CONNECTED', 'slow');
        soul.setGlowBleed(0.2, 'rgba(196, 162, 101, 0.4)');
        break;

      case 'interest_flash':
      case 'curious_lean':
        soul.setPupilDilation('INTERESTED', 'fast');
        break;

      case 'contemplation':
        soul.setPupilDilation('CONTRACTED', 'slow');
        soul.glanceAway(400);
        break;
    }
  })();

  // Quick return to previous state after enforced micro-expression duration
  trackedTimeout(() => {
    const currentEmotion = emotionState.emotion.id;
    ferniExpressions.setExpression(
      EMOTION_TO_EXPRESSION[currentEmotion] || 'neutral',
      enforcedDuration
    );

    // Reset avatar soul state after micro-expression
    void (async () => {
      const soul = await getAvatarSoul();
      if (soul) {
        soul.setPupilDilation('NEUTRAL', 'slow');
        soul.setGlowBleed(0.1);
      }
    })();
  }, enforcedDuration);

  log.debug('Micro-expression:', type, `${enforcedDuration}ms`);
}

/**
 * Trigger micro-expression based on detected content.
 * Call this from speech analysis.
 *
 * Enhanced for "Better than Human" with nuanced detection:
 * - Achievement recognition → pride/delight
 * - Insight moments → aha flash
 * - Vulnerable shares → protective/warmth
 * - Deep processing → contemplation
 */
export function detectAndTriggerMicroExpression(content: MicroExpressionTriggerContent): void {
  // Priority 1: Vulnerable sharing - show protective care
  if (content.isVulnerable) {
    playMicroExpression('protective');
    trackedTimeout(() => playMicroExpression('warmth_pulse'), 200);
    return;
  }

  // Priority 2: Achievement - show genuine pride
  if (content.hasAchievement) {
    playMicroExpression('pride_flash');
    if (Math.random() < 0.4) {
      trackedTimeout(() => playMicroExpression('delight_flash'), 150);
    }
    return;
  }

  // Priority 3: Insight moment - show recognition
  if (content.hasInsight) {
    playMicroExpression('aha_flash');
    return;
  }

  // Priority 4: Deep processing - show contemplation
  if (content.isProcessingDeep) {
    playMicroExpression('contemplation');
    return;
  }

  // Priority 5: Memory callback - recognition
  if (content.mentionedMemory) {
    playMicroExpression('memory_spark');
    return;
  }

  // Priority 6: Emotional content - show concern
  if (content.tone === 'emotional') {
    playMicroExpression('noticing');
    return;
  }

  // Priority 7: Negative tone - show concern
  if (content.tone === 'negative') {
    playMicroExpression('concern_flash');
    return;
  }

  // Priority 8: New topic - show interest
  if (content.isNewTopic) {
    playMicroExpression('curious_lean');
    return;
  }

  // Priority 9: High intensity positive - delight
  if (content.tone === 'positive' && content.intensity && content.intensity > 0.6) {
    playMicroExpression('delight_flash');
    return;
  }

  // Priority 10: General positive - occasional warmth
  if (content.tone === 'positive' && Math.random() < 0.25) {
    const warmExpressions = ['warmth_pulse', 'understanding', 'validation'] as const;
    const index = Math.floor(Math.random() * warmExpressions.length);
    const choice = warmExpressions[index];
    if (choice) {
      playMicroExpression(choice);
    }
  }
}
