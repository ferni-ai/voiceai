/**
 * Sleep Mode UI - Gentle resting state when idle
 *
 * When the avatar hasn't had any interaction for a while, it
 * transitions into a gentle "resting" state - subtle breathing
 * animation and dimmed presence. Wakes up on any user interaction.
 *
 * Design principles:
 * - Zen-like: calm, peaceful resting state
 * - Non-intrusive: doesn't feel like the app is broken
 * - Instant wake: any interaction immediately wakes up
 * - Indicates "still here": shows the avatar is alive, just resting
 *
 * Security note: All animations use hardcoded CSS values.
 *
 * @module ui/sleep-mode
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { avatarFeedback } from './avatar-feedback.ui.js';
import { appState } from '../state/app.state.js';

const log = createLogger('SleepMode');

// ============================================================================
// CONSTANTS
// ============================================================================

// Time before entering sleep mode (3 minutes)
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;

// Time to enter deep sleep (additional 5 minutes)
const DEEP_SLEEP_TIMEOUT_MS = 5 * 60 * 1000;

// Z's animation interval
const Z_ANIMATION_INTERVAL_MS = 2000;

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let isSleeping = false;
let isDeepSleeping = false;
let idleTimeout: ReturnType<typeof setTimeout> | null = null;
let deepSleepTimeout: ReturnType<typeof setTimeout> | null = null;
let zAnimationInterval: ReturnType<typeof setInterval> | null = null;
let styleElement: HTMLStyleElement | null = null;
let sleepOverlay: HTMLElement | null = null;

// Track last activity time (used for debugging/logging)

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSleepModeUI(): void {
  if (isInitialized) return;

  injectStyles();
  setupActivityListeners();
  startIdleTimer();

  isInitialized = true;
  log.info('Sleep Mode UI initialized');
}

// ============================================================================
// ACTIVITY TRACKING
// ============================================================================

function setupActivityListeners(): void {
  // Reset idle timer on any user interaction
  const activityEvents = [
    'mousedown',
    'mousemove',
    'keydown',
    'touchstart',
    'scroll',
    'click',
  ];

  for (const event of activityEvents) {
    document.addEventListener(event, handleActivity, { passive: true });
  }

  // Also wake on connection state changes
  appState.subscribe('connection', (state) => {
    if (state === 'connected' || state === 'connecting') {
      handleActivity();
    }
  });

  // Wake on audio state changes (any activity wakes up)
  appState.subscribe('audio', (state) => {
    if (state === 'speaking' || state === 'listening') {
      handleActivity();
    }
  });
}

function handleActivity(): void {

  // Wake up if sleeping
  if (isSleeping) {
    wakeUp();
  }

  // Reset the idle timer
  resetIdleTimer();
}

// ============================================================================
// IDLE TIMER
// ============================================================================

function startIdleTimer(): void {
  resetIdleTimer();
}

function resetIdleTimer(): void {
  // Clear existing timers
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  if (deepSleepTimeout) {
    clearTimeout(deepSleepTimeout);
    deepSleepTimeout = null;
  }

  // Start new idle timer
  idleTimeout = setTimeout(() => {
    // Don't sleep if in a call
    const connectionState = appState.get('connection');
    if (connectionState === 'connected' || connectionState === 'connecting') {
      resetIdleTimer();
      return;
    }

    enterSleepMode();
  }, IDLE_TIMEOUT_MS);
}

// ============================================================================
// SLEEP MODE
// ============================================================================

function enterSleepMode(): void {
  if (isSleeping) return;

  isSleeping = true;
  log.debug('Entering sleep mode');

  const coach = document.getElementById('coach');
  const avatar = document.getElementById('coachAvatar');
  const avatarRing = document.getElementById('avatarRing');

  if (coach) {
    coach.classList.add('sleep-mode');
  }

  // Gentle dim of the avatar
  if (avatar) {
    avatar.animate(
      [
        { filter: 'brightness(1) saturate(1)' },
        { filter: 'brightness(0.7) saturate(0.8)' },
      ],
      {
        duration: DURATION.GLACIAL,
        easing: EASING.EASE_OUT,
        fill: 'forwards',
      }
    );
  }

  // Ring fades
  if (avatarRing) {
    avatarRing.animate(
      [
        { opacity: '0.6' },
        { opacity: '0.2' },
      ],
      {
        duration: DURATION.GLACIAL,
        easing: EASING.EASE_OUT,
        fill: 'forwards',
      }
    );
  }

  // Create sleep overlay with Z's
  createSleepOverlay();

  // Start Z animation
  startZAnimation();

  // Set deep sleep timer
  deepSleepTimeout = setTimeout(() => {
    enterDeepSleep();
  }, DEEP_SLEEP_TIMEOUT_MS);

  // Show whisper
  avatarFeedback.whisper('Resting...', 'info', 2000);
}

function enterDeepSleep(): void {
  if (isDeepSleeping) return;

  isDeepSleeping = true;
  log.debug('Entering deep sleep mode');

  const coach = document.getElementById('coach');
  if (coach) {
    coach.classList.add('deep-sleep-mode');
  }

  // Further dim
  const avatar = document.getElementById('coachAvatar');
  if (avatar) {
    avatar.animate(
      [
        { filter: 'brightness(0.7) saturate(0.8)' },
        { filter: 'brightness(0.5) saturate(0.6)' },
      ],
      {
        duration: DURATION.GLACIAL,
        easing: EASING.EASE_OUT,
        fill: 'forwards',
      }
    );
  }
}

function wakeUp(): void {
  if (!isSleeping) return;

  log.debug('Waking up from sleep mode');

  isSleeping = false;
  isDeepSleeping = false;

  const coach = document.getElementById('coach');
  const avatar = document.getElementById('coachAvatar');
  const avatarRing = document.getElementById('avatarRing');

  if (coach) {
    coach.classList.remove('sleep-mode', 'deep-sleep-mode');
  }

  // Restore avatar brightness
  if (avatar) {
    avatar.animate(
      [
        { filter: 'brightness(1) saturate(1)' },
      ],
      {
        duration: DURATION.MODERATE,
        easing: EASING.SPRING,
        fill: 'forwards',
      }
    );
  }

  // Restore ring
  if (avatarRing) {
    avatarRing.animate(
      [
        { opacity: '0.6' },
      ],
      {
        duration: DURATION.MODERATE,
        easing: EASING.SPRING,
        fill: 'forwards',
      }
    );
  }

  // Remove sleep overlay
  removeSleepOverlay();

  // Stop Z animation
  stopZAnimation();

  // Clear deep sleep timer
  if (deepSleepTimeout) {
    clearTimeout(deepSleepTimeout);
    deepSleepTimeout = null;
  }

  // Play wake animation
  avatarFeedback.pixarReact('nod');
}

// ============================================================================
// SLEEP OVERLAY (Z's Animation)
// ============================================================================

function createSleepOverlay(): void {
  if (sleepOverlay) return;

  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) return;

  sleepOverlay = document.createElement('div');
  sleepOverlay.className = 'sleep-mode-overlay';
  sleepOverlay.setAttribute('aria-hidden', 'true');

  avatarContainer.appendChild(sleepOverlay);

  // Fade in
  requestAnimationFrame(() => {
    sleepOverlay?.classList.add('sleep-mode-overlay--visible');
  });
}

function removeSleepOverlay(): void {
  if (!sleepOverlay) return;

  sleepOverlay.classList.remove('sleep-mode-overlay--visible');

  // Remove after fade out
  setTimeout(() => {
    sleepOverlay?.remove();
    sleepOverlay = null;
  }, 300);
}

function startZAnimation(): void {
  if (zAnimationInterval) return;

  // Create initial Z
  createFloatingZ();

  // Create Z's periodically
  zAnimationInterval = setInterval(() => {
    if (isSleeping && sleepOverlay) {
      createFloatingZ();
    }
  }, Z_ANIMATION_INTERVAL_MS);
}

function stopZAnimation(): void {
  if (zAnimationInterval) {
    clearInterval(zAnimationInterval);
    zAnimationInterval = null;
  }
}

function createFloatingZ(): void {
  if (!sleepOverlay) return;

  // Check reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const z = document.createElement('span');
  z.className = 'sleep-z';
  z.textContent = 'z';

  // Random horizontal offset
  const offsetX = (Math.random() - 0.5) * 40;
  z.style.setProperty('--offset-x', `${offsetX}px`);

  // Random size variation
  const scale = 0.8 + Math.random() * 0.4;
  z.style.setProperty('--z-scale', String(scale));

  // Random animation delay
  const delay = Math.random() * 0.3;
  z.style.animationDelay = `${delay}s`;

  sleepOverlay.appendChild(z);

  // Remove after animation completes
  setTimeout(() => {
    z.remove();
  }, 2500);
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'sleep-mode-styles';
  styleElement.textContent = `
    /* ========================================
       SLEEP MODE
       Gentle resting state when idle
       ======================================== */

    /* Sleep mode breathing animation */
    #coach.sleep-mode .avatar-container {
      animation: sleepBreathing 4s ${EASING.EASE_IN_OUT} infinite;
    }

    @keyframes sleepBreathing {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(0.98);
      }
    }

    /* Deep sleep - even slower breathing */
    #coach.deep-sleep-mode .avatar-container {
      animation: deepSleepBreathing 6s ${EASING.EASE_IN_OUT} infinite;
    }

    @keyframes deepSleepBreathing {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(0.96);
      }
    }

    /* Sleep overlay container */
    .sleep-mode-overlay {
      position: absolute;
      top: -20px;
      right: -10px;
      width: 40px;
      height: 60px;
      pointer-events: none;
      opacity: 0;
      transition: opacity ${DURATION.SLOW}ms;
      overflow: visible;
      z-index: var(--z-floating, 20);
    }

    .sleep-mode-overlay--visible {
      opacity: 1;
    }

    /* Floating Z's */
    .sleep-z {
      position: absolute;
      bottom: 0;
      left: 50%;
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: calc(14px * var(--z-scale, 1));
      font-weight: 700;
      font-style: italic;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      opacity: 0;
      animation: floatZ 2.5s ${EASING.EASE_OUT} forwards;
      transform: translateX(var(--offset-x, 0));
    }

    @keyframes floatZ {
      0% {
        opacity: 0;
        transform: translateX(var(--offset-x, 0)) translateY(0) scale(0.5) rotate(-10deg);
      }
      20% {
        opacity: 0.7;
      }
      80% {
        opacity: 0.5;
      }
      100% {
        opacity: 0;
        transform: translateX(calc(var(--offset-x, 0) + 15px)) translateY(-50px) scale(1) rotate(10deg);
      }
    }

    /* Reduced motion - static sleep indicator */
    @media (prefers-reduced-motion: reduce) {
      #coach.sleep-mode .avatar-container,
      #coach.deep-sleep-mode .avatar-container {
        animation: none;
      }

      .sleep-z {
        animation: none;
        opacity: 0.5;
        transform: translateX(var(--offset-x, 0)) translateY(-20px);
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function isSleepModeActive(): boolean {
  return isSleeping;
}

export function isDeepSleepModeActive(): boolean {
  return isDeepSleeping;
}

/**
 * Manually trigger sleep mode (for testing or settings)
 */
export function triggerSleep(): void {
  if (!isSleeping) {
    enterSleepMode();
  }
}

/**
 * Manually wake up (for testing)
 */
export function triggerWake(): void {
  if (isSleeping) {
    wakeUp();
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeSleepModeUI(): void {
  // Remove activity listeners
  const activityEvents = [
    'mousedown',
    'mousemove',
    'keydown',
    'touchstart',
    'scroll',
    'click',
  ];

  for (const event of activityEvents) {
    document.removeEventListener(event, handleActivity);
  }

  // Clear timers
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  if (deepSleepTimeout) {
    clearTimeout(deepSleepTimeout);
    deepSleepTimeout = null;
  }

  // Stop animations
  stopZAnimation();
  removeSleepOverlay();

  // Remove styles
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  // Reset state
  isSleeping = false;
  isDeepSleeping = false;
  isInitialized = false;

  log.debug('Sleep Mode UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sleepModeUI = {
  init: initSleepModeUI,
  dispose: disposeSleepModeUI,
  isSleeping: isSleepModeActive,
  isDeepSleeping: isDeepSleepModeActive,
  triggerSleep,
  triggerWake,
};
