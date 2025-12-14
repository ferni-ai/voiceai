/**
 * Micro-Interactions UI - Pixar-Quality Button & Interactive Effects
 * 
 * 🎬 PIXAR PRINCIPLES APPLIED:
 * - ANTICIPATION: Wind-up before actions
 * - SQUASH & STRETCH: Elements deform naturally
 * - FOLLOW-THROUGH: Overshoot and settle
 * - APPEAL: Delightful, satisfying interactions
 * - SECONDARY ACTION: Supporting animations
 * 
 * Features:
 * - Satisfying button pop on press
 * - Focus rings with persona glow
 * - Success confetti bursts
 * 
 * NOTE: Hover effects removed for cleaner zen aesthetic.
 */

import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import {
  DURATION,
  EASING,
  ANIMATION_PRESET,
} from '../config/animation-constants.js';

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let prefersReducedMotion = false;

// Track active animations for cleanup
const activeAnimations = new Map<HTMLElement, Animation[]>();

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMicroInteractions(): void {
  if (isInitialized) return;
  
  // Check reduced motion preference
  prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Listen for preference changes
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
  });
  
  // Add event listeners for buttons
  document.addEventListener('mousedown', handleMouseDown, { passive: true });
  document.addEventListener('mouseup', handleMouseUp, { passive: true });
  document.addEventListener('mouseenter', handleMouseEnter, true);
  document.addEventListener('mouseleave', handleMouseLeave, true);
  document.addEventListener('focusin', handleFocusIn, { passive: true });
  document.addEventListener('focusout', handleFocusOut, { passive: true });
  
  isInitialized = true;
}

// ============================================================================
// 🎬 PIXAR BUTTON POP - Satisfying Press Animation
// ============================================================================

/**
 * Handle mouse down on interactive elements.
 * Creates the "anticipation" squash effect.
 */
function handleMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  // Guard: ensure target is an Element with closest method
  if (!target || typeof target.closest !== 'function') return;
  const button = target.closest('.btn, button, [role="button"]') as HTMLElement;
  
  if (!button || button.hasAttribute('disabled')) return;
  if (prefersReducedMotion) return;
  
  // Cancel any existing animations
  cancelAnimations(button);
  
  // Anticipation squash - like pressing down on something squishy
  const squashAnim = button.animate([
    { transform: 'scale(1)', offset: 0 },
    { transform: 'scale(0.96, 0.92)', offset: 1 },
  ], {
    duration: ANIMATION_PRESET.BUTTON_PRESS.duration,
    easing: EASING.STANDARD, // Clean press, not anticipation curve
    fill: 'forwards',
  });
  
  trackAnimation(button, squashAnim);
}

/**
 * Handle mouse up - the satisfying "pop" release.
 */
function handleMouseUp(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  // Guard: ensure target is an Element with closest method
  if (!target || typeof target.closest !== 'function') return;
  const button = target.closest('.btn, button, [role="button"]') as HTMLElement;
  
  if (!button || button.hasAttribute('disabled')) return;
  if (prefersReducedMotion) return;
  
  // Cancel squash animation
  cancelAnimations(button);
  
  // Pop release with overshoot - Pixar-style follow-through
  const popAnim = button.animate([
    // Starting from squashed state
    { transform: 'scale(0.96, 0.92)', offset: 0 },
    // Quick stretch up (release energy)
    { transform: 'scale(1.04, 1.08)', offset: 0.3 },
    // Overshoot past neutral
    { transform: 'scale(1.06, 1.04)', offset: 0.5 },
    // Settle with undershoot
    { transform: 'scale(0.99, 1.01)', offset: 0.75 },
    // Back to neutral
    { transform: 'scale(1)', offset: 1 },
  ], {
    duration: ANIMATION_PRESET.BUTTON_RELEASE.duration,
    easing: EASING.SPRING, // Bouncy spring
    fill: 'forwards',
  });
  
  trackAnimation(button, popAnim);
  
  // Play pop sound if available
  void playButtonSound();
  
  // Clear animation tracking after it completes
  popAnim.onfinish = () => {
    removeAnimation(button, popAnim);
    button.style.transform = '';
  };
}

// ============================================================================
// ✨ HOVER GLOW EFFECT
// ============================================================================

/**
 * Handle mouse enter for interactive elements.
 * Simple hover state - no sparkles or effects (clean, zen aesthetic).
 */
