/**
 * Kinetic Typography UI - Pixar-Quality Text Animations
 * 
 * 🎬 PIXAR PRINCIPLES APPLIED:
 * - ANTICIPATION: Text elements wind up before revealing
 * - STAGING: Clear hierarchy in reveal sequence
 * - TIMING: Golden ratio delays between elements
 * - FOLLOW-THROUGH: Letters overshoot and settle
 * - APPEAL: Text feels alive and engaging
 * 
 * Features:
 * - Character-by-character reveal with stagger
 * - Typewriter effect with cursor
 * - Scramble-to-reveal effect
 * - Text breathing/pulse on important callouts
 * - Name scramble animation for handoff
 */

import { EASING, STAGGER } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_DELAY = STAGGER.TIGHT; // Base delay between characters (ms)

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// STATE
// ============================================================================

let prefersReducedMotion = false;

// Track active animations for cleanup
const activeAnimations = new Map<HTMLElement, Animation[]>();

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initKineticTypography(): void {
  // Check reduced motion preference
  prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
  });
}

// ============================================================================
// 🔤 CHARACTER-BY-CHARACTER REVEAL
// ============================================================================

/**
 * Reveal text character by character with Pixar-style animation.
 * Like letters bouncing into place.
 * 
 * @param element - Element containing text to animate
 * @param options - Animation options
 */
export function revealText(
  element: HTMLElement,
  options: {
    delay?: number;
    stagger?: number;
    easing?: string;
    onComplete?: () => void;
  } = {}
): void {
  const {
    delay = 0,
    stagger = BASE_DELAY,
    easing = EASING.SPRING,
    onComplete,
  } = options;
  
  if (prefersReducedMotion) {
    // Just show the text immediately
    element.style.opacity = '1';
    onComplete?.();
    return;
  }
  
  const text = element.textContent ?? '';
  element.textContent = '';
  element.style.opacity = '1';
  
  // Create a span for each character
  const chars: HTMLSpanElement[] = [];
  for (const char of text) {
    const span = document.createElement('span');
    span.textContent = char === ' ' ? '\u00A0' : char; // Non-breaking space for spaces
    span.style.cssText = `
      display: inline-block;
      opacity: 0;
      transform: translateY(20px) scale(0.8);
    `;
    element.appendChild(span);
    chars.push(span);
  }
  
  // Animate each character with stagger
  chars.forEach((span, i) => {
    const charDelay = delay + i * stagger;
    
    trackedTimeout(() => {
      const anim = span.animate([
        // Starting position (below, small)
        { opacity: 0, transform: 'translateY(20px) scale(0.8)', offset: 0 },
        // Overshoot (bounce up past final position)
        { opacity: 1, transform: 'translateY(-4px) scale(1.05)', offset: 0.6 },
        // Settle with slight undershoot
        { opacity: 1, transform: 'translateY(2px) scale(0.98)', offset: 0.8 },
        // Final position
        { opacity: 1, transform: 'translateY(0) scale(1)', offset: 1 },
      ], {
        duration: 350,
        easing,
        fill: 'forwards',
      });
      
      // Call onComplete after last character
      if (i === chars.length - 1) {
        anim.onfinish = () => onComplete?.();
      }
    }, charDelay);
  });
}

// ============================================================================
// ⌨️ TYPEWRITER EFFECT
// ============================================================================

/**
 * Typewriter effect with blinking cursor.
 * Classic, satisfying text reveal.
 * 
 * @param element - Element to type into
 * @param text - Text to type
 * @param options - Animation options
 */
