/**
 * Logo Expressions Integration
 * 
 * Manages animated Ferni logo expressions throughout the app.
 * Can be used standalone or triggered alongside avatar feedback.
 * 
 * The logo supports expressions: zen, happy, excited, curious, sad,
 * surprised, thinking, chuckle, speaking, listening
 * 
 * @example
 * import { logoExpressions } from './ui/logo-expressions.ui.js';
 * 
 * // Initialize with a logo element or create one
 * logoExpressions.init();
 * 
 * // Set expression
 * logoExpressions.setExpression('happy');
 * 
 * // React to emotions from avatar feedback
 * logoExpressions.reactToEmotion('joy');
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { createFerniLogo, type LogoExpression, type FerniLogoInstance } from './ferni-logo.ui.js';
import { DURATION } from '../config/animation-constants.js';

const log = createLogger('LogoExpressions');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// STATE
// ============================================================================

let logoInstance: FerniLogoInstance | null = null;
let expressionTimeout: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

// Mapping from avatar emotions to logo expressions
const EMOTION_TO_EXPRESSION: Record<string, LogoExpression> = {
  // Direct mappings
  'happy': 'happy',
  'joy': 'excited',
  'excited': 'excited',
  'curious': 'curious',
  'sad': 'sad',
  'surprised': 'surprised',
  'thinking': 'thinking',
  'thoughtful': 'thinking',
  'speaking': 'speaking',
  'listening': 'listening',
  'chuckle': 'chuckle',
  'humor': 'chuckle',
  
  // Emotional mappings
  'empathy': 'sad',
  'comfort': 'listening',
  'encourage': 'happy',
  'delight': 'excited',
  'contemplate': 'thinking',
  'calm': 'zen',
  'settle': 'zen',
  'neutral': 'zen',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the logo expressions system
 * @param container - Optional container element, creates floating logo if omitted
 */
export function initLogoExpressions(container?: HTMLElement): void {
  if (isInitialized) {
    log.debug('Logo expressions already initialized');
    return;
  }

  // Create the logo instance
  logoInstance = createFerniLogo({
    size: 48,
    animated: true,
    expression: 'zen',
  });

  // If a container is provided, append there
  if (container) {
    container.appendChild(logoInstance.element);
  }

  isInitialized = true;
  log.info('Logo expressions initialized');
}

/**
 * Dispose of the logo expressions system
 */
export function disposeLogoExpressions(): void {
  if (expressionTimeout) {
    clearTimeout(expressionTimeout);
    expressionTimeout = null;
  }
  
  if (logoInstance) {
    logoInstance.dispose();
    logoInstance = null;
  }
  
  isInitialized = false;
  log.debug('Logo expressions disposed');
}

// ============================================================================
// EXPRESSION CONTROL
// ============================================================================

/**
 * Set the logo expression
 * @param expression - The expression to show
 * @param duration - Optional duration before returning to zen (0 = permanent)
 */
export function setLogoExpression(expression: LogoExpression, duration = 0): void {
  if (!logoInstance) {
    log.debug('Logo not initialized, skipping expression');
    return;
  }

  // Clear any pending return-to-zen timeout
  if (expressionTimeout) {
    clearTimeout(expressionTimeout);
    expressionTimeout = null;
  }

  logoInstance.setExpression(expression);
  log.debug('Logo expression set:', expression);

  // If duration specified, return to zen after
  if (duration > 0) {
    expressionTimeout = trackedTimeout(() => {
      logoInstance?.setExpression('zen');
      log.debug('Logo returned to zen');
    }, duration);
  }
}

/**
 * Get the current logo expression
 */
export function getLogoExpression(): LogoExpression | null {
  return logoInstance?.getExpression() ?? null;
}

/**
 * React to an emotion (from avatar feedback or elsewhere)
 * Automatically maps emotions to appropriate logo expressions
 */
export function reactToEmotion(emotion: string, duration = DURATION.CELEBRATION): void {
  const expression = EMOTION_TO_EXPRESSION[emotion.toLowerCase()] || 'zen';
  setLogoExpression(expression, duration);
}

/**
 * Trigger a reaction animation on the logo
 */
export function triggerLogoReaction(type: 'bounce' | 'wiggle' | 'pulse'): void {
  if (!logoInstance) return;
  logoInstance.react(type);
}

/**
 * Get the logo SVG element (for custom positioning)
 */
export function getLogoElement(): SVGSVGElement | null {
  return logoInstance?.element ?? null;
}

// ============================================================================
// AVATAR FEEDBACK INTEGRATION
// ============================================================================

/**
 * Hook into avatar feedback events
 * Call this after avatar feedback is initialized
 */
export function hookIntoAvatarFeedback(): void {
  // Listen for avatar emotion changes
  window.addEventListener('ferni:avatar-emotion', ((event: CustomEvent) => {
    const { emotion, intensity } = event.detail;
    const duration = intensity === 'high' ? DURATION.CELEBRATION : DURATION.CELEBRATION;
    reactToEmotion(emotion, duration);
  }) as EventListener);

  // Listen for speaking state
  window.addEventListener('ferni:avatar-speaking', ((event: CustomEvent) => {
    if (event.detail.speaking) {
      setLogoExpression('speaking', 0);
    } else {
      setLogoExpression('zen', 0);
    }
  }) as EventListener);

  // Listen for listening state
  window.addEventListener('ferni:avatar-listening', ((event: CustomEvent) => {
    if (event.detail.listening) {
      setLogoExpression('listening', 0);
    }
  }) as EventListener);

  log.info('Logo expressions hooked into avatar feedback');
}

// ============================================================================
// EXPRESSION PRESETS
// ============================================================================

/**
 * Quick expression presets for common scenarios
 */
export const expressionPresets = {
  /** Greeting animation - curious then happy */
  async greeting() {
    setLogoExpression('curious', 0);
    await sleep(400);
    setLogoExpression('happy', DURATION.CELEBRATION);
  },

  /** Thinking animation - thinking with occasional looks */
  // eslint-disable-next-line @typescript-eslint/require-await
  async deepThinking() {
    setLogoExpression('thinking', 0);
  },

  /** Stop thinking */
  // eslint-disable-next-line @typescript-eslint/require-await
  async stopThinking() {
    setLogoExpression('zen', 0);
  },

  /** Celebration sequence */
  async celebrate() {
    setLogoExpression('excited', 0);
    triggerLogoReaction('bounce');
    await sleep(DURATION.CELEBRATION);
    setLogoExpression('happy', DURATION.SLOW);
  },

  /** Error/concern expression */
  // eslint-disable-next-line @typescript-eslint/require-await
  async showConcern() {
    setLogoExpression('sad', DURATION.CELEBRATION);
  },

  /** Surprise reaction */
  // eslint-disable-next-line @typescript-eslint/require-await
  async showSurprise() {
    setLogoExpression('surprised', DURATION.SLOW);
    triggerLogoReaction('bounce');
  },

  /** Humor/joke reaction */
  // eslint-disable-next-line @typescript-eslint/require-await
  async chuckle() {
    setLogoExpression('chuckle', DURATION.CELEBRATION);
    triggerLogoReaction('wiggle');
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => trackedTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const logoExpressions = {
  init: initLogoExpressions,
  dispose: disposeLogoExpressions,
  setExpression: setLogoExpression,
  getExpression: getLogoExpression,
  reactToEmotion,
  triggerReaction: triggerLogoReaction,
  getElement: getLogoElement,
  hookIntoAvatarFeedback,
  presets: expressionPresets,
};

export default logoExpressions;

