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
 *
 * EXPRESSION SYSTEMS:
 * - Legacy: ferniExpressions (GSAP-based lid overlays)
 * - Luxo: luxoExpressions (CSS transform-based, 100+ expressions)
 *
 * Set USE_LUXO_EXPRESSIONS=true to use the new system.
 */

import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import * as luxoExpressions from '../ui/luxo-expressions.ui.js';
import type { ExpressionId } from '../config/expressions.generated.js';
import { createLogger } from '../utils/logger.js';
import { emotionState, type EmotionId, type EmotionState } from './emotion-state.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Feature flag: Use new Luxo expression system (CSS transforms)
 * When true, uses the 100+ expression system from expressions.json
 * When false, uses legacy GSAP-based lid overlay system
 */
const USE_LUXO_EXPRESSIONS = true;

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
// LUXO EXPRESSION MAPPING (New 100+ Expression System)
// ============================================================================

/**
 * Maps emotion IDs to Luxo expression IDs.
 * Luxo expressions are CSS-driven and data-loaded from expressions.json.
 */
const EMOTION_TO_LUXO_EXPRESSION: Record<EmotionId, ExpressionId | null> = {
  // Core emotions
  neutral: 'neutral',
  happy: 'happy',
  excited: 'excited',
  curious: 'curious',
  thinking: 'thinking',
  calm: 'calm',
  sad: 'sad',
  frustrated: 'frustrated',
  listening: 'listening',
  speaking: null, // Don't change expression during speech

  // Brand-aligned additions
  contemplative: 'contemplating',
  noticing: 'attentive',
  holdingSpace: 'supportive',

  // Phase 1: Listening States
  attentive: 'attentive',
  absorbing: 'absorbing',
  receiving: 'receptive',
  curiousLean: 'curious',

  // Phase 2: Warmth Gradient
  warm: 'warm',
  pleased: 'pleased',
  delighted: 'delighted',
  proud: 'proud',
  celebrating: 'joyful',

  // Phase 3: Presence States
  present: 'present',
  holding: 'supportive',
  accompanying: 'nurturing',
  waiting: 'patient' as ExpressionId, // Maps to calm if patient doesn't exist

  // Phase 4: Coaching Emotions
  encouraging: 'encouraging',
  challenging: 'determined',
  reflecting: 'reflecting',
  recognizing: 'knowing',

  // Phase 5: Relational Moments
  remembering: 'thoughtful' as ExpressionId,
  reconnecting: 'warm',
  insider: 'amused',
  growing: 'proud',

  // Phase 6: Transition States
  processing: 'processing',
  realizing: 'surprised',
  shifting: 'focused',
  settling: 'content',
};

/**
 * Trigger a Luxo expression for an emotion.
 * Falls back to neutral if expression doesn't exist.
 */
function triggerLuxoExpression(emotionId: EmotionId, intensity = 0.5): void {
  const expressionId = EMOTION_TO_LUXO_EXPRESSION[emotionId];

  if (expressionId === null) {
    // Explicitly null means don't change expression (e.g., speaking)
    return;
  }

  // Check if the expression exists
  if (luxoExpressions.hasExpression(expressionId)) {
    luxoExpressions.setExpression(expressionId, { duration: 300 });
  } else {
    // Fall back to emotion-to-expression mapping
    const fallback = luxoExpressions.emotionToExpression(emotionId, intensity);
    luxoExpressions.setExpression(fallback, { duration: 300 });
  }
}

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

  const intensityValue = emotion.movement.energy;
  const intensity = intensityValue > 0.6 ? 'high' : 'normal';

  // Use appropriate expression system
  if (USE_LUXO_EXPRESSIONS) {
    // New Luxo expression system (CSS-based, 100+ expressions)
    triggerLuxoExpression(emotion.id, intensityValue);
    lastExpressionTime = now;
    log.debug('Luxo expression triggered for emotion:', emotion.id);
  } else {
    // Legacy GSAP-based expression system
    const expressionFn = EMOTION_TO_EXPRESSION[emotion.id];
    if (expressionFn) {
      expressionFn();
      lastExpressionTime = now;
      log.debug('Legacy expression triggered for emotion:', emotion.id);
    }
  }

  // Emit event for logo expressions to react
  window.dispatchEvent(
    new CustomEvent('ferni:avatar-emotion', {
      detail: {
        emotion: emotion.id,
        intensity,
      },
    })
  );

  // Emit event for Avatar Soul to react (pupil, glow, etc.)
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
export function triggerExpressionForEmotion(emotionId: EmotionId, intensity = 0.5): void {
  if (USE_LUXO_EXPRESSIONS) {
    triggerLuxoExpression(emotionId, intensity);
  } else {
    const expressionFn = EMOTION_TO_EXPRESSION[emotionId];
    if (expressionFn) {
      expressionFn();
    }
  }
  lastExpressionTime = Date.now();
  log.debug('Manual expression trigger:', emotionId);
}

/**
 * Directly set a Luxo expression by ID.
 * Bypasses emotion mapping for direct expression control.
 */
export function setLuxoExpression(expressionId: string, options?: { duration?: number }): void {
  if (luxoExpressions.hasExpression(expressionId)) {
    luxoExpressions.setExpression(expressionId as ExpressionId, options);
    log.debug('Direct Luxo expression set:', expressionId);
  } else {
    log.warn('Unknown Luxo expression:', expressionId);
  }
}

/**
 * Check if using Luxo expression system.
 */
export function isUsingLuxoExpressions(): boolean {
  return USE_LUXO_EXPRESSIONS;
}

/**
 * Get current expression ID (Luxo system only).
 */
export function getCurrentExpression(): ExpressionId | null {
  if (USE_LUXO_EXPRESSIONS) {
    return luxoExpressions.getCurrentExpression();
  }
  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const emotionExpressionBridge = {
  enable: enableEmotionExpressionBridge,
  disable: disableEmotionExpressionBridge,
  isEnabled: isBridgeEnabled,
  trigger: triggerExpressionForEmotion,
  // Luxo expression system
  setExpression: setLuxoExpression,
  isUsingLuxo: isUsingLuxoExpressions,
  getCurrentExpression,
};

export default emotionExpressionBridge;
