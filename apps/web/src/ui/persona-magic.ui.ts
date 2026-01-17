/**
 * Persona Magic - Smooth Persona Transitions
 * 
 * When switching between team members, we create a brief moment
 * of acknowledgment — not a fireworks show.
 * 
 * WHAT IT DOES:
 * - Brief avatar transition (subtle scale/fade)
 * - Play handoff sound (audio feedback)
 * - Expression changes to acknowledge transition
 * 
 * WHAT IT DOESN'T DO:
 * - Aurora glows
 * - Complex entrance/exit choreography
 * - Competing visual effects
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { ferniExpressions } from './ferni-expressions.ui.js';

const log = createLogger('PersonaMagic');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface MagicalHandoffOptions {
  fromId: string;
  fromName?: string;
  toId: string;
  toName?: string;
  banter?: string;
  playSound?: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let isTransitioning = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize persona magic
 */
export function initPersonaMagic(): void {
  if (isInitialized) return;
  
  injectStyles();
  isInitialized = true;
  log.info('Persona magic initialized');
}

/**
 * Dispose persona magic
 */
export function disposePersonaMagic(): void {
  styleElement?.remove();
  styleElement = null;
  isInitialized = false;
}

// ============================================================================
// HANDOFF
// ============================================================================

/**
 * Perform a smooth handoff between personas
 */
export async function performMagicalHandoff(options: MagicalHandoffOptions): Promise<void> {
  if (isTransitioning) {
    log.warn('Handoff already in progress');
    return;
  }
  
  if (!isInitialized) {
    initPersonaMagic();
  }
  
  isTransitioning = true;
  
  const { fromId, toId, banter: _banter, playSound = true } = options;
  const reducedMotion = prefersReducedMotion();
  
  log.info('Handoff:', { from: fromId, to: toId });
  
  // Dispatch start event
  window.dispatchEvent(new CustomEvent('ferni:handoff-start', {
    detail: { fromId, toId },
  }));
  
  try {
    const avatar = document.querySelector('#coachAvatar, .avatar-container') as HTMLElement;
    
    // Phase 1: Expression change - "Passing the baton"
    ferniExpressions.setExpression('empathetic', DURATION.FAST);
    
    // Phase 2: Slight fade/shrink (acknowledgment of change)
    if (avatar && !reducedMotion) {
      await animate(avatar, [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.96)', opacity: 0.8 },
      ], DURATION.FAST, EASING.GENTLE);
    }
    
    // Phase 3: Play handoff sound
    if (playSound) {
      void playHandoffSound(toId);
    }
    
    // Phase 4: Expression shift - "New persona arriving"
    ferniExpressions.setExpression('curious', DURATION.FAST);
    
    // Phase 5: Expand back (new persona arrives)
    if (avatar && !reducedMotion) {
      await animate(avatar, [
        { transform: 'scale(0.96)', opacity: 0.8 },
        { transform: 'scale(1.02)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 },
      ], DURATION.SLOW, EASING.SPRING);
      
      // Clean up
      avatar.style.transform = '';
      avatar.style.opacity = '';
    }
    
    // Phase 6: Welcome expression
    trackedTimeout(() => {
      ferniExpressions.happy(600);
    }, DURATION.FAST);
    
  } finally {
    isTransitioning = false;
    
    window.dispatchEvent(new CustomEvent('ferni:handoff-complete', {
      detail: { fromId, toId },
    }));
  }
}

// ============================================================================
// SOUND
// ============================================================================

async function playHandoffSound(personaId: string): Promise<void> {
  try {
    // Try persona-specific sound first, fall back to generic
    const paths = [
      `/design-system/sounds/handoff-to-${personaId}.mp3`,
      `/design-system/sounds/handoff.mp3`,
    ];
    
    for (const path of paths) {
      try {
        const audio = new Audio(path);
        audio.volume = 0.35;
        await audio.play();
        return;
      } catch {
        // Try next path
      }
    }
  } catch {
    // Sound not available - that's fine
    log.debug('Handoff sound not played');
  }
}

// ============================================================================
// QUICK REACTIONS
// ============================================================================

/**
 * Brief celebration (for milestones)
 */
export async function celebrationBurst(_persona?: unknown): Promise<void> {
  // Trigger delighted expression with sparkle
  ferniExpressions.delight();
  ferniExpressions.warmthSparkle();

  if (prefersReducedMotion()) return;

  const avatar = document.querySelector('#coachAvatar, .avatar-container') as HTMLElement;
  if (!avatar) return;

  await animate(avatar, [
    { transform: 'scale(1)' },
    { transform: 'scale(1.06)', offset: 0.3 },
    { transform: 'scale(0.98)', offset: 0.6 },
    { transform: 'scale(1)' },
  ], DURATION.MODERATE, EASING.SPRING);
}

/**
 * Empathy pulse (for emotional moments)
 */
export async function empathyPulse(): Promise<void> {
  // Trigger empathetic expression
  ferniExpressions.empathy();
  
  if (prefersReducedMotion()) return;
  
  const avatar = document.querySelector('#coachAvatar, .avatar-container') as HTMLElement;
  if (!avatar) return;
  
  await animate(avatar, [
    { transform: 'scale(1)' },
    { transform: 'scale(1.02)', offset: 0.5 },
    { transform: 'scale(1)' },
  ], DURATION.SLOW, EASING.GENTLE);
}

// ============================================================================
// HELPERS
// ============================================================================

function animate(
  element: Element,
  keyframes: Keyframe[],
  duration: number,
  easing: string
): Promise<void> {
  return new Promise((resolve) => {
    const anim = element.animate(keyframes, {
      duration,
      easing,
      fill: 'forwards',
    });
    anim.onfinish = () => resolve();
  });
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  
  styleElement = document.createElement('style');
  styleElement.id = 'persona-magic-styles';
  // Styles reserved for future handoff animations
  styleElement.textContent = ``;
  
  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const personaMagic = {
  init: initPersonaMagic,
  dispose: disposePersonaMagic,
  handoff: performMagicalHandoff,
  celebrationBurst,
  empathyPulse,
};

export default personaMagic;
