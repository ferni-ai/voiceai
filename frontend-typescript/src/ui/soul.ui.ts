/**
 * Soul UI - Ferni's Living Presence
 *
 * Subtle presence that makes Ferni feel alive:
 * - First launch experience (simple, warm)
 * - Avatar eye tracking (subtle WALL-E effect)
 * - Avatar "eye reveal" (transforms initials to eye for special moments)
 * - Persona transitions (smooth handoffs)
 *
 * Philosophy: Zen simplicity. Present but not distracting.
 *
 * @example
 * import { initSoul, revealAvatarEye } from './ui/soul.ui.js';
 * await initSoul();
 *
 * // For special moments:
 * await revealAvatarEye(); // Avatar briefly becomes an eye
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';

// Soul components
import {
  showFerniAwakens,
  hasSeenAwakening,
  resetAwakening,
  dismissAwakening,
} from './ferni-awakens.ui.js';

import {
  initEyeTracking,
  initAvatarEyeTracking,
  disposeAvatarEyeTracking,
  pauseAvatarEyeTracking,
  avatarLookAt,
  lookAround,
} from './eye-tracking.ui.js';

import {
  initPersonaMagic,
  disposePersonaMagic,
  performMagicalHandoff,
  celebrationBurst,
  empathyPulse,
  type MagicalHandoffOptions,
} from './persona-magic.ui.js';

const log = createLogger('Soul');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let avatarEyeTrackingId: string | null = null;
let isEyeRevealed = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Ferni's soul - the living presence system
 */
