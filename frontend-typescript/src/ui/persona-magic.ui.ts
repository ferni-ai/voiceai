/**
 * Persona Magic - Smooth Persona Transitions
 * 
 * When switching between team members, we create a brief moment
 * of acknowledgment — not a fireworks show.
 * 
 * WHAT IT DOES:
 * - Brief avatar transition (subtle scale/fade)
 * - Play handoff sound (audio feedback)
 * - Show banter toast (if provided)
 * 
 * WHAT IT DOESN'T DO:
 * - Aurora glows
 * - Complex entrance/exit choreography
 * - Competing visual effects
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';

const log = createLogger('PersonaMagic');

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
  
  const { fromId, toId, banter, playSound = true } = options;
  const reducedMotion = prefersReducedMotion();
  
  log.info('Handoff:', { from: fromId, to: toId });
  
  // Dispatch start event
  window.dispatchEvent(new CustomEvent('ferni:handoff-start', {
    detail: { fromId, toId },
  }));
  
  try {
    const avatar = document.querySelector('#coachAvatar, .avatar-container') as HTMLElement;
    
    // Phase 1: Slight fade/shrink (acknowledgment of change)
    if (avatar && !reducedMotion) {
      await animate(avatar, [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.96)', opacity: 0.8 },
      ], DURATION.FAST, EASING.GENTLE);
    }
    
    // Phase 2: Play handoff sound
    if (playSound) {
      void playHandoffSound(toId);
    }
    
    // Phase 3: Show banter if provided
    if (banter && options.fromName) {
      showHandoffBanter(banter, options.fromName);
    }
    
    // Phase 4: Expand back (new persona arrives)
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
// BANTER TOAST
// ============================================================================

let banterElement: HTMLElement | null = null;
let banterTimeout: ReturnType<typeof setTimeout> | null = null;

function showHandoffBanter(banter: string, fromName: string): void {
  // Clear existing
  if (banterElement) {
    banterElement.remove();
    banterElement = null;
  }
  if (banterTimeout) {
    clearTimeout(banterTimeout);
  }
  
  banterElement = document.createElement('div');
  banterElement.className = 'handoff-banter';
  banterElement.innerHTML = `
    <span class="handoff-banter__from">${escapeHtml(fromName)}:</span>
    <span class="handoff-banter__text">"${escapeHtml(banter)}"</span>
  `;
  
  document.body.appendChild(banterElement);
  
  // Trigger entrance animation
  requestAnimationFrame(() => {
    banterElement?.classList.add('visible');
  });
  
  // Auto-dismiss after 3 seconds
  banterTimeout = setTimeout(() => {
    if (banterElement) {
      banterElement.classList.remove('visible');
      setTimeout(() => {
        banterElement?.remove();
        banterElement = null;
      }, DURATION.NORMAL);
    }
  }, 3000);
}

// ============================================================================
// QUICK REACTIONS
// ============================================================================

/**
 * Brief celebration (for milestones)
 */
export async function celebrationBurst(): Promise<void> {
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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  
  styleElement = document.createElement('style');
  styleElement.id = 'persona-magic-styles';
  styleElement.textContent = `
    .handoff-banter {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%) translateY(10px);
      max-width: 360px;
      padding: 14px 20px;
      background: var(--color-background-elevated, rgba(255, 253, 251, 0.98));
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(44, 37, 32, 0.1);
      text-align: center;
      z-index: 1300;
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ease, transform ${DURATION.NORMAL}ms ease;
      pointer-events: none;
    }
    
    .handoff-banter.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    
    .handoff-banter__from {
      display: block;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-muted, #756a5e);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    
    .handoff-banter__text {
      display: block;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 14px;
      font-style: italic;
      line-height: 1.4;
      color: var(--color-text-primary, #2c2520);
    }
    
    /* Dark theme */
    [data-theme="midnight"] .handoff-banter {
      background: var(--color-background-elevated, rgba(112, 96, 90, 0.95));
    }
    
    [data-theme="midnight"] .handoff-banter__text {
      color: var(--color-text-primary, #faf6f0);
    }
    
    @media (max-width: 480px) {
      .handoff-banter {
        bottom: 80px;
        left: 20px;
        right: 20px;
        transform: translateY(10px);
        max-width: none;
      }
      
      .handoff-banter.visible {
        transform: translateY(0);
      }
    }
  `;
  
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
