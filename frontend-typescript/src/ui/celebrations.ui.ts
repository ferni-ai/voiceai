/**
 * Celebrations UI - Human-like Joy and Expressiveness
 *
 * Apple/Japanese aesthetic: Subtle warmth, breathing animations,
 * and purposeful motion that feels alive rather than gamified.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * - Uses DURATION/EASING from animation-constants.ts
 * - Uses CSS variables from tokens.css
 * - Respects prefers-reduced-motion
 * - No particle explosions or confetti (zen aesthetic)
 *
 * Key principles:
 * - Warmth through glow and color temperature
 * - Breathing through scale and opacity
 * - Connection through soft bounces
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';

// ============================================================================
// TYPES
// ============================================================================

type CelebrationIntensity = 'subtle' | 'gentle' | 'warm' | 'intense';

interface WarmthOptions {
  intensity?: CelebrationIntensity;
  duration?: number;
  target?: HTMLElement | null;
}

// ============================================================================
// DURATION BY INTENSITY (using design system values)
// ============================================================================

const INTENSITY_DURATION: Record<CelebrationIntensity, number> = {
  subtle: DURATION.CELEBRATION,       // 800ms
  gentle: DURATION.ENTRANCE,          // 1200ms
  warm: DURATION.GLACIAL,             // 1500ms
  intense: DURATION.GLACIAL * 1.33,   // 2000ms
};

// ============================================================================
// STATE
// ============================================================================

const activeAnimations: Map<HTMLElement, Animation[]> = new Map();

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initCelebrationsUI(): void {
  // Inject CSS for celebration classes
  injectCelebrationStyles();
}

/**
 * Inject celebration-specific CSS styles
 */
