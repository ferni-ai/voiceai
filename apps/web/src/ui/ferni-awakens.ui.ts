/**
 * Ferni Awakens - First Launch Experience
 *
 * Apple-level restraint. One perfect moment.
 *
 * THE ZEN PHILOSOPHY:
 * - Less is more. Trust the simplicity.
 * - One thing, done perfectly.
 * - Let the connection speak for itself.
 *
 * THE SEQUENCE (3 beats):
 * 1. Logo appears (simple scale, finds center)
 * 2. Eye opens, settles on you (the moment of connection)
 * 3. "Hello." + invitation to begin
 *
 * That's it. No aurora. No particles. No rings. Just presence.
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('FerniAwakens');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// CONSTANTS
// ============================================================================

const AWAKENS_ID = 'ferni-awakens';
const STORAGE_KEY = 'ferni_has_awakened';

// Brand colors (CSS variable fallbacks)
const COLORS = {
  background: '#F5F1E8', // Paper Cream
  sage: '#4a6741', // Ferni primary
  ink: '#2c2520', // Natural Ink
  inkSecondary: '#5c544a', // Secondary text
  white: '#ffffff',
  iris: '#5a8060',
};

// Simplified timing
const TIMING = {
  // Phase 1: Logo entrance
  logoEntrance: 600,

  // Phase 2: Eye opens
  eyeOpenDelay: 200,
  eyeOpenDuration: 400,

  // Phase 3: Greeting appears
  greetingDelay: 300,
  greetingDuration: 400,

  // Phase 4: CTA appears
  ctaDelay: 400,
  ctaDuration: 300,

  // Minimum time before allowing dismissal
  minimumShowTime: 1500,
};

// ============================================================================
// STATE
// ============================================================================

let awakeningContainer: HTMLElement | null = null;
let isAwakening = false;
let styleElement: HTMLStyleElement | null = null;
let resolveAwakening: (() => void) | null = null;

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Check if user has seen the awakening before
 */
