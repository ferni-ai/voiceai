/**
 * Avatar Animation Handlers
 *
 * Handles all avatar animation testing actions from the dev panel:
 * - Avatar Lamp (Pixar Luxo Jr. body language)
 * - Expression testing (wink, curious tilt, sleepy, etc.)
 * - Ferni expressions system
 *
 * @module dev-panel/handlers/avatar-animations
 */

import { createLogger } from '../../../utils/logger.js';
import { DURATION, EASING } from '../../../config/animation-constants.js';
import { createTimeoutTracker } from '../../../utils/tracked-timeout.js';
import { presenceUI } from '../../presence.ui.js';
import { avatarLamp, type LampEmotion } from '../../avatar-lamp.ui.js';
import { ferniExpressions, type EmotionalExpression } from '../../ferni-expressions.ui.js';

const log = createLogger('DevPanel:AvatarAnimations');
const { trackedTimeout } = createTimeoutTracker('dev-panel-avatar');

// ============================================================================
// AVATAR LAMP ACTIONS - Pixar Luxo Jr. Body Language
// ============================================================================

/**
 * Trigger an avatar lamp action
 */
export function triggerLampAction(action: string): void {
  switch (action) {
    case 'bounce':
      avatarLamp.bounce(0.5, 1);
      log.info('Avatar Lamp: bounce');
      break;

    case 'bounce-big':
      avatarLamp.bounce(0.9, 3);
      log.info('Avatar Lamp: big bounce');
      break;

    case 'tilt-right':
      avatarLamp.tilt('right', 0.6);
      log.info('Avatar Lamp: tilt right');
      break;

    case 'tilt-left':
      avatarLamp.tilt('left', 0.5);
      log.info('Avatar Lamp: tilt left');
      break;

    case 'tilt-forward':
      avatarLamp.tilt('forward', 0.5);
      log.info('Avatar Lamp: lean forward');
      break;

    case 'perk-up':
      avatarLamp.perkUp();
      log.info('Avatar Lamp: perk up');
      break;

    case 'nod':
      avatarLamp.nod(2, 'normal');
      log.info('Avatar Lamp: nod');
      break;

    case 'nod-slow':
      avatarLamp.nod(1, 'slow');
      log.info('Avatar Lamp: slow nod');
      break;

    case 'shake':
      avatarLamp.shake(0.6);
      log.info('Avatar Lamp: shake');
      break;

    case 'shrink':
      avatarLamp.shrink(0.5);
      trackedTimeout(() => avatarLamp.unshrink(), 1500);
      log.info('Avatar Lamp: shrink');
      break;

    case 'breathing-start':
      avatarLamp.startBreathing();
      log.info('Avatar Lamp: breathing started');
      break;

    case 'breathing-stop':
      avatarLamp.stopBreathing();
      log.info('Avatar Lamp: breathing stopped');
      break;

    default:
      log.warn({ action }, 'Unknown lamp action');
  }
}

/**
 * Set avatar lamp emotion
 */
export function setLampEmotion(emotion: LampEmotion): void {
  avatarLamp.setEmotion(emotion);
  log.info({ emotion }, 'Avatar Lamp: emotion set');
}

// ============================================================================
// QUICK EXPRESSION ANIMATIONS
// ============================================================================

/**
 * Quick wink animation
 */
export function triggerWink(): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  if (!avatar) return;

  avatar.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(0.95) scaleX(0.9)', offset: 0.2 },
      { transform: 'scale(1.02)', offset: 0.5 },
      { transform: 'scale(1)' },
    ],
    {
      duration: 400,
      easing: EASING.SPRING,
    }
  );
  log.info('Triggered wink');
}

/**
 * Curious head tilt animation
 */
export function triggerCuriousTilt(): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  if (!avatar) return;

  avatar.animate(
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-8deg) translateY(-2px)', offset: 0.3 },
      { transform: 'rotate(-8deg) translateY(-2px)', offset: 0.7 },
      { transform: 'rotate(0deg)' },
    ],
    {
      duration: DURATION.CELEBRATION,
      easing: 'ease-in-out',
    }
  );
  log.info('Triggered curious tilt');
}

/**
 * Secret smile animation - avatar text briefly curves
 */
export function triggerSecretSmile(): void {
  const avatarText = document.querySelector('#avatarText') as HTMLElement;
  if (!avatarText) return;

  avatarText.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.05) translateY(-2px)', offset: 0.3 },
      { transform: 'scale(1.05) translateY(-2px)', offset: 0.7 },
      { transform: 'scale(1)' },
    ],
    {
      duration: 1000,
      easing: 'ease-in-out',
    }
  );
  log.info('Triggered secret smile');
}

/**
 * Sleepy yawn animation for late night
 */
