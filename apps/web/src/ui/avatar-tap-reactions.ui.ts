/**
 * Avatar Tap Reactions UI
 *
 * Adds delightful tap interactions to the avatar - tap to see Ferni
 * laugh or wink. Creates a playful, engaging experience.
 *
 * Design principles:
 * - Discoverable: rewards curious users
 * - Non-intrusive: doesn't interrupt conversation flow
 * - Varied: alternates between reactions for surprise
 * - Accessible: respects reduced motion preferences
 *
 * Security note: All event handlers are on trusted elements.
 *
 * @module ui/avatar-tap-reactions
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { avatarFeedback } from './avatar-feedback.ui.js';

const log = createLogger('AvatarTapReactions');

// ============================================================================
// TYPES
// ============================================================================

type TapReaction = 'laugh' | 'wink' | 'giggle' | 'curious-blink';

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let lastReaction: TapReaction | null = null;
let tapCount = 0;
let rapidTapTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// CONSTANTS
// ============================================================================

// Reactions with weights (higher = more likely)
const REACTIONS: { type: TapReaction; weight: number }[] = [
  { type: 'laugh', weight: 3 },
  { type: 'wink', weight: 3 },
  { type: 'giggle', weight: 2 },
  { type: 'curious-blink', weight: 2 },
];

// Cooldown between reactions (ms)
const REACTION_COOLDOWN = 800;
let lastReactionTime = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initAvatarTapReactionsUI(): void {
  if (isInitialized) return;

  // Find the avatar element
  const avatar = document.getElementById('coachAvatar');
  if (!avatar) {
    // Retry after a short delay if avatar not found yet
    setTimeout(() => {
      const retryAvatar = document.getElementById('coachAvatar');
      if (retryAvatar) {
        setupTapHandler(retryAvatar);
        injectStyles();
        isInitialized = true;
        log.info('Avatar Tap Reactions UI initialized (delayed)');
      } else {
        log.warn('Avatar element not found for tap reactions');
      }
    }, 1000);
    return;
  }

  setupTapHandler(avatar);
  injectStyles();

  isInitialized = true;
  log.info('Avatar Tap Reactions UI initialized');
}

// ============================================================================
// TAP HANDLER
// ============================================================================

function setupTapHandler(avatar: HTMLElement): void {
  // Make avatar focusable and indicate it's interactive
  avatar.setAttribute('tabindex', '0');
  avatar.setAttribute('role', 'button');
  avatar.setAttribute('aria-label', 'Tap for a fun reaction');
  avatar.style.cursor = 'pointer';

  // Click/tap handler
  avatar.addEventListener('click', handleAvatarTap);

  // Keyboard support (Enter/Space)
  avatar.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAvatarTap();
    }
  });

  log.debug('Tap handler attached to avatar');
}

function handleAvatarTap(): void {
  const now = Date.now();

  // Respect cooldown
  if (now - lastReactionTime < REACTION_COOLDOWN) {
    return;
  }
  lastReactionTime = now;

  // Track rapid taps for Easter egg
  tapCount++;
  if (rapidTapTimeout) {
    clearTimeout(rapidTapTimeout);
  }
  rapidTapTimeout = setTimeout(() => {
    if (tapCount >= 5) {
      // Easter egg: 5+ rapid taps triggers a special reaction
      playSpecialReaction();
    }
    tapCount = 0;
  }, 1500);

  // Pick a reaction (avoiding repeat)
  const reaction = pickReaction();
  lastReaction = reaction;

  playReaction(reaction);
}

// ============================================================================
// REACTION SELECTION
// ============================================================================

function pickReaction(): TapReaction {
  // Filter out the last reaction to avoid repeats
  const availableReactions = REACTIONS.filter(r => r.type !== lastReaction);

  // Weighted random selection
  const totalWeight = availableReactions.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;

  for (const reaction of availableReactions) {
    random -= reaction.weight;
    if (random <= 0) {
      return reaction.type;
    }
  }

  // Fallback
  return 'laugh';
}

// ============================================================================
// REACTION PLAYBACK
// ============================================================================

function playReaction(reaction: TapReaction): void {
  const avatar = document.getElementById('coachAvatar');
  const coach = document.getElementById('coach');
  if (!avatar || !coach) return;

  // Check reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Just show a brief brightness pulse
    avatar.animate(
      [{ filter: 'brightness(1.1)' }, { filter: 'brightness(1)' }],
      { duration: 200 }
    );
    return;
  }

  // Remove any existing reaction classes
  coach.classList.remove(
    'tap-reaction-laugh',
    'tap-reaction-wink',
    'tap-reaction-giggle',
    'tap-reaction-curious-blink'
  );

  // Force reflow
  void coach.offsetWidth;

  // Add the reaction class
  coach.classList.add(`tap-reaction-${reaction}`);

  log.debug('Tap reaction played', { reaction });

  // Remove class after animation completes
  setTimeout(() => {
    coach.classList.remove(`tap-reaction-${reaction}`);
  }, 700);
}

function playSpecialReaction(): void {
  const avatar = document.getElementById('coachAvatar');
  const coach = document.getElementById('coach');
  if (!avatar || !coach) return;

  log.debug('Special reaction triggered (rapid taps)');

  // Use the existing Pixar bounce reaction for the special tap
  avatarFeedback.pixarReact('bounce');

  // Show a brief whisper
  avatarFeedback.whisper('Hehe, that tickles!', 'success', 1500);
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'avatar-tap-reactions-styles';
  styleElement.textContent = `
    /* ========================================
       AVATAR TAP REACTIONS
       Delightful response to user taps
       ======================================== */

    /* Laugh - happy shake with brightness */
    #coach.tap-reaction-laugh #coachAvatar {
      animation: tapLaugh 600ms ${EASING.SPRING};
    }

    @keyframes tapLaugh {
      0% {
        transform: scale(1) rotate(0deg);
        filter: brightness(1);
      }
      15% {
        transform: scale(1.05) rotate(-3deg);
        filter: brightness(1.1);
      }
      30% {
        transform: scale(1.03) rotate(3deg);
        filter: brightness(1.15);
      }
      45% {
        transform: scale(1.04) rotate(-2deg);
        filter: brightness(1.1);
      }
      60% {
        transform: scale(1.02) rotate(2deg);
        filter: brightness(1.05);
      }
      75% {
        transform: scale(1.01) rotate(-1deg);
      }
      100% {
        transform: scale(1) rotate(0deg);
        filter: brightness(1);
      }
    }

    /* Wink - playful squish to one side */
    #coach.tap-reaction-wink #coachAvatar {
      animation: tapWink 500ms ${EASING.SPRING};
    }

    @keyframes tapWink {
      0% {
        transform: scale(1, 1) rotate(0deg);
        filter: brightness(1);
      }
      20% {
        transform: scale(0.92, 1.08) rotate(-5deg);
        filter: brightness(1.05);
      }
      40% {
        transform: scale(1.04, 0.96) rotate(2deg);
        filter: brightness(1.1);
      }
      60% {
        transform: scale(0.98, 1.02) rotate(-1deg);
      }
      80% {
        transform: scale(1.01, 0.99) rotate(0.5deg);
      }
      100% {
        transform: scale(1, 1) rotate(0deg);
        filter: brightness(1);
      }
    }

    /* Giggle - small bouncy shake */
    #coach.tap-reaction-giggle #coachAvatar {
      animation: tapGiggle 450ms ${EASING.SPRING};
    }

    @keyframes tapGiggle {
      0%, 100% {
        transform: translateX(0) scale(1);
      }
      10% {
        transform: translateX(-2px) scale(1.02);
      }
      20% {
        transform: translateX(2px) scale(0.99);
      }
      30% {
        transform: translateX(-2px) scale(1.01);
      }
      40% {
        transform: translateX(1px) scale(1);
      }
      50% {
        transform: translateX(-1px) scale(1.01);
      }
      60% {
        transform: translateX(1px) scale(1);
      }
      70% {
        transform: translateX(0) scale(1);
      }
    }

    /* Curious Blink - quick vertical squash */
    #coach.tap-reaction-curious-blink #coachAvatar {
      animation: tapCuriousBlink 400ms ${EASING.EXPO_OUT};
    }

    @keyframes tapCuriousBlink {
      0% {
        transform: scaleY(1) translateY(0);
        filter: brightness(1);
      }
      15% {
        transform: scaleY(0.7) translateY(2px);
        filter: brightness(1.05);
      }
      30% {
        transform: scaleY(1.05) translateY(-2px);
        filter: brightness(1.1);
      }
      50% {
        transform: scaleY(0.85) translateY(1px);
      }
      70% {
        transform: scaleY(1.02) translateY(-1px);
      }
      100% {
        transform: scaleY(1) translateY(0);
        filter: brightness(1);
      }
    }

    /* Focus state for keyboard users */
    #coachAvatar:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 4px;
    }

    /* Hover hint that avatar is tappable */
    #coachAvatar:hover {
      filter: brightness(1.03);
      transition: filter ${DURATION.FAST}ms;
    }

    /* Reduced motion - just subtle brightness */
    @media (prefers-reduced-motion: reduce) {
      #coach.tap-reaction-laugh #coachAvatar,
      #coach.tap-reaction-wink #coachAvatar,
      #coach.tap-reaction-giggle #coachAvatar,
      #coach.tap-reaction-curious-blink #coachAvatar {
        animation: tapSimple 200ms ease;
      }

      @keyframes tapSimple {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.1); }
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeAvatarTapReactionsUI(): void {
  const avatar = document.getElementById('coachAvatar');
  if (avatar) {
    avatar.removeEventListener('click', handleAvatarTap);
    avatar.removeAttribute('tabindex');
    avatar.removeAttribute('role');
    avatar.removeAttribute('aria-label');
    avatar.style.cursor = '';
  }

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  if (rapidTapTimeout) {
    clearTimeout(rapidTapTimeout);
    rapidTapTimeout = null;
  }

  isInitialized = false;
  log.debug('Avatar Tap Reactions UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const avatarTapReactionsUI = {
  init: initAvatarTapReactionsUI,
  dispose: disposeAvatarTapReactionsUI,
  playReaction,
};