function handleMouseEnter(e: Event): void {
  const target = e.target as HTMLElement;
  // Guard: ensure target is an Element with closest method
  if (!target || typeof target.closest !== 'function') return;
  const interactive = target.closest('.btn, button, [role="button"], .team-member, a') as HTMLElement;
  
  if (!interactive || interactive.hasAttribute('disabled')) return;
  if (prefersReducedMotion) return;
  
  // Don't add multiple glow classes
  if (interactive.classList.contains('pixar-glow-active')) return;
  
  interactive.classList.add('pixar-glow-active');
  
  // NOTE: Hover lift and sparkle effects REMOVED for cleaner zen aesthetic.
  // The CSS handles hover states - we just track the class for consistency.
}

/**
 * Handle mouse leave - clean up hover state.
 */
function handleMouseLeave(e: Event): void {
  const target = e.target as HTMLElement;
  // Guard: ensure target is an Element with closest method
  if (!target || typeof target.closest !== 'function') return;
  const interactive = target.closest('.btn, button, [role="button"], .team-member, a') as HTMLElement;
  
  if (!interactive) return;
  
  interactive.classList.remove('pixar-glow-active');
  
  // NOTE: Settle animation REMOVED - CSS handles transitions cleanly
}

// ============================================================================
// 🌟 FOCUS RING WITH PERSONA GLOW
// ============================================================================

/**
 * Handle focus in - create glowing focus ring.
 */
function handleFocusIn(e: Event): void {
  const target = e.target as HTMLElement;
  // Guard: ensure target is an Element with closest method
  if (!target || typeof target.closest !== 'function') return;
  
  // Only for keyboard navigation (not mouse clicks)
  if (!target.matches(':focus-visible')) return;
  
  const interactive = target.closest('.btn, button, [role="button"], input, select, textarea, a') as HTMLElement;
  if (!interactive) return;
  
  interactive.classList.add('pixar-focus');
  
  if (prefersReducedMotion) return;
  
  // Pulse animation for focus ring - use persona colors
  const pulseAnim = interactive.animate([
    { boxShadow: '0 0 0 3px var(--persona-primary, var(--color-accent-primary))', offset: 0 },
    { boxShadow: '0 0 0 5px var(--persona-glow, var(--color-accent-glow))', offset: 0.5 },
    { boxShadow: '0 0 0 3px var(--persona-primary, var(--color-accent-primary))', offset: 1 },
  ], {
    duration: DURATION.GLACIAL, // Slow, meditative pulse
    iterations: Infinity,
    easing: EASING.EASE_IN_OUT,
  });
  
  trackAnimation(interactive, pulseAnim);
}

/**
 * Handle focus out - remove focus styling.
 */
function handleFocusOut(e: Event): void {
  const target = e.target as HTMLElement;
  // Guard: ensure target is an Element with closest method
  if (!target || typeof target.closest !== 'function') return;
  const interactive = target.closest('.btn, button, [role="button"], input, select, textarea, a') as HTMLElement;
  
  if (!interactive) return;
  
  interactive.classList.remove('pixar-focus');
  cancelAnimations(interactive);
}

// ============================================================================
// 🎊 CELEBRATION EFFECTS
// ============================================================================

/**
 * Create a confetti burst for milestone celebrations.
 * Like a character jumping for joy!
 */
export function celebrateConfetti(
  element: HTMLElement, 
  options: { 
    particleCount?: number; 
    colors?: string[];
    duration?: number;
  } = {}
): void {
  if (prefersReducedMotion) return;
  
  const {
    particleCount = 20,
    // Earthy celebration palette - matches brand colors
    colors = ['#4a6741', '#9a7b5a', '#3a6b73', '#a67a6a', '#c4856a'],
    duration = 1500,
  } = options;
  
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // Create confetti container
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: var(--z-notification);
    overflow: hidden;
  `;
  document.body.appendChild(container);
  
  // Create confetti particles
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)] ?? colors[0];
    const size = 6 + Math.random() * 8;
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
    const velocity = 150 + Math.random() * 200;
    const rotation = Math.random() * 720 - 360;
    
    particle.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      left: ${centerX}px;
      top: ${centerY}px;
    `;
    
    container.appendChild(particle);
    
    // Calculate end position
    const endX = Math.cos(angle) * velocity;
    const endY = Math.sin(angle) * velocity - 100; // Arc upward
    
    // Animate with physics-like trajectory
    particle.animate([
      {
        transform: 'translate(0, 0) rotate(0deg) scale(1)',
        opacity: 1,
        offset: 0,
      },
      {
        transform: `translate(${endX * 0.5}px, ${endY * 0.3 - 50}px) rotate(${rotation * 0.5}deg) scale(1.1)`,
        opacity: 1,
        offset: 0.3,
      },
      {
        transform: `translate(${endX}px, ${endY + 200}px) rotate(${rotation}deg) scale(0.5)`,
        opacity: 0,
        offset: 1,
      },
    ], {
      duration: duration + Math.random() * DURATION.DELIBERATE,
      easing: EASING.ORGANIC,
      fill: 'forwards',
    });
  }
  
  // Clean up after animation
  trackedTimeout(() => {
    container.remove();
  }, duration + 500);
}

