/**
 * Delight Service
 * 
 * Handles whimsical interactions and emotional moments.
 * Creates joy through thoughtful micro-interactions.
 */

import { getElementByIdOrNull, addClass, removeClass } from '../utils/dom.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';
import { haptic as nativeHaptic, isNative, type HapticStyle } from '../utils/platform.js';

// ============================================================================
// CELEBRATION (Zen Warmth)
// ============================================================================

/**
 * Trigger a subtle, zen-inspired celebration.
 * Uses warmth glow instead of particles for human-like expressiveness.
 * 
 * Note: Named triggerDelightEffect to avoid conflict with brand-system celebrate()
 */
export function triggerDelightEffect(): void {
  // Use warmth glow from celebrations UI
  celebrationsUI.warmthGlow({ intensity: 'gentle' });
  
  // Add celebrating class to app for CSS effects
  const app = getElementByIdOrNull('app');
  if (app) {
    addClass(app, 'celebrating');
    setTimeout(() => removeClass(app, 'celebrating'), 1200);
  }
}

// ============================================================================
// THINKING INDICATOR
// ============================================================================

/**
 * Show thinking dots (when AI is processing).
 */
export function showThinking(element: HTMLElement): HTMLElement {
  const dots = document.createElement('span');
  dots.className = 'thinking-dots';
  dots.innerHTML = `
    <span class="thinking-dot"></span>
    <span class="thinking-dot"></span>
    <span class="thinking-dot"></span>
  `;
  element.appendChild(dots);
  return dots;
}

/**
 * Remove thinking dots.
 */
export function hideThinking(dots: HTMLElement): void {
  dots.remove();
}

// ============================================================================
// CONNECTION CELEBRATION
// ============================================================================

let hasConnectedBefore = false;

/**
 * Celebrate first connection of session.
 */
export function celebrateConnection(): void {
  // Add connected class for particle color change
  const app = getElementByIdOrNull('app');
  if (app) {
    addClass(app, 'connected');
  }
  
  // Only celebrate first connection
  if (!hasConnectedBefore) {
    hasConnectedBefore = true;
    triggerDelightEffect();
  }
}

/**
 * Handle disconnection.
 */
export function onDisconnect(): void {
  const app = getElementByIdOrNull('app');
  if (app) {
    removeClass(app, 'connected');
  }
}

// ============================================================================
// HAPTIC FEEDBACK (Native + Web fallback)
// ============================================================================

/**
 * Trigger haptic feedback.
 * Uses native Capacitor Haptics on iOS/Android for rich feedback.
 * Falls back to Vibration API on web (Android Chrome only).
 */
export function haptic(style: HapticStyle = 'light'): void {
  // Use native haptics on iOS/Android - this actually works on iOS!
  if (isNative()) {
    void nativeHaptic(style);
    return;
  }

  // Web fallback (mainly Android Chrome)
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 40;
      navigator.vibrate(duration);
    }
  } catch {
    // Vibration not supported
  }
}

// ============================================================================
// EASTER EGGS
// ============================================================================

let clickCount = 0;
let lastClickTime = 0;

/**
 * Track avatar clicks for easter egg.
 */
export function trackAvatarClick(): void {
  const now = Date.now();
  
  // Reset if more than 500ms between clicks
  if (now - lastClickTime > 500) {
    clickCount = 0;
  }
  
  clickCount++;
  lastClickTime = now;
  
  // Easter egg: 5 rapid clicks
  if (clickCount >= 5) {
    triggerDelightEffect();
    clickCount = 0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const delightService = {
  celebrate: triggerDelightEffect,
  triggerDelightEffect,
  celebrateConnection,
  onDisconnect,
  showThinking,
  hideThinking,
  haptic,
  trackAvatarClick,
};