export function hasSeenAwakening(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark that user has seen the awakening
 */
function markAwakeningSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset awakening state (for testing)
 */
export function resetAwakening(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    log.info('Awakening reset');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Show the first launch experience
 * Returns a promise that resolves when the user dismisses it
 */
export async function showFerniAwakens(): Promise<void> {
  if (isAwakening) {
    log.warn('Awakening already in progress');
    return;
  }

  // Skip entirely for reduced motion
  if (prefersReducedMotion()) {
    log.info('Awakening skipped: user prefers reduced motion');
    markAwakeningSeen();
    return;
  }

  log.info('Ferni awakens');
  isAwakening = true;

  // Inject styles
  injectStyles();

  // Create the container
  awakeningContainer = document.createElement('div');
  awakeningContainer.id = AWAKENS_ID;
  awakeningContainer.className = 'ferni-awakens';
  awakeningContainer.innerHTML = getAwakensHTML();

  // Add to DOM (hidden initially)
  document.body.prepend(awakeningContainer);

  // Prevent scrolling
  document.body.style.overflow = 'hidden';

  // Force reflow then show
  void awakeningContainer.offsetHeight;
  awakeningContainer.classList.add('ferni-awakens--visible');

  // Run the sequence
  await runAwakeningSequence();

  // Set up dismissal
  return new Promise((resolve) => {
    resolveAwakening = resolve;

    // Allow dismissal after minimum time
    trackedTimeout(() => {
      setupDismissal();
    }, TIMING.minimumShowTime);
  });
}

/**
 * Dismiss the awakening
 */
export function dismissAwakening(): void {
  if (!awakeningContainer) return;

  log.info('Awakening dismissed');

  // Animate out
  awakeningContainer.classList.add('ferni-awakens--exiting');

  trackedTimeout(() => {
    awakeningContainer?.remove();
    awakeningContainer = null;
    document.body.style.overflow = '';
    isAwakening = false;
    markAwakeningSeen();
    resolveAwakening?.();
  }, DURATION.NORMAL);
}

// ============================================================================
// THE SEQUENCE - 3 BEATS
// ============================================================================

async function runAwakeningSequence(): Promise<void> {
  if (!awakeningContainer) return;

  const logo = awakeningContainer.querySelector('.awakens-logo') as SVGSVGElement;
  const eyeWhite = awakeningContainer.querySelector('.awakens-eye-white') as SVGEllipseElement;
  const pupil = awakeningContainer.querySelector('.awakens-pupil') as SVGCircleElement;
  const catchlight = awakeningContainer.querySelector('.awakens-catchlight') as SVGCircleElement;
  const mouth = awakeningContainer.querySelector('.awakens-mouth') as SVGPathElement;
  const greeting = awakeningContainer.querySelector('.awakens-greeting') as HTMLElement;
  const subtext = awakeningContainer.querySelector('.awakens-subtext') as HTMLElement;
  const cta = awakeningContainer.querySelector('.awakens-cta') as HTMLElement;

  // ═══════════════════════════════════════════════════════════════════════════
  // BEAT 1: Logo appears
  // ═══════════════════════════════════════════════════════════════════════════

  await animate(
    logo,
    [
      { transform: 'scale(0.9)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    TIMING.logoEntrance,
    EASING.EXPO_OUT
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // BEAT 2: Eye "wakes up" - blinks open, settles on user
  // ═══════════════════════════════════════════════════════════════════════════

  await sleep(TIMING.eyeOpenDelay);

  // Eye opens (from closed slit to full)
  if (eyeWhite) {
    await animate(
      eyeWhite,
      [
        { transform: 'scaleY(0.1)', transformOrigin: '50% 50%' },
        { transform: 'scaleY(1.05)', transformOrigin: '50% 50%', offset: 0.7 },
        { transform: 'scaleY(1)', transformOrigin: '50% 50%' },
      ],
      TIMING.eyeOpenDuration,
      EASING.SPRING
    );
  }

  // Pupil dilates (adjusting to light)
  if (pupil) {
    void animate(
      pupil,
      [
        { transform: 'scale(0.6)' },
        { transform: 'scale(1.1)', offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      TIMING.eyeOpenDuration,
      EASING.GENTLE
    );
  }

  // Catchlight appears (spark of life)
  if (catchlight) {
    void animate(
      catchlight,
      [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }],
      TIMING.eyeOpenDuration,
      EASING.GENTLE
    );
  }

  // Subtle smile appears
  if (mouth) {
    await animate(
      mouth,
      [
        { opacity: 0, transform: 'translateY(-5px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      TIMING.eyeOpenDuration * 0.8,
      EASING.GENTLE
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BEAT 3: Greeting + Invitation
  // ═══════════════════════════════════════════════════════════════════════════

  await sleep(TIMING.greetingDelay);

  // "Hello." appears
  if (greeting) {
    greeting.classList.add('visible');
    await animate(
      greeting,
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      TIMING.greetingDuration,
      EASING.EXPO_OUT
    );
  }

  // Subtext
  if (subtext) {
    await sleep(150);
    subtext.classList.add('visible');
    await animate(
      subtext,
      [{ opacity: 0 }, { opacity: 1 }],
      TIMING.greetingDuration,
      EASING.GENTLE
    );
  }

  // CTA button
  await sleep(TIMING.ctaDelay);
  if (cta) {
    cta.classList.add('visible');
    await animate(
      cta,
      [
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      TIMING.ctaDuration,
      EASING.EXPO_OUT
    );
  }

  log.debug('Awakening sequence complete');
}

// ============================================================================
// HELPERS
// ============================================================================

function animate(
  element: Element | null,
  keyframes: Keyframe[],
  duration: number,
  easing: string
): Promise<void> {
  if (!element) return Promise.resolve();

  return new Promise((resolve) => {
    const anim = element.animate(keyframes, {
      duration,
      easing,
      fill: 'forwards',
    });
    anim.onfinish = () => resolve();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => trackedTimeout(resolve, ms));
}

function setupDismissal(): void {
  if (!awakeningContainer) return;

  // Click CTA button
  const ctaBtn = awakeningContainer.querySelector('.awakens-cta-btn');
  ctaBtn?.addEventListener('click', dismissAwakening);

  // Click anywhere
  awakeningContainer.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('ferni-awakens')) {
      dismissAwakening();
    }
  });

  // Keyboard
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      dismissAwakening();
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);

  awakeningContainer.classList.add('ferni-awakens--ready');
}

// ============================================================================
// HTML TEMPLATE - Minimal, clean
// ============================================================================

function getAwakensHTML(): string {
  return `
    <div class="awakens-content">
      <!-- The logo - simple, centered -->
      <svg class="awakens-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <!-- Body -->
        <circle cx="50" cy="50" r="44" fill="${COLORS.sage}"/>
        
        <!-- Eye white -->
        <ellipse class="awakens-eye-white" cx="50" cy="46" rx="16" ry="14" fill="${COLORS.white}"/>
        
        <!-- Iris -->
        <circle cx="50" cy="46" r="10" fill="${COLORS.iris}"/>
        
        <!-- Pupil -->
        <circle class="awakens-pupil" cx="50" cy="46" r="5" fill="${COLORS.ink}"/>
        
        <!-- Catchlight (life spark) -->
        <circle class="awakens-catchlight" cx="47" cy="43" r="2" fill="${COLORS.white}" opacity="0"/>
        
        <!-- Subtle smile -->
        <path class="awakens-mouth" d="M 38 66 Q 50 74 62 66" 
              stroke="${COLORS.white}" stroke-width="3" stroke-linecap="round" fill="none"
              opacity="0"/>
      </svg>
      
      <!-- Greeting - warm, simple -->
      <h1 class="awakens-greeting">Hello.</h1>
      <p class="awakens-subtext">I'm Ferni, your AI life coach.</p>
      
      <!-- CTA -->
      <button aria-label="Start talking" class="awakens-cta awakens-cta-btn">
        Start talking
      </button>
    </div>
  `;
}

// ============================================================================
// STYLES - Clean, restrained
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'ferni-awakens-styles';
  styleElement.textContent = `
    .ferni-awakens {
      position: fixed;
      inset: 0;
      z-index: var(--z-tooltip);
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${COLORS.background};
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ease;
    }
    
    .ferni-awakens--visible {
      opacity: 1;
    }
    
    .ferni-awakens--ready {
      cursor: pointer;
    }
    
    .ferni-awakens--exiting {
      opacity: 0;
    }
    
    .awakens-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 40px;
      cursor: default;
    }
    
    .awakens-logo {
      width: min(120px, 100%);
      height: 120px;
      margin-bottom: 32px;
      opacity: 0;
    }
    
    .awakens-eye-white {
      transform-origin: 50% 46px;
    }
    
    .awakens-pupil {
      transform-origin: 50% 46px;
    }
    
    .awakens-greeting {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 40px;
      font-weight: 600;
      color: ${COLORS.ink};
      margin: 0 0 8px 0;
      letter-spacing: -0.02em;
      opacity: 0;
    }
    
    .awakens-greeting.visible {
      opacity: 1;
    }
    
    .awakens-subtext {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 17px;
      color: ${COLORS.inkSecondary};
      margin: 0 0 40px 0;
      opacity: 0;
    }
    
    .awakens-subtext.visible {
      opacity: 1;
    }
    
    .awakens-cta {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 16px;
      font-weight: 600;
      padding: 14px 28px;
      background: ${COLORS.sage};
      color: ${COLORS.white};
      border: none;
      border-radius: 100px;
      cursor: pointer;
      opacity: 0;
      transition: transform 150ms ease, background 150ms ease;
    }
    
    .awakens-cta.visible {
      opacity: 1;
    }
    
    .awakens-cta:hover {
      background: #3d5a35;
      transform: translateY(-1px);
    }
    
    .awakens-cta:active {
      transform: scale(0.98);
    }
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .awakens-logo {
        width: min(100px, 100%);
        height: 100px;
      }
      
      .awakens-greeting {
        font-size: 32px;
      }
      
      .awakens-subtext {
        font-size: 15px;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default showFerniAwakens;