export async function initSoul(options: {
  /** Show first launch experience if user hasn't seen it */
  showFirstLaunch?: boolean;
  /** Enable eye tracking on avatar */
  enableEyeTracking?: boolean;
  /** Enable persona magic transitions */
  enablePersonaMagic?: boolean;
} = {}): Promise<void> {
  if (isInitialized) {
    log.debug('Soul already initialized');
    return;
  }

  const {
    showFirstLaunch = true,
    enableEyeTracking = true,
    enablePersonaMagic = true,
  } = options;

  log.info('Initializing soul');

  // Inject eye reveal styles
  injectEyeRevealStyles();

  // 1. Show first launch experience if needed
  if (showFirstLaunch && !hasSeenAwakening()) {
    log.info('First launch - showing awakening experience');
    await showFerniAwakens();
  }

  // 2. Initialize eye tracking for avatar (subtle movement)
  if (enableEyeTracking) {
    const avatarSelector = '#coachAvatar, .avatar-container';
    const avatar = document.querySelector(avatarSelector);
    if (avatar) {
      avatarEyeTrackingId = initAvatarEyeTracking(avatarSelector);
      log.debug('Avatar eye tracking initialized');
    } else {
      // Watch for avatar to appear
      const observer = new MutationObserver(() => {
        const avatarEl = document.querySelector(avatarSelector);
        if (avatarEl && !avatarEyeTrackingId) {
          avatarEyeTrackingId = initAvatarEyeTracking(avatarSelector);
          log.debug('Avatar eye tracking initialized (deferred)');
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // 3. Initialize persona magic
  if (enablePersonaMagic) {
    initPersonaMagic();
    log.debug('Persona magic initialized');
  }

  // 4. Set up event listeners
  setupEventListeners();

  isInitialized = true;
  log.info('Soul initialized');
}

/**
 * Dispose of all soul components
 */
export function disposeSoul(): void {
  disposeAvatarEyeTracking();
  disposePersonaMagic();
  isInitialized = false;
  log.debug('Soul disposed');
}

// ============================================================================
// AVATAR EYE REVEAL - The Magic Moment
// ============================================================================

/**
 * Briefly transform the avatar's initials into an eye
 * Use sparingly for special engagement moments:
 * - First connection
 * - Milestone celebrations
 * - When Ferni "notices" something
 *
 * @param duration How long to show the eye (ms)
 */
export async function revealAvatarEye(duration = 2000): Promise<void> {
  if (isEyeRevealed || prefersReducedMotion()) return;

  const avatarText = document.querySelector('#avatarText');
  const coachAvatar = document.querySelector('#coachAvatar');
  if (!avatarText || !coachAvatar) return;

  isEyeRevealed = true;
  pauseAvatarEyeTracking(duration + 500);

  // Store original content
  const originalContent = avatarText.textContent;
  const originalClass = avatarText.className;

  // Create eye SVG
  const eyeSvg = createEyeSvg();

  // Morph to eye
  avatarText.classList.add('avatar-text--morphing');
  coachAvatar.classList.add('avatar--eye-mode');

  await sleep(DURATION.FAST);

  // Replace with eye
  avatarText.textContent = '';
  avatarText.appendChild(eyeSvg);
  avatarText.classList.remove('avatar-text--morphing');
  avatarText.classList.add('avatar-text--eye');

  // Eye "wakes up" animation
  await animateEyeOpen(eyeSvg);

  // Hold the eye
  await sleep(duration);

  // Morph back to text
  avatarText.classList.add('avatar-text--morphing');
  await sleep(DURATION.FAST);

  // Restore original
  avatarText.innerHTML = '';
  avatarText.textContent = originalContent;
  avatarText.className = originalClass;
  coachAvatar.classList.remove('avatar--eye-mode');

  isEyeRevealed = false;
}

/**
 * Create the eye SVG element
 */
function createEyeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  svg.setAttribute('class', 'avatar-eye-svg');
  svg.innerHTML = `
    <ellipse class="avatar-eye-white" cx="30" cy="30" rx="22" ry="18" fill="white"/>
    <circle class="avatar-eye-iris" cx="30" cy="30" r="12" fill="#5a8060"/>
    <circle class="avatar-eye-pupil" cx="30" cy="30" r="6" fill="#2c2520"/>
    <circle class="avatar-eye-catchlight" cx="26" cy="26" r="3" fill="white" opacity="0.9"/>
  `;
  return svg;
}

/**
 * Animate the eye opening
 */
async function animateEyeOpen(svg: SVGSVGElement): Promise<void> {
  const eyeWhite = svg.querySelector('.avatar-eye-white');
  const pupil = svg.querySelector('.avatar-eye-pupil');
  const catchlight = svg.querySelector('.avatar-eye-catchlight');

  if (eyeWhite) {
    await animate(
      eyeWhite,
      [
        { transform: 'scaleY(0.1)', transformOrigin: '30px 30px' },
        { transform: 'scaleY(1.05)', transformOrigin: '30px 30px', offset: 0.7 },
        { transform: 'scaleY(1)', transformOrigin: '30px 30px' },
      ],
      DURATION.MODERATE,
      EASING.SPRING
    );
  }

  if (pupil) {
    void animate(
      pupil,
      [
        { transform: 'scale(0.5)' },
        { transform: 'scale(1.1)', offset: 0.5 },
        { transform: 'scale(1)' },
      ],
      DURATION.MODERATE,
      EASING.GENTLE
    );
  }

  if (catchlight) {
    void animate(
      catchlight,
      [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 0.9 }],
      DURATION.MODERATE,
      EASING.GENTLE
    );
  }
}

// ============================================================================
// EVENT INTEGRATION
// ============================================================================

function setupEventListeners(): void {
  // Persona switch -> magical handoff
  window.addEventListener('ferni:switch-persona', ((e: CustomEvent) => {
    const { fromId, toId, fromName, toName, banter } = e.detail;
    void performMagicalHandoff({
      fromId,
      toId,
      fromName,
      toName,
      banter,
    });
  }) as EventListener);

  // Celebration events
  window.addEventListener('ferni:celebration', () => {
    void celebrationBurst();
  });

  // Empathy moments
  window.addEventListener('ferni:empathy', () => {
    void empathyPulse();
  });

  // Milestone achievements - reveal the eye!
  window.addEventListener('ferni:milestone', () => {
    void revealAvatarEye(1500);
  });

  // Stage changes
  window.addEventListener('ferni:stage-change', () => {
    void celebrationBurst();
  });

  // Team unlock
  window.addEventListener('ferni:team-unlock', () => {
    void celebrationBurst();
  });

  log.debug('Soul event listeners set up');
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// STYLES
// ============================================================================

let styleElement: HTMLStyleElement | null = null;

function injectEyeRevealStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'soul-eye-reveal-styles';
  styleElement.textContent = `
    /* Avatar Eye Reveal Styles */
    .avatar-text--morphing {
      opacity: 0;
      transform: scale(0.8);
      transition: opacity ${DURATION.FAST}ms ease, transform ${DURATION.FAST}ms ease;
    }

    .avatar-text--eye {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar--eye-mode {
      /* Subtle glow when in eye mode */
      box-shadow: 0 0 20px rgba(90, 128, 96, 0.3);
    }

    .avatar-eye-svg {
      width: 80%;
      height: 80%;
    }

    .avatar-eye-white {
      transform-origin: 30px 30px;
    }

    .avatar-eye-pupil {
      transform-origin: 30px 30px;
    }

    @media (prefers-reduced-motion: reduce) {
      .avatar-text--morphing {
        transition: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Manually show the first launch experience
 */
export async function showFirstLaunchExperience(): Promise<void> {
  resetAwakening();
  await showFerniAwakens();
}

/**
 * Make the avatar look at a specific screen position
 */
export function makeAvatarLookAt(x: number, y: number): void {
  avatarLookAt(x, y);
}

/**
 * Make the avatar look around curiously
 */
export async function makeAvatarLookAround(): Promise<void> {
  if (avatarEyeTrackingId) {
    await lookAround(avatarEyeTrackingId);
  }
}

/**
 * Perform a magical handoff between personas
 */
export async function switchPersonaMagically(options: MagicalHandoffOptions): Promise<void> {
  await performMagicalHandoff(options);
}

/**
 * Trigger a celebration
 */
export async function triggerCelebration(): Promise<void> {
  await celebrationBurst();
}

/**
 * Pause all eye tracking (for modal overlays, etc.)
 */
export function pauseAllEyeTracking(duration = 1000): void {
  pauseAvatarEyeTracking(duration);
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export {
  // Ferni Awakens
  showFerniAwakens,
  hasSeenAwakening,
  resetAwakening,
  dismissAwakening,

  // Eye Tracking
  initEyeTracking,
  initAvatarEyeTracking,
  disposeAvatarEyeTracking,
  pauseAvatarEyeTracking,
  avatarLookAt,
  lookAround,

  // Persona Magic
  initPersonaMagic,
  disposePersonaMagic,
  performMagicalHandoff,
  celebrationBurst,
  empathyPulse,
};

export type { MagicalHandoffOptions };

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

const soul = {
  init: initSoul,
  dispose: disposeSoul,
  showFirstLaunch: showFirstLaunchExperience,
  revealEye: revealAvatarEye,
  lookAt: makeAvatarLookAt,
  lookAround: makeAvatarLookAround,
  switchPersona: switchPersonaMagically,
  celebrate: triggerCelebration,
  pauseEyeTracking: pauseAllEyeTracking,
};

export default soul;