export function triggerSleepy(): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  const avatarText = document.querySelector('#avatarText') as HTMLElement;
  if (!avatar) return;

  // Avatar droops slightly
  avatar.animate(
    [
      { transform: 'scale(1) translateY(0)' },
      { transform: 'scale(0.98) translateY(3px)', offset: 0.3 },
      { transform: 'scale(1.02) translateY(-2px)', offset: 0.5 },
      { transform: 'scale(0.98) translateY(2px)', offset: 0.7 },
      { transform: 'scale(1) translateY(0)' },
    ],
    {
      duration: 1500,
      easing: 'ease-in-out',
    }
  );

  // Text shrinks (closing eyes)
  if (avatarText) {
    avatarText.animate(
      [
        { transform: 'scaleY(1)' },
        { transform: 'scaleY(0.7)', offset: 0.3 },
        { transform: 'scaleY(1.1)', offset: 0.5 },
        { transform: 'scaleY(0.8)', offset: 0.7 },
        { transform: 'scaleY(1)' },
      ],
      {
        duration: 1500,
        easing: 'ease-in-out',
      }
    );
  }
  log.info('Triggered sleepy');
}

// ============================================================================
// FERNI EXPRESSIONS SYSTEM
// ============================================================================

/**
 * Trigger a Ferni expression
 */
export function triggerFerniExpression(expression: EmotionalExpression): void {
  ferniExpressions.setExpression(expression);
  log.info({ expression }, 'Ferni expression triggered');
}

/**
 * Clear Ferni expression
 */
export function clearFerniExpression(): void {
  ferniExpressions.setExpression('neutral');
  log.info('Ferni expression cleared');
}

// ============================================================================
// EXPRESSION TESTING (character reactions)
// ============================================================================

/**
 * Map of friendly UI names to expression triggers
 */
const EXPRESSION_MAP: Record<string, () => void> = {
  chuckle: () => {
    const avatar = document.querySelector('#coachAvatar') as HTMLElement;
    presenceUI.flashEmotion('happy', 1500);
    avatar?.animate(
      [
        { transform: 'translateX(0) rotate(0deg)' },
        { transform: 'translateX(-2px) rotate(-1deg)', offset: 0.1 },
        { transform: 'translateX(2px) rotate(1deg)', offset: 0.2 },
        { transform: 'translateX(-2px) rotate(-1deg)', offset: 0.3 },
        { transform: 'translateX(2px) rotate(1deg)', offset: 0.4 },
        { transform: 'translateX(0) rotate(0deg)' },
      ],
      { duration: DURATION.DRAMATIC, easing: EASING.SPRING }
    );
    log.info('Expression: chuckle');
  },
  curious: () => {
    triggerCuriousTilt();
    log.info('Expression: curious');
  },
  concerned: () => {
    const avatar = document.querySelector('#coachAvatar') as HTMLElement;
    presenceUI.flashEmotion('concerned', 2000);
    avatar?.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(3px) scale(0.98)', offset: 0.4 },
        { transform: 'translateY(3px) scale(0.98)', offset: 0.6 },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: DURATION.CELEBRATION, easing: 'ease-in-out' }
    );
    log.info('Expression: concerned');
  },
  excited: () => {
    const avatar = document.querySelector('#coachAvatar') as HTMLElement;
    presenceUI.flashEmotion('excited', 1500);
    avatar?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.08) translateY(-4px)', offset: 0.3 },
        { transform: 'scale(0.95)', offset: 0.6 },
        { transform: 'scale(1)' },
      ],
      { duration: DURATION.DELIBERATE, easing: EASING.SPRING }
    );
    log.info('Expression: excited');
  },
  thinking: () => {
    const avatar = document.querySelector('#coachAvatar') as HTMLElement;
    presenceUI.flashEmotion('thinking', 2000);
    avatar?.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(5deg) translateY(-2px)', offset: 0.3 },
        { transform: 'rotate(5deg) translateY(-2px)', offset: 0.7 },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 1000, easing: 'ease-in-out' }
    );
    log.info('Expression: thinking');
  },
  surprised: () => {
    const avatar = document.querySelector('#coachAvatar') as HTMLElement;
    presenceUI.flashEmotion('surprised', 1200);
    avatar?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.1) translateY(-5px)', offset: 0.15 },
        { transform: 'scale(1.05)', offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      { duration: DURATION.SLOW, easing: EASING.SPRING }
    );
    log.info('Expression: surprised');
  },
  sympathetic: () => {
    const avatar = document.querySelector('#coachAvatar') as HTMLElement;
    presenceUI.flashEmotion('sympathetic', 2500);
    avatar?.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-3deg) translateY(2px)', offset: 0.4 },
        { transform: 'rotate(-3deg) translateY(2px)', offset: 0.7 },
        { transform: 'rotate(0deg) translateY(0)' },
      ],
      { duration: 1200, easing: 'ease-in-out' }
    );
    log.info('Expression: sympathetic');
  },
  wink: () => {
    triggerWink();
  },
  sleepy: () => {
    triggerSleepy();
  },
  secretSmile: () => {
    triggerSecretSmile();
  },
};

/**
 * Trigger a character expression by name
 */
export function triggerExpression(expression: string): void {
  const handler = EXPRESSION_MAP[expression];
  if (handler) {
    handler();
  } else {
    log.warn({ expression }, 'Unknown expression');
  }
}

/**
 * Get list of available expressions
 */
export function getAvailableExpressions(): string[] {
  return Object.keys(EXPRESSION_MAP);
}
