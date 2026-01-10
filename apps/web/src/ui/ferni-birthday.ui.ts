/**
 * Ferni Birthday UI - Celebrate Ferni's birthday!
 *
 * On Ferni's birthday (June 15), the app shows a special celebration
 * with warm animations, special messages, and party mode.
 *
 * Design principles:
 * - Warm, not garish (zen celebration)
 * - Once per day celebration
 * - Special avatar state
 * - Unlocks "birthday" theme for the day
 *
 * Security note: All HTML is hardcoded (no user input).
 *
 * @module ui/ferni-birthday
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('FerniBirthday');

// ============================================================================
// CONSTANTS
// ============================================================================

// Ferni's birthday: June 15 (month is 0-indexed in JS)
const FERNI_BIRTHDAY_MONTH = 5; // June
const FERNI_BIRTHDAY_DAY = 15;

const STORAGE_KEY = 'ferni_birthday_celebrated';

// Birthday messages (warm, human tone)
const BIRTHDAY_MESSAGES = [
  "It's Ferni's birthday! Thank you for being here.",
  "Ferni turns another year wiser today!",
  "Happy Birthday, Ferni! Here's to growing together.",
  "Today's special - it's Ferni's birthday!",
];

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let partyModeActive = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initFerniBirthdayUI(): void {
  if (isInitialized) return;

  injectStyles();

  // Check if it's Ferni's birthday
  if (isFerniBirthday() && !hasCelebratedToday()) {
    // Celebrate after a short delay to let the app load
    setTimeout(() => celebrate(), 2000);
  }

  isInitialized = true;
  log.info('Ferni Birthday UI initialized', { isBirthday: isFerniBirthday() });
}

// ============================================================================
// DATE CHECKING
// ============================================================================

function isFerniBirthday(): boolean {
  const today = new Date();
  return (
    today.getMonth() === FERNI_BIRTHDAY_MONTH &&
    today.getDate() === FERNI_BIRTHDAY_DAY
  );
}

function hasCelebratedToday(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;

    const { date } = JSON.parse(stored) as { date: string };
    const today = new Date().toDateString();
    return date === today;
  } catch {
    return false;
  }
}

function markCelebrated(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ date: new Date().toDateString() })
    );
  } catch (err) {
    log.warn('Failed to save celebration state', { error: String(err) });
  }
}

// ============================================================================
// CELEBRATION
// ============================================================================

function celebrate(): void {
  log.info('Celebrating Ferni\'s birthday!');

  // Mark as celebrated for today
  markCelebrated();

  // Play celebration sound
  soundUI.play('celebrate');

  // Show birthday toast
  const message = BIRTHDAY_MESSAGES[Math.floor(Math.random() * BIRTHDAY_MESSAGES.length)] ?? "Happy Birthday, Ferni!";
  toast.success(message);

  // Add birthday class to avatar
  const avatar = document.querySelector('#coachAvatar');
  if (avatar) {
    avatar.classList.add('ferni-birthday-celebration');
    setTimeout(() => {
      avatar.classList.remove('ferni-birthday-celebration');
    }, DURATION.GLACIAL * 2);
  }

  // Add party glow to app
  document.body.classList.add('ferni-birthday-mode');

  // Create floating cake icon
  createFloatingCake();

  // Haptic feedback
  if ('vibrate' in navigator) {
    navigator.vibrate([50, 30, 50, 30, 100]);
  }
}

function createFloatingCake(): void {
  const avatar = document.querySelector('#coachAvatar');
  if (!avatar) return;

  const rect = avatar.getBoundingClientRect();

  const floater = document.createElement('div');
  floater.className = 'ferni-birthday-floater';

  // Create cake SVG via DOM (safe approach)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '32');

  // Cake path (birthday cake icon)
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm8 14v-3h1v-4h-1V9.6c0-.9-.7-1.6-1.6-1.6H5.6C4.7 8 4 8.7 4 9.6V13H3v4h1v3H2v2h20v-2h-2zm-8-4c-1.7 0-3-1.3-3-3h2c0 .6.4 1 1 1s1-.4 1-1h2c0 1.7-1.3 3-3 3z'
  );

  svg.appendChild(path);
  floater.appendChild(svg);

  floater.style.left = `${rect.left + rect.width / 2}px`;
  floater.style.top = `${rect.top}px`;

  document.body.appendChild(floater);

  // Remove after animation
  setTimeout(() => floater.remove(), 2000);
}

// ============================================================================
// PARTY MODE (Can be triggered manually)
// ============================================================================

export function enablePartyMode(): void {
  if (partyModeActive) return;

  partyModeActive = true;
  document.body.classList.add('ferni-birthday-mode');
  soundUI.play('celebrate');
  toast.success("Party mode activated!");

  log.debug('Party mode enabled');
}

export function disablePartyMode(): void {
  if (!partyModeActive) return;

  partyModeActive = false;
  document.body.classList.remove('ferni-birthday-mode');

  log.debug('Party mode disabled');
}

export function togglePartyMode(): boolean {
  if (partyModeActive) {
    disablePartyMode();
  } else {
    enablePartyMode();
  }
  return partyModeActive;
}

export function isPartyModeActive(): boolean {
  return partyModeActive;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'ferni-birthday-styles';
  styleElement.textContent = `
    /* ========================================
       FERNI BIRTHDAY CELEBRATION
       Warm, zen-like birthday mode
       ======================================== */

    /* Birthday celebration animation on avatar */
    #coachAvatar.ferni-birthday-celebration {
      animation: birthdayPulse ${DURATION.GLACIAL * 2}ms ${EASING.SPRING};
    }

    @keyframes birthdayPulse {
      0%, 100% {
        transform: scale(1);
        filter: brightness(1);
      }
      20% {
        transform: scale(1.1);
        filter: brightness(1.3) hue-rotate(10deg);
      }
      40% {
        transform: scale(1.05);
        filter: brightness(1.2);
      }
      60% {
        transform: scale(1.08);
        filter: brightness(1.25) hue-rotate(5deg);
      }
      80% {
        transform: scale(1.02);
        filter: brightness(1.1);
      }
    }

    /* Birthday mode - subtle warm glow on app */
    .ferni-birthday-mode {
      --birthday-glow: rgba(255, 200, 100, 0.1);
    }

    .ferni-birthday-mode .avatar-container {
      box-shadow:
        0 0 30px var(--birthday-glow),
        0 0 60px var(--birthday-glow);
    }

    /* Floating cake icon */
    .ferni-birthday-floater {
      position: fixed;
      pointer-events: none;
      z-index: var(--z-notification, 3000);
      color: var(--color-semantic-warning, #f59e0b);
      animation: cakeFloat 2s ${EASING.EXPO_OUT} forwards;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
    }

    @keyframes cakeFloat {
      0% {
        opacity: 1;
        transform: translateY(0) scale(1) rotate(0deg);
      }
      50% {
        opacity: 1;
        transform: translateY(-40px) scale(1.2) rotate(-10deg);
      }
      100% {
        opacity: 0;
        transform: translateY(-80px) scale(1.4) rotate(10deg);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      #coachAvatar.ferni-birthday-celebration {
        animation: none;
      }

      .ferni-birthday-floater {
        animation: cakeFade 1s ease forwards;
      }

      @keyframes cakeFade {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeFerniBirthdayUI(): void {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  disablePartyMode();
  isInitialized = false;
  log.debug('Ferni Birthday UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ferniBirthdayUI = {
  init: initFerniBirthdayUI,
  dispose: disposeFerniBirthdayUI,
  isBirthday: isFerniBirthday,
  celebrate,
  enablePartyMode,
  disablePartyMode,
  togglePartyMode,
  isPartyModeActive,
};