/**
 * Create a sparkle effect at a point.
 */
export function createSparkle(x: number, y: number, color?: string): void {
  if (prefersReducedMotion) return;
  
  const sparkle = document.createElement('div');
  // Use persona primary color for sparkles - earthy palette
  const sparkleColor = color ?? 'var(--persona-primary, #4a6741)';
  
  sparkle.style.cssText = `
    position: fixed;
    width: 8px;
    height: 8px;
    left: ${x}px;
    top: ${y}px;
    pointer-events: none;
    z-index: var(--z-notification);
    background: ${sparkleColor};
    border-radius: 50%;
    box-shadow: 0 0 6px ${sparkleColor}, 0 0 12px ${sparkleColor};
  `;
  
  document.body.appendChild(sparkle);
  
  sparkle.animate([
    { transform: 'scale(0) rotate(0deg)', opacity: 1, offset: 0 },
    { transform: 'scale(1.5) rotate(180deg)', opacity: 1, offset: 0.3 },
    { transform: 'scale(0) rotate(360deg)', opacity: 0, offset: 1 },
  ], {
    duration: DURATION.DRAMATIC,
    easing: EASING.STANDARD,
  });
  
  trackedTimeout(() => sparkle.remove(), DURATION.DRAMATIC);
}

/**
 * Create a burst of sparkles around an element.
 */
export function sparkBurst(element: HTMLElement, count: number = 6): void {
  if (prefersReducedMotion) return;
  
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = Math.max(rect.width, rect.height) / 2 + 10;
  
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    
    trackedTimeout(() => createSparkle(x, y), i * 50);
  }
}

// ============================================================================
// 🔧 UTILITY FUNCTIONS
// ============================================================================

/**
 * Track an animation for cleanup.
 */
function trackAnimation(element: HTMLElement, animation: Animation): void {
  const existing = activeAnimations.get(element) ?? [];
  existing.push(animation);
  activeAnimations.set(element, existing);
}

/**
 * Remove a specific animation from tracking.
 */
function removeAnimation(element: HTMLElement, animation: Animation): void {
  const existing = activeAnimations.get(element);
  if (existing) {
    const index = existing.indexOf(animation);
    if (index > -1) {
      existing.splice(index, 1);
    }
    if (existing.length === 0) {
      activeAnimations.delete(element);
    }
  }
}

/**
 * Cancel all animations on an element.
 */
function cancelAnimations(element: HTMLElement): void {
  const animations = activeAnimations.get(element);
  if (animations) {
    animations.forEach(anim => anim.cancel());
    activeAnimations.delete(element);
  }
}

/**
 * Play button click sound via sound UI.
 */
async function playButtonSound(): Promise<void> {
  try {
    const { soundUI } = await import('./sound.ui.js');
    soundUI.play('click');
  } catch {
    // Sound UI not available, no problem
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  document.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('mouseenter', handleMouseEnter, true);
  document.removeEventListener('mouseleave', handleMouseLeave, true);
  document.removeEventListener('focusin', handleFocusIn);
  document.removeEventListener('focusout', handleFocusOut);
  
  // Cancel all tracked animations
  activeAnimations.forEach((animations) => {
    animations.forEach(anim => anim.cancel());
  });
  activeAnimations.clear();
  
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const microInteractionsUI = {
  init: initMicroInteractions,
  celebrate: celebrateConfetti,
  sparkle: createSparkle,
  sparkBurst,
  dispose,
};

