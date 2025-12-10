/**
 * Emotion ↔ Expression Bridge
 *
 * Automatically maps emotion state changes to Ferni expressions.
 * This is the central nervous system that connects:
 * - EmotionState (the feeling) → FerniExpressions (the face)
 *
 * BRAND PHILOSOPHY:
 * - Warm, not saccharine
 * - Present, not flashy
 * - Grounded - calm, stable, reliable presence
 * - Human - natural, organic, approachable
 */

import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { createLogger } from '../utils/logger.js';
import { emotionState, type EmotionId, type EmotionState } from './emotion-state.js';

const log = createLogger('EmotionBridge');

// ============================================================================
// EMOTION → EXPRESSION MAPPING
// ============================================================================

/**
 * Maps emotion IDs to the appropriate expression function.
 * Some emotions trigger simple expressions, others trigger full reactions.
 */
const EMOTION_TO_EXPRESSION: Record<EmotionId, () => void> = {
  // Core emotions
  neutral: () => ferniExpressions.setExpression('neutral', 400),
  happy: () => ferniExpressions.happy(800),
  excited: () => ferniExpressions.excited(),
  curious: () => ferniExpressions.curious(),
  thinking: () => ferniExpressions.contemplation(),
  calm: () => ferniExpressions.setExpression('empathetic', 500),
  sad: () => ferniExpressions.sad(),
  frustrated: () => ferniExpressions.frustrated(),
  listening: () => ferniExpressions.listening(),
  speaking: () => {}, // Don't change expression during speech - let content drive it

  // Brand-aligned additions
  contemplative: () => ferniExpressions.contemplative(),
  noticing: () => ferniExpressions.notice(),
  holdingSpace: () => ferniExpressions.holdSpace(),

  // Phase 1: Listening States - Ferni's superpower
  attentive: () => ferniExpressions.setExpression('attentive', 300),
  absorbing: () => ferniExpressions.setExpression('absorbing', 400),
  receiving: () => ferniExpressions.setExpression('receiving', 400),
  curiousLean: () => ferniExpressions.setExpression('curiousLean', 300),

  // Phase 2: Warmth Gradient - Nuanced positive emotions
  warm: () => ferniExpressions.setExpression('warm', 400),
  pleased: () => ferniExpressions.setExpression('pleased', 400),
  delighted: () => ferniExpressions.delight(),
  proud: () => ferniExpressions.setExpression('proud', 500),
  celebrating: () => {
    ferniExpressions.setExpression('celebrating', 400);
    ferniExpressions.warmthSparkle();
  },

  // Phase 3: Presence States - Quality of "being with"
  present: () => ferniExpressions.setExpression('present', 400),
  holding: () => ferniExpressions.setExpression('holding', 500),
  accompanying: () => ferniExpressions.setExpression('accompanying', 400),
  waiting: () => ferniExpressions.setExpression('waiting', 500),

  // Phase 4: Coaching Emotions - Active guidance
  encouraging: () => ferniExpressions.setExpression('encouraging', 400),
  challenging: () => ferniExpressions.setExpression('challenging', 400),
  reflecting: () => ferniExpressions.setExpression('reflecting', 400),
  recognizing: () => {
    ferniExpressions.setExpression('recognizing', 400);
    ferniExpressions.warmthSparkle();
  },

  // Phase 5: Relational Moments - Connection depth
  remembering: () => ferniExpressions.setExpression('remembering', 400),
  reconnecting: () => {
    ferniExpressions.setExpression('reconnecting', 400);
    ferniExpressions.warmthSparkle();
  },
  insider: () => ferniExpressions.setExpression('insider', 400),
  growing: () => {
    ferniExpressions.setExpression('growing', 400);
    ferniExpressions.warmthSparkle();
  },

  // Phase 6: Transition States - Smooth emotional flow
  processing: () => ferniExpressions.setExpression('processing', 400),
  realizing: () => ferniExpressions.realization(),
  shifting: () => ferniExpressions.setExpression('shifting', 300),
  settling: () => ferniExpressions.setExpression('settling', 500),
};

// ============================================================================
// STATE
// ============================================================================

let isEnabled = false;
let unsubscribe: (() => void) | null = null;
let lastExpressionTime = 0;
const MIN_EXPRESSION_INTERVAL = 300; // Don't change expressions too rapidly

// ============================================================================
// BRIDGE FUNCTIONS
// ============================================================================

/**
 * Handle emotion state change and trigger appropriate expression.
 */
function onEmotionChange(emotion: EmotionState, previous: EmotionState): void {
  // Skip if expression just changed (debounce)
  const now = Date.now();
  if (now - lastExpressionTime < MIN_EXPRESSION_INTERVAL) {
    return;
  }

  // Skip if same emotion (shouldn't happen but safety check)
  if (emotion.id === previous.id) {
    return;
  }

  // Skip if speaking - let the content drive expressions
  if (emotion.id === 'speaking') {
    // Emit speaking event for logo
    window.dispatchEvent(
      new CustomEvent('ferni:avatar-speaking', {
        detail: { speaking: true },
      })
    );
    return;
  }

  // Get the expression function for this emotion
  const expressionFn = EMOTION_TO_EXPRESSION[emotion.id];
  if (expressionFn) {
    expressionFn();
    lastExpressionTime = now;
    log.debug('Expression triggered for emotion:', emotion.id);

    const intensity = emotion.movement.energy > 0.6 ? 'high' : 'normal';
    const intensityValue = emotion.movement.energy;

    // Emit event for logo expressions to react
    window.dispatchEvent(
      new CustomEvent('ferni:avatar-emotion', {
        detail: {
          emotion: emotion.id,
          intensity,
        },
      })
    );

    // ✨ Emit event for Avatar Soul to react (pupil, glow, etc.)
    document.dispatchEvent(
      new CustomEvent('ferni:emotion-change', {
        detail: {
          emotion: emotion.id,
          intensity: intensityValue,
          previous: previous.id,
        },
      })
    );
  }
}

/**
 * Enable the emotion-expression bridge.
 * Subscribes to emotion state changes and triggers expressions.
 */
export function enableEmotionExpressionBridge(): void {
  if (isEnabled) return;

  unsubscribe = emotionState.subscribe(onEmotionChange);
  isEnabled = true;
  log.info('Emotion-expression bridge enabled');
}

/**
 * Disable the emotion-expression bridge.
 */
export function disableEmotionExpressionBridge(): void {
  if (!isEnabled) return;

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  isEnabled = false;
  log.info('Emotion-expression bridge disabled');
}

/**
 * Check if the bridge is currently enabled.
 */
export function isBridgeEnabled(): boolean {
  return isEnabled;
}

/**
 * Manually trigger an expression for an emotion.
 * Useful for testing or one-off triggers.
 */
export function triggerExpressionForEmotion(emotionId: EmotionId): void {
  const expressionFn = EMOTION_TO_EXPRESSION[emotionId];
  if (expressionFn) {
    expressionFn();
    lastExpressionTime = Date.now();
    log.debug('Manual expression trigger:', emotionId);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const emotionExpressionBridge = {
  enable: enableEmotionExpressionBridge,
  disable: disableEmotionExpressionBridge,
  isEnabled: isBridgeEnabled,
  trigger: triggerExpressionForEmotion,
};

export default emotionExpressionBridge;
