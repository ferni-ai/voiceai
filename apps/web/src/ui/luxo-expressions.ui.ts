/**
 * Luxo-Style Expression System
 *
 * High-fidelity expression controller using CSS transforms on opaque eyes.
 * No pupils - like Luxo Jr., the eye shape IS the expression.
 *
 * This is the production implementation of the 92+ expressions from:
 * - design-system/tokens/expressions.json (source)
 * - config/expressions.generated.ts (types + data)
 * - config/expressions.generated.css (CSS rules)
 *
 * DESIGN PRINCIPLES:
 * - CSS transforms for performance (GPU-accelerated)
 * - data-expression attribute for CSS rule selection
 * - Micro-expressions for subliminal emotional feedback (40-150ms)
 * - Spring-based transitions for organic feel
 *
 * @see design-system/playground/ferni-alive.html for visual reference
 */

import { createLogger } from '../utils/logger.js';
import {
  EXPRESSIONS,
  MICRO_EXPRESSIONS,
  EXPRESSION_FAMILIES,
  getExpression,
  getExpressionsByFamily,
  type ExpressionId,
  type ExpressionFamily,
  type ExpressionConfig,
} from '../config/expressions.generated.js';

const log = createLogger('LuxoExpressions');

// ============================================================================
// TYPES
// ============================================================================

export interface ExpressionOptions {
  /** Transition duration in milliseconds (default: 300) */
  duration?: number;
  /** Hold duration before returning to previous (0 = stay) */
  hold?: number;
  /** Easing function (default: spring) */
  easing?: string;
  /** Whether this is a micro-expression (subliminal timing) */
  micro?: boolean;
}