function injectCelebrationStyles(): void {
  const styleId = 'celebrations-ui-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ========================================
       CELEBRATION EFFECTS
       Zen-inspired, warm, human-like
       ======================================== */

    /* Warmth glow - candle-like flickering */
    .warmth-glow {
      animation: warmth-pulse var(--duration-entrance, 1200ms) var(--ease-gentle) forwards;
    }

    @keyframes warmth-pulse {
      0%, 100% { 
        filter: brightness(1) drop-shadow(0 0 0 transparent);
      }
      50% { 
        filter: brightness(1.1) drop-shadow(0 0 20px var(--persona-glow, rgba(212, 168, 74, 0.4)));
      }
    }

    .warmth-subtle { animation-duration: var(--duration-celebration, 800ms); }
    .warmth-gentle { animation-duration: var(--duration-entrance, 1200ms); }
    .warmth-warm { animation-duration: var(--duration-glacial, 1500ms); }
    .warmth-intense { animation-duration: 2000ms; }

    /* Gentle bounce - acknowledgement nod */
    .gentle-bounce {
      animation: gentle-bounce var(--duration-dramatic, 600ms) var(--ease-spring) forwards;
    }

    @keyframes gentle-bounce {
      0%, 100% { transform: translateY(0) scale(1); }
      40% { transform: translateY(-4px) scale(1.02); }
      70% { transform: translateY(1px) scale(0.99); }
    }

    /* Connection warmth - understanding spreads outward */
    .connection-warmth {
      animation: connection-spread var(--duration-glacial, 1500ms) var(--ease-expo-out) forwards;
    }

    @keyframes connection-spread {
      0% { 
        box-shadow: 0 0 0 0 var(--persona-glow, rgba(212, 168, 74, 0.4));
      }
      50% { 
        box-shadow: 0 0 40px 10px var(--persona-glow, rgba(212, 168, 74, 0.3));
      }
      100% { 
        box-shadow: 0 0 0 0 transparent;
      }
    }

    /* Soft acknowledge - barely perceptible */
    .soft-acknowledge {
      animation: soft-ack var(--duration-moderate, 400ms) var(--ease-gentle) forwards;
    }

    @keyframes soft-ack {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.92; transform: scale(1.01); }
    }

    /* First connection - app-wide warmth */
    .first-connection {
      animation: first-connect 2000ms var(--ease-gentle) forwards;
    }

    @keyframes first-connect {
      0%, 100% { 
        --color-background-primary: var(--color-background-primary);
      }
      50% { 
        --color-background-primary: color-mix(in srgb, var(--color-background-primary), var(--persona-tint) 10%);
      }
    }

    /* Reduced motion - simplified effects */
    @media (prefers-reduced-motion: reduce) {
      .warmth-glow,
      .gentle-bounce,
      .connection-warmth,
      .soft-acknowledge,
      .first-connection {
        animation: none;
      }

      .warmth-glow {
        filter: brightness(1.05);
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// CORE EFFECTS - Human-like warmth and breathing
// ============================================================================

/**
 * Express warmth through a soft glow animation.
 * Like a candle flickering or warm sunlight.
 */
export function warmthGlow(options: WarmthOptions = {}): void {
  // Skip if reduced motion is preferred (graceful degradation)
  if (prefersReducedMotion()) {
    return;
  }

  const target = options.target ?? document.querySelector('.avatar-container');
  if (!target) return;

  const intensity = options.intensity ?? 'gentle';
  const duration = options.duration ?? INTENSITY_DURATION[intensity];

  // Add animation classes
  target.classList.add('warmth-glow', `warmth-${intensity}`);

  // Clean up after animation
  setTimeout(() => {
    target.classList.remove('warmth-glow', `warmth-${intensity}`);
  }, duration);
}

/**
 * Express acknowledgement through gentle bounce.
 * Like a nod or bow - understated recognition.
 */
export function gentleBounce(options: WarmthOptions = {}): void {
  if (prefersReducedMotion()) return;

  const target = options.target ?? document.querySelector('.avatar-container');
  if (!target) return;

  target.classList.add('gentle-bounce');

  setTimeout(() => {
    target.classList.remove('gentle-bounce');
  }, DURATION.DRAMATIC);
}

/**
 * Express connection through warmth spreading outward.
 * Like the feeling of being understood.
 */
export function connectionWarmth(options: WarmthOptions = {}): void {
  if (prefersReducedMotion()) return;

  const target = options.target ?? document.querySelector('.avatar-container');
  if (!target) return;

  target.classList.add('connection-warmth');

  setTimeout(() => {
    target.classList.remove('connection-warmth');
  }, DURATION.GLACIAL);
}

/**
 * Soft acknowledgement - barely perceptible but felt.
 * For small moments of connection.
 */
export function softAcknowledge(options: WarmthOptions = {}): void {
  if (prefersReducedMotion()) return;

  const target = options.target ?? document.querySelector('.avatar-container');
  if (!target) return;

  target.classList.add('soft-acknowledge');

  setTimeout(() => {
    target.classList.remove('soft-acknowledge');
  }, DURATION.MODERATE);
}

// ============================================================================
// LEGACY API - Maintained for compatibility but redirected to zen effects
// ============================================================================

/**
 * @deprecated Use warmthGlow() instead - confetti is not aligned with zen aesthetic
 */
export function confetti(_options: {
  count?: number;
  origin?: { x: number; y: number };
  spread?: number;
  colors?: string[];
} = {}): void {
  // Redirect to warmth glow
  warmthGlow({ intensity: 'gentle' });
}

/**
 * @deprecated Use warmthGlow() instead - sparkles replaced with warmth
 */
export function sparkles(_options: {
  count?: number;
  origin?: { x: number; y: number };
  radius?: number;
  colors?: string[];
} = {}): void {
  // Redirect to warmth glow
  warmthGlow({ intensity: 'gentle' });
}

/**
 * @deprecated Use connectionWarmth() instead
 */
export function firework(_x: number, _y: number, _color?: string): void {
  connectionWarmth();
}

/**
 * @deprecated Use connectionWarmth() instead
 */
export function fireworks(_count = 3): void {
  connectionWarmth();
}

/**
 * @deprecated Use softAcknowledge() instead
 */
export function bubbles(_options: {
  count?: number;
  colors?: string[];
} = {}): void {
  softAcknowledge();
}

// ============================================================================
// MILESTONE CELEBRATIONS - Warm acknowledgements, not explosions
// ============================================================================

/**
 * First connection - warm welcome, not a party.
 */
export function celebrateFirstConnection(): void {
  connectionWarmth();

  // Also add a subtle glow to the app
  const app = document.getElementById('app');
  if (app && !prefersReducedMotion()) {
    app.classList.add('first-connection');
    setTimeout(() => app.classList.remove('first-connection'), DURATION.GLACIAL * 1.33);
  }
}

/**
 * Milestone achieved - gentle acknowledgement with message.
 */
export function celebrateMilestone(milestone: string): void {
  warmthGlow({ intensity: 'warm' });
  showMilestoneToast(milestone);
}

/**
 * Discovery moment - soft recognition.
 */
export function celebrateDiscovery(): void {
  gentleBounce();
  warmthGlow({ intensity: 'subtle' });
}

/**
 * Milestone celebration - avatar-based (no text toast).
 * The avatar shows success through its behavior.
 */
function showMilestoneToast(_message: string): void {
  if (prefersReducedMotion()) return;

  // Avatar feedback - joy reaction with warm glow
  const avatar = document.getElementById('coachAvatar');
  const avatarRing = document.getElementById('avatarRing');

  if (avatar) {
    // Joy animation - bouncy and warm
    avatar.animate(
      [
        { transform: 'scale(1) translateY(0)', filter: 'brightness(1)' },
        { transform: 'scale(1.04) translateY(-4px)', filter: 'brightness(1.1)' },
        { transform: 'scale(0.98) translateY(1px)', filter: 'brightness(1.05)' },
        { transform: 'scale(1.02) translateY(-2px)', filter: 'brightness(1.08)' },
        { transform: 'scale(1) translateY(0)', filter: 'brightness(1)' },
      ],
      { duration: DURATION.DRAMATIC, easing: EASING.SPRING }
    );
  }

  if (avatarRing) {
    // Ring celebration pulse
    avatarRing.animate(
      [
        { opacity: '0.6', transform: 'scale(1)', boxShadow: '0 0 0 transparent' },
        { opacity: '0.9', transform: 'scale(1.05)', boxShadow: '0 0 15px var(--persona-glow)' },
        { opacity: '0.7', transform: 'scale(1)', boxShadow: '0 0 8px var(--persona-glow)' },
      ],
      { duration: DURATION.CELEBRATION, easing: EASING.STANDARD }
    );
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  // Clear any active animation classes
  const elements = document.querySelectorAll(
    '.warmth-glow, .gentle-bounce, .connection-warmth, .soft-acknowledge'
  );
  elements.forEach((el) => {
    el.classList.remove('warmth-glow', 'gentle-bounce', 'connection-warmth', 'soft-acknowledge');
  });

  activeAnimations.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const celebrationsUI = {
  init: initCelebrationsUI,
  // New zen API
  warmthGlow,
  gentleBounce,
  connectionWarmth,
  softAcknowledge,
  // Legacy API (redirects to zen effects)
  confetti,
  sparkles,
  firework,
  fireworks,
  bubbles,
  // Milestones
  celebrateFirstConnection,
  celebrateMilestone,
  celebrateDiscovery,
  dispose,
};