export function typewriterEffect(
  element: HTMLElement,
  text: string,
  options: {
    speed?: number; // Characters per second
    cursor?: boolean;
    cursorChar?: string;
    onComplete?: () => void;
  } = {}
): () => void {
  const {
    speed = 40,
    cursor = true,
    cursorChar = '|',
    onComplete,
  } = options;
  
  // Calculate delay between characters
  const delay = 1000 / speed;
  
  if (prefersReducedMotion) {
    element.textContent = text;
    onComplete?.();
    return () => {};
  }
  
  // Clear element and add cursor
  element.textContent = '';
  let cursorElement: HTMLSpanElement | null = null;
  
  if (cursor) {
    cursorElement = document.createElement('span');
    cursorElement.textContent = cursorChar;
    cursorElement.className = 'typewriter-cursor';
    cursorElement.style.cssText = `
      display: inline-block;
      animation: blink 0.7s steps(2) infinite;
    `;
    element.appendChild(cursorElement);
    
    // Add blink animation if not already present
    if (!document.getElementById('typewriter-styles')) {
      const style = document.createElement('style');
      style.id = 'typewriter-styles';
      style.textContent = `
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  let currentIndex = 0;
  let timeoutId: ReturnType<typeof setTimeout>;
  
  const typeNext = () => {
    if (currentIndex < text.length) {
      const char = text[currentIndex];
      const textNode = document.createTextNode(char ?? '');
      
      // Insert before cursor
      if (cursorElement) {
        element.insertBefore(textNode, cursorElement);
      } else {
        element.appendChild(textNode);
      }
      
      currentIndex++;
      
      // Variable timing for natural feel
      const variance = Math.random() * delay * 0.5;
      const charDelay = char === ' ' ? delay * 0.5 : delay + variance;
      
      timeoutId = trackedTimeout(typeNext, charDelay);
    } else {
      // Typing complete
      if (cursorElement) {
        // Keep cursor blinking for a moment, then fade out
        trackedTimeout(() => {
          if (cursorElement) {
            cursorElement.animate([
              { opacity: 1 },
              { opacity: 0 },
            ], {
              duration: 500,
              fill: 'forwards',
            }).onfinish = () => {
              cursorElement?.remove();
            };
          }
        }, 1500);
      }
      onComplete?.();
    }
  };
  
  // Start typing after a brief pause
  timeoutId = trackedTimeout(typeNext, 200);
  
  // Return cancel function
  return () => {
    clearTimeout(timeoutId);
    cursorElement?.remove();
  };
}

// ============================================================================
// 🔀 SCRAMBLE-TO-REVEAL EFFECT
// ============================================================================

/**
 * Scramble text then reveal the actual text.
 * Great for name reveals during handoff.
 * 
 * @param element - Element containing text
 * @param finalText - Final text to reveal
 * @param options - Animation options
 */
export function scrambleReveal(
  element: HTMLElement,
  finalText: string,
  options: {
    duration?: number;
    chars?: string;
    onComplete?: () => void;
  } = {}
): () => void {
  const {
    duration = 800,
    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*',
    onComplete,
  } = options;
  
  if (prefersReducedMotion) {
    element.textContent = finalText;
    onComplete?.();
    return () => {};
  }
  
  const startTime = performance.now();
  const originalLength = finalText.length;
  let animationFrame: number;
  
  const update = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Characters revealed so far (eased)
    const easedProgress = easeOutQuart(progress);
    const revealedCount = Math.floor(easedProgress * originalLength);
    
    // Build display string
    let displayText = '';
    for (let i = 0; i < originalLength; i++) {
      if (i < revealedCount) {
        // Revealed character
        displayText += finalText[i];
      } else {
        // Random character
        const randomIndex = Math.floor(Math.random() * chars.length);
        displayText += chars[randomIndex];
      }
    }
    
    element.textContent = displayText;
    
    if (progress < 1) {
      animationFrame = requestAnimationFrame(update);
    } else {
      element.textContent = finalText;
      onComplete?.();
    }
  };
  
  animationFrame = requestAnimationFrame(update);
  
  // Return cancel function
  return () => {
    cancelAnimationFrame(animationFrame);
    element.textContent = finalText;
  };
}

// ============================================================================
// 💫 TEXT BREATHING/PULSE
// ============================================================================

/**
 * Apply a subtle breathing animation to text.
 * Makes important callouts feel alive.
 * 
 * @param element - Element to animate
 * @param options - Animation options
 */
export function textBreathing(
  element: HTMLElement,
  options: {
    intensity?: number; // 0-1, how dramatic the effect
    duration?: number;
  } = {}
): () => void {
  const {
    intensity = 0.5,
    duration = 3000,
  } = options;
  
  if (prefersReducedMotion) {
    return () => {};
  }
  
  const scale = 1 + (0.02 * intensity);
  const opacity = 1 - (0.1 * intensity);
  
  const anim = element.animate([
    { transform: 'scale(1)', opacity: 1, offset: 0 },
    { transform: `scale(${scale})`, opacity: opacity, offset: 0.5 },
    { transform: 'scale(1)', opacity: 1, offset: 1 },
  ], {
    duration,
    iterations: Infinity,
    easing: 'ease-in-out',
  });
  
  const anims = activeAnimations.get(element) ?? [];
  anims.push(anim);
  activeAnimations.set(element, anims);
  
  return () => {
    anim.cancel();
    const remaining = activeAnimations.get(element)?.filter(a => a !== anim) ?? [];
    if (remaining.length === 0) {
      activeAnimations.delete(element);
    } else {
      activeAnimations.set(element, remaining);
    }
  };
}

// ============================================================================
// 🎭 NAME HANDOFF ANIMATION
// ============================================================================

/**
 * Animate name change during persona handoff.
 * Combines scramble effect with Pixar-style reveal.
 * 
 * @param element - Name element
 * @param newName - New persona name
 * @param options - Animation options
 */
export async function animateNameHandoff(
  element: HTMLElement,
  newName: string,
  options: {
    duration?: number;
    onComplete?: () => void;
  } = {}
): Promise<void> {
  const {
    duration = 600,
    onComplete,
  } = options;
  
  if (prefersReducedMotion) {
    element.textContent = newName;
    onComplete?.();
    return;
  }
  
  return new Promise<void>((resolve) => {
    // Phase 1: Shrink and fade current name
    const shrinkAnim = element.animate([
      { transform: 'scale(1)', opacity: 1, offset: 0 },
      { transform: 'scale(0.95)', opacity: 0.5, offset: 0.4 },
      { transform: 'scale(0.9)', opacity: 0, offset: 1 },
    ], {
      duration: duration * 0.4,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    });

    shrinkAnim.onfinish = () => {
      // CRITICAL: Cancel Phase 1 animation before Phase 2/3 to prevent stuck opacity: 0
      // Web Animations with fill: 'forwards' persist even after onfinish!
      shrinkAnim.cancel();

      // Phase 2: Scramble reveal new name
      scrambleReveal(element, newName, {
        duration: duration * 0.4,
        onComplete: () => {
          // Phase 3: Pop into place
          const popAnim = element.animate([
            { transform: 'scale(0.95)', opacity: 0.8, offset: 0 },
            { transform: 'scale(1.05)', opacity: 1, offset: 0.5 },
            { transform: 'scale(1)', opacity: 1, offset: 1 },
          ], {
            duration: duration * 0.2,
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            fill: 'forwards',
          });

          popAnim.onfinish = () => {
            // Clear animation and set final styles to prevent stuck states
            popAnim.cancel();
            element.style.transform = '';
            element.style.opacity = '';
            onComplete?.();
            resolve();
          };
        },
      });
    };
  });
}

// ============================================================================
// 🌊 WAVE TEXT EFFECT
// ============================================================================

/**
 * Make text wave like a Mexican wave.
 * Fun for celebratory moments.
 * 
 * @param element - Element with text
 * @param options - Animation options
 */
export function waveText(
  element: HTMLElement,
  options: {
    amplitude?: number;
    wavelength?: number;
    duration?: number;
    iterations?: number;
  } = {}
): () => void {
  const {
    amplitude = 8,
    wavelength = 4,
    duration = 1500,
    iterations = 1,
  } = options;
  
  if (prefersReducedMotion) {
    return () => {};
  }
  
  const text = element.textContent ?? '';
  element.textContent = '';
  
  const chars: HTMLSpanElement[] = [];
  for (const char of text) {
    const span = document.createElement('span');
    span.textContent = char === ' ' ? '\u00A0' : char;
    span.style.display = 'inline-block';
    element.appendChild(span);
    chars.push(span);
  }
  
  // Animate each character with phase offset
  const animations: Animation[] = [];
  chars.forEach((span, i) => {
    const phaseOffset = (i / wavelength) * Math.PI * 2;
    
    const anim = span.animate([
      { transform: `translateY(0)`, offset: 0 },
      { transform: `translateY(-${amplitude}px)`, offset: 0.25 },
      { transform: `translateY(0)`, offset: 0.5 },
      { transform: `translateY(${amplitude * 0.3}px)`, offset: 0.75 },
      { transform: `translateY(0)`, offset: 1 },
    ], {
      duration,
      iterations,
      delay: (phaseOffset / (Math.PI * 2)) * (duration / wavelength),
      easing: 'ease-in-out',
    });
    
    animations.push(anim);
  });
  
  return () => {
    animations.forEach(a => a.cancel());
    // Restore original text
    element.textContent = text;
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Ease out quart function for smooth deceleration.
 */
function easeOutQuart(x: number): number {
  return 1 - Math.pow(1 - x, 4);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  // Cancel all active animations
  activeAnimations.forEach((animations) => {
    animations.forEach(anim => anim.cancel());
  });
  activeAnimations.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const kineticTypographyUI = {
  init: initKineticTypography,
  reveal: revealText,
  typewriter: typewriterEffect,
  scramble: scrambleReveal,
  breathing: textBreathing,
  handoff: animateNameHandoff,
  wave: waveText,
  dispose,
};