export interface MicroExpressionOptions {
  /** Duration in milliseconds (40-150ms for subliminal) */
  duration?: number;
  /** Expression to return to after micro-expression */
  returnTo?: ExpressionId;
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let currentExpression: ExpressionId = 'neutral';
let previousExpression: ExpressionId = 'neutral';
let avatarElement: HTMLElement | null = null;
let avatarContainer: HTMLElement | null = null;
let eyeElements: {
  left: HTMLElement | null;
  right: HTMLElement | null;
  group: HTMLElement | null;
} = { left: null, right: null, group: null };

// Animation state
let transitionTimeout: ReturnType<typeof setTimeout> | null = null;
let holdTimeout: ReturnType<typeof setTimeout> | null = null;
let microExpressionQueue: Array<{
  expression: ExpressionId;
  duration: number;
  returnTo: ExpressionId;
}> = [];
let isPlayingMicroExpression = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Luxo expression system.
 * Finds avatar elements and sets up CSS.
 */
export function initLuxoExpressions(): void {
  if (isInitialized) return;

  // Find avatar elements
  avatarElement = document.getElementById('coachAvatar');
  avatarContainer = document.querySelector('.avatar-container');

  if (!avatarElement) {
    log.warn('Avatar element not found - expressions will not work');
    return;
  }

  // Find eye elements (may be in SVG or as separate divs)
  eyeElements = {
    left: avatarElement.querySelector('.eye-left .eye-white') as HTMLElement,
    right: avatarElement.querySelector('.eye-right .eye-white') as HTMLElement,
    group: avatarElement.querySelector('.eyes-group') as HTMLElement,
  };

  // Ensure CSS is loaded
  ensureStylesLoaded();

  // Set initial expression
  setExpressionAttribute('neutral');

  isInitialized = true;
  log.info('Luxo expressions initialized with', Object.keys(EXPRESSIONS).length, 'expressions');
}

/**
 * Ensure the expression CSS is loaded.
 */
function ensureStylesLoaded(): void {
  // Check if expressions.generated.css is already linked
  const existingLink = document.querySelector('link[href*="expressions.generated.css"]');
  if (existingLink) return;

  // The CSS should be imported in the main styles, but we can inject it dynamically if needed
  log.debug('Expression CSS should be imported in main stylesheet');
}

// ============================================================================
// EXPRESSION CONTROL
// ============================================================================

/**
 * Set the avatar's expression.
 *
 * @param expression - Expression ID from the 92+ available
 * @param options - Transition options
 */
export function setExpression(
  expression: ExpressionId,
  options: ExpressionOptions = {}
): void {
  // Auto-initialize if needed
  if (!isInitialized) {
    initLuxoExpressions();
  }

  if (!avatarElement && !avatarContainer) {
    log.warn('Avatar not found, cannot set expression');
    return;
  }

  const {
    duration = 300,
    hold = 0,
    easing = 'var(--ease-spring, cubic-bezier(0.5, 1.5, 0.5, 1))',
  } = options;

  // Clear any pending transitions
  if (transitionTimeout) {
    clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }
  if (holdTimeout) {
    clearTimeout(holdTimeout);
    holdTimeout = null;
  }

  // Store previous for potential return
  previousExpression = currentExpression;
  currentExpression = expression;

  // Apply transition timing
  setTransitionTiming(duration, easing);

  // Set the expression attribute (triggers CSS rules)
  setExpressionAttribute(expression);

  // Apply body transform from config
  applyBodyTransform(expression);

  // Handle hold duration
  if (hold > 0) {
    holdTimeout = setTimeout(() => {
      setExpression(previousExpression, { duration });
    }, hold);
  }

  log.debug('Expression set:', expression);
}

/**
 * Set the data-expression attribute on the avatar.
 */
function setExpressionAttribute(expression: ExpressionId): void {
  // Set on avatar container (for CSS rules)
  if (avatarContainer) {
    avatarContainer.setAttribute('data-expression', expression);
    // Also update legacy data-emotion for backward compatibility
    avatarContainer.setAttribute('data-emotion', expression);
  }

  // Set on avatar element as well (for direct targeting)
  if (avatarElement) {
    avatarElement.setAttribute('data-expression', expression);
  }
}

/**
 * Apply CSS transition timing.
 */
function setTransitionTiming(duration: number, easing: string): void {
  const durationSec = duration / 1000;

  if (avatarContainer) {
    avatarContainer.style.transition = `transform ${durationSec}s ${easing}`;
  }

  if (avatarElement) {
    avatarElement.style.transition = `transform ${durationSec}s ${easing}`;
  }

  // Apply to eye elements
  const eyeTransition = `transform ${durationSec}s ${easing}`;
  if (eyeElements.left) eyeElements.left.style.transition = eyeTransition;
  if (eyeElements.right) eyeElements.right.style.transition = eyeTransition;
  if (eyeElements.group) eyeElements.group.style.transition = eyeTransition;
}

/**
 * Apply body transform from expression config.
 */
function applyBodyTransform(expression: ExpressionId): void {
  const config = getExpression(expression);

  if (avatarContainer && config.body.transform) {
    avatarContainer.style.transform = config.body.transform;
  } else if (avatarContainer) {
    avatarContainer.style.transform = '';
  }
}

// ============================================================================
// MICRO-EXPRESSIONS (Subliminal Emotional Feedback)
// ============================================================================

/**
 * Play a micro-expression.
 * These are subliminal emotional flashes (40-150ms) that build trust.
 *
 * @param name - Micro-expression name (recognition, concern, delight, warmth, interest, surprise)
 * @param options - Override options
 */
export function playMicroExpression(
  name: string,
  options: MicroExpressionOptions = {}
): void {
  const micro = MICRO_EXPRESSIONS[name];
  if (!micro) {
    log.warn('Unknown micro-expression:', name);
    return;
  }

  const {
    duration = micro.duration,
    returnTo = currentExpression,
  } = options;

  // Queue the micro-expression
  microExpressionQueue.push({
    expression: name as ExpressionId, // Using name as expression for micro
    duration,
    returnTo,
  });

  // Process queue if not already playing
  if (!isPlayingMicroExpression) {
    processNextMicroExpression();
  }
}

/**
 * Process the next micro-expression in queue.
 */
function processNextMicroExpression(): void {
  if (microExpressionQueue.length === 0) {
    isPlayingMicroExpression = false;
    return;
  }

  isPlayingMicroExpression = true;
  const { expression, duration, returnTo } = microExpressionQueue.shift()!;

  // Apply micro-expression styles directly (bypass full transition)
  applyMicroExpressionStyles(expression);

  // Return to original after duration
  setTimeout(() => {
    setExpression(returnTo, { duration: 100 });
    processNextMicroExpression();
  }, duration);
}

/**
 * Apply micro-expression styles directly for speed.
 */
function applyMicroExpressionStyles(name: string): void {
  const micro = MICRO_EXPRESSIONS[name];
  if (!micro) return;

  // Apply eye scale if specified
  if (micro.eyeWhite) {
    const scaleY = micro.eyeWhite.scaleY ?? 1;
    const scaleX = micro.eyeWhite.scaleX ?? 1;
    const transform = `scaleY(${scaleY}) scaleX(${scaleX})`;

    if (eyeElements.left) eyeElements.left.style.transform = transform;
    if (eyeElements.right) eyeElements.right.style.transform = transform;
  }

  // Apply lid curve if specified (via CSS custom property)
  if (micro.lidTop) {
    const curve = micro.lidTop.curve;
    document.documentElement.style.setProperty('--micro-lid-top-curve', String(curve));
  }

  // Apply smile crease if specified
  if (micro.smileCrease) {
    const opacity = micro.smileCrease.opacity ?? 0;
    const smileCrease = avatarElement?.querySelector('.smile-crease') as HTMLElement;
    if (smileCrease) {
      smileCrease.style.opacity = String(opacity);
    }
  }
}

// ============================================================================
// ACTIVE LISTENING (Micro-nods During User Speech)
// ============================================================================

let activeListeningInterval: ReturnType<typeof setInterval> | null = null;
let isActivelyListening = false;

/**
 * Start active listening mode (micro-nods during user speech).
 * Creates subtle presence cues that show moment-to-moment attention.
 */
export function startActiveListening(): void {
  if (isActivelyListening) return;
  isActivelyListening = true;

  // Set base listening expression
  setExpression('listening', { duration: 200 });

  // Subtle micro-nods every 2-4 seconds
  const scheduleNextNod = () => {
    const delay = 2000 + Math.random() * 2000; // 2-4s
    activeListeningInterval = setTimeout(() => {
      if (isActivelyListening) {
        playMicroExpression('interest', { duration: 80 });
        scheduleNextNod();
      }
    }, delay);
  };

  scheduleNextNod();
  log.debug('Active listening started');
}

/**
 * Stop active listening mode.
 */
export function stopActiveListening(): void {
  isActivelyListening = false;
  if (activeListeningInterval) {
    clearTimeout(activeListeningInterval);
    activeListeningInterval = null;
  }
  log.debug('Active listening stopped');
}

/**
 * Handle user speech pause (opportunity for acknowledgment).
 */
export function onUserSpeechPause(pauseDuration: number): void {
  if (pauseDuration > 500 && pauseDuration < 1500) {
    // Short pause - subtle acknowledgment
    playMicroExpression('warmth', { duration: 100 });
  } else if (pauseDuration >= 1500) {
    // Longer pause - switch to attentive
    setExpression('attentive', { duration: 200 });
  }
}

// ============================================================================
// EMOTION-DRIVEN EXPRESSIONS
// ============================================================================

/**
 * Map detected emotion to appropriate expression.
 */
export function emotionToExpression(emotion: string, intensity = 0.5): ExpressionId {
  // Emotion → expression mappings
  const EMOTION_MAP: Record<string, ExpressionId[]> = {
    joy: ['happy', 'joyful', 'delighted'],
    sadness: ['concerned', 'sympathetic', 'sad'],
    anger: ['concerned', 'understanding', 'supportive'],
    fear: ['concerned', 'comforting', 'supportive'],
    surprise: ['surprised', 'curious', 'intrigued'],
    disgust: ['skeptical', 'puzzled', 'concerned'],
    contempt: ['skeptical', 'understanding', 'neutral'],
    neutral: ['neutral', 'listening', 'present'],
  };

  const candidates = EMOTION_MAP[emotion.toLowerCase()] ?? (['neutral'] as ExpressionId[]);

  // Select based on intensity (higher intensity = more expressive)
  const index = Math.min(
    Math.floor(intensity * candidates.length),
    candidates.length - 1
  );

  // candidates always has at least 'neutral', so index is always valid
  return candidates[index] ?? 'neutral';
}

/**
 * React to detected user emotion with appropriate expression.
 */
export function reactToUserEmotion(emotion: string, intensity = 0.5): void {
  const expression = emotionToExpression(emotion, intensity);
  setExpression(expression, { duration: 200 });
}

// ============================================================================
// EXPRESSION HELPERS
// ============================================================================

/**
 * Get current expression.
 */
export function getCurrentExpression(): ExpressionId {
  return currentExpression;
}

/**
 * Get all expressions in a family.
 */
export function getExpressionsInFamily(family: ExpressionFamily): ExpressionId[] {
  return getExpressionsByFamily(family);
}

/**
 * Get expression config.
 */
export function getExpressionConfig(id: ExpressionId): ExpressionConfig {
  return getExpression(id);
}

/**
 * Check if expression exists.
 */
export function hasExpression(id: string): id is ExpressionId {
  return id in EXPRESSIONS;
}

/**
 * List all available expressions.
 */
export function listExpressions(): ExpressionId[] {
  return Object.keys(EXPRESSIONS) as ExpressionId[];
}

/**
 * List all expression families.
 */
export function listFamilies(): ExpressionFamily[] {
  return Object.keys(EXPRESSION_FAMILIES) as ExpressionFamily[];
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup the expression system.
 */
export function cleanupLuxoExpressions(): void {
  stopActiveListening();

  if (transitionTimeout) clearTimeout(transitionTimeout);
  if (holdTimeout) clearTimeout(holdTimeout);

  microExpressionQueue = [];
  isPlayingMicroExpression = false;
  isInitialized = false;

  log.debug('Luxo expressions cleaned up');
}

// ============================================================================
// AUTO-INIT
// ============================================================================

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Delay to ensure avatar is rendered
      setTimeout(initLuxoExpressions, 100);
    });
  } else {
    setTimeout(initLuxoExpressions, 100);
  }
}
