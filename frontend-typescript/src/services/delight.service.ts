/**
 * Delight Service
 * 
 * Handles whimsical interactions and emotional moments.
 * Creates joy through thoughtful micro-interactions.
 */

import { getElementByIdOrNull, addClass, removeClass } from '../utils/dom.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';

// ============================================================================
// CELEBRATION (Zen Fireworks)
// ============================================================================

/**
 * Trigger a subtle, zen-inspired celebration.
 * Uses fireworks instead of confetti for a more refined aesthetic.
 */
export function celebrate(): void {
  // Use zen fireworks from celebrations UI
  celebrationsUI.fireworks(2);
  
  // Add celebration glow to app
  const app = getElementByIdOrNull('app');
  if (app) {
    addClass(app, 'celebrating');
    setTimeout(() => removeClass(app, 'celebrating'), 1000);
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
    celebrate();
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
// HAPTIC FEEDBACK (for mobile)
// ============================================================================

/**
 * Trigger haptic feedback if available.
 * Safely handles iOS which doesn't support vibration API.
 */
export function haptic(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 40;
    navigator.vibrate(duration);
    }
  } catch {
    // Vibration not supported (iOS, etc.)
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
    celebrate();
    clickCount = 0;
    console.log('✨ You found an easter egg!');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const delightService = {
  celebrate,
  celebrateConnection,
  onDisconnect,
  showThinking,
  hideThinking,
  haptic,
  trackAvatarClick,
};
