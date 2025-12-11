/**
 * Avatar Lamp UI - Pixar Luxo Jr. Level Personality
 *
 * The Pixar lamp expresses incredible emotion with NO FACE - just body language.
 * This module brings that same magic to Ferni's avatar.
 *
 * LUXO JR. PRINCIPLES:
 * ====================
 * 1. WEIGHT - Movements feel like they have mass
 * 2. ANTICIPATION - Wind-up before every action
 * 3. SQUASH & STRETCH - Deformation during movement
 * 4. FOLLOW-THROUGH - Overshoot and settle
 * 5. SECONDARY ACTION - Small movements that support the main action
 * 6. TIMING - Fast for excitement, slow for contemplation
 * 7. APPEAL - Every pose should be appealing
 *
 * AVATAR CAPABILITIES:
 * ====================
 * - Breathing: Gentle idle pulse (alive, not static)
 * - Bouncing: Excitement, acknowledgment, celebration
 * - Tilting: Curiosity, confusion, listening lean
 * - Nodding: Agreement, understanding, encouragement
 * - Shrinking: Concern, sadness, empathy
 * - Perking: Interest, realization, surprise
 * - Shaking: Playful disagreement, laughter
 * - Looking: Whole-body orientation toward interest
 */

import { gsap } from '../utils/gsap-setup.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AvatarLamp');

// ============================================================================
// TYPES
// ============================================================================

export type LampEmotion =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'confused'
  | 'listening'
  | 'thinking'
  | 'sad'
  | 'empathetic'
  | 'proud'
  | 'surprised'
  | 'laughing'
  | 'acknowledging'
  | 'encouraging'
  | 'celebrating';

interface LampState {
  isInitialized: boolean;
  isAnimating: boolean;
  currentEmotion: LampEmotion;
  breathingActive: boolean;
  breathingTimeline: gsap.core.Timeline | null;
}

// ============================================================================
// STATE
// ============================================================================

const state: LampState = {
  isInitialized: false,
  isAnimating: false,
  currentEmotion: 'neutral',
  breathingActive: false,
  breathingTimeline: null,
};

// Element references
let avatarContainer: HTMLElement | null = null;
let coachAvatar: HTMLElement | null = null;

// Animation timelines
let emotionTimeline: gsap.core.Timeline | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Avatar Lamp system.
 * Starts breathing animation and sets up the avatar for body-language expression.
 */
export function initAvatarLamp(): void {
  if (state.isInitialized) return;

  avatarContainer = document.querySelector('.avatar-container');
  coachAvatar = document.getElementById('coachAvatar');

  if (!avatarContainer || !coachAvatar) {
    log.warn('Avatar elements not found, deferring initialization');
    setTimeout(initAvatarLamp, 500);
    return;
  }

  // Inject styles
  injectLampStyles();

  // Start breathing
  startBreathing();

  // Set up event listeners
  setupEventListeners();

  state.isInitialized = true;
  log.info('🎬 Avatar Lamp initialized - Luxo Jr. mode activated!');
}

/**
 * Dispose of the Avatar Lamp system.
 */
export function disposeAvatarLamp(): void {
  stopBreathing();
  emotionTimeline?.kill();

  avatarContainer = null;
  coachAvatar = null;
  state.isInitialized = false;
}

// ============================================================================
// BREATHING - The Avatar is ALIVE
// ============================================================================

/**
 * Start the breathing animation.
 * Subtle scale oscillation that makes the avatar feel alive.
 */
export function startBreathing(): void {
  if (state.breathingActive || !coachAvatar) return;

  state.breathingActive = true;

  // Create breathing timeline
  const tl = gsap.timeline({ repeat: -1, yoyo: true });
  state.breathingTimeline = tl;

  // Inhale - noticeable but gentle expansion
  // Increased from 1.5-2% to 2.5-3.5% for better visibility
  tl.to(coachAvatar, {
    scaleX: 1.025,
    scaleY: 1.035,
    duration: 2.8,
    ease: 'sine.inOut',
  });

  // The yoyo handles the exhale automatically

  log.debug('Breathing started');
}

/**
 * Stop the breathing animation.
 */
export function stopBreathing(): void {
  if (!state.breathingActive) return;

  state.breathingTimeline?.kill();
  state.breathingTimeline = null;
  state.breathingActive = false;

  // Reset to default scale
  if (coachAvatar) {
    gsap.to(coachAvatar, {
      scaleX: 1,
      scaleY: 1,
      duration: 0.3,
    });
  }

  log.debug('Breathing stopped');
}

/**
 * Pause breathing for an emotion animation, then resume.
 */
function pauseBreathingFor(duration: number): void {
  state.breathingTimeline?.pause();
  setTimeout(() => {
    if (state.breathingActive) {
      state.breathingTimeline?.resume();
    }
  }, duration);
}

// ============================================================================
// CORE BODY MOVEMENTS - The Pixar Magic
// ============================================================================

/**
 * Bounce - The signature Pixar lamp move!
 * Used for: excitement, acknowledgment, celebration
 *
 * @param intensity - 0 to 1, how big the bounce
 * @param count - Number of bounces
 */
export function bounce(intensity: number = 0.5, count: number = 1): void {
  if (!coachAvatar || !avatarContainer) return;

  pauseBreathingFor(count * 400 + 300);

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  const bounceHeight = 8 + intensity * 12; // 8-20px
  const squashAmount = 0.85 + (1 - intensity) * 0.1; // 0.85-0.95
  const stretchAmount = 1.1 + intensity * 0.15; // 1.1-1.25

  for (let i = 0; i < count; i++) {
    const decay = 1 - i * 0.3; // Each bounce is smaller

    // Anticipation - Squash down
    tl.to(coachAvatar, {
      scaleY: squashAmount * decay + (1 - decay),
      scaleX: 1 + (1 - squashAmount) * decay * 0.5,
      y: 3 * decay,
      duration: 0.12,
      ease: 'power2.in',
    });

    // Launch - Stretch up
    tl.to(coachAvatar, {
      scaleY: stretchAmount * decay + (1 - decay) * 0.5,
      scaleX: 1 - (stretchAmount - 1) * decay * 0.3,
      y: -bounceHeight * decay,
      duration: 0.15,
      ease: 'power2.out',
    });

    // Fall - Return to squash
    tl.to(coachAvatar, {
      scaleY: squashAmount * decay * 0.5 + 0.5,
      scaleX: 1 + (1 - squashAmount) * decay * 0.3,
      y: 2 * decay,
      duration: 0.12,
      ease: 'power2.in',
    });
  }

  // Settle back to normal
  tl.to(coachAvatar, {
    scaleY: 1,
    scaleX: 1,
    y: 0,
    duration: 0.25,
    ease: 'elastic.out(1, 0.5)',
  });

  log.debug('Bounce:', { intensity, count });
}

/**
 * Tilt - Curiosity and listening lean.
 * Like the Pixar lamp tilting its "head" to look at something.
 *
 * @param direction - 'left', 'right', or 'forward'
 * @param intensity - 0 to 1
 */
export function tilt(
  direction: 'left' | 'right' | 'forward' = 'right',
  intensity: number = 0.5
): void {
  if (!coachAvatar) return;

  pauseBreathingFor(800);

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  const rotation = direction === 'left' ? -8 : direction === 'right' ? 8 : 0;
  const xOffset = direction === 'left' ? -3 : direction === 'right' ? 3 : 0;
  const yOffset = direction === 'forward' ? -4 : -2;
  const scale = direction === 'forward' ? 1.03 : 1;

  // Anticipation - slight opposite movement
  tl.to(coachAvatar, {
    rotation: -rotation * 0.2,
    duration: 0.08,
    ease: 'power2.in',
  });

  // Main tilt with overshoot
  tl.to(coachAvatar, {
    rotation: rotation * intensity * 1.15,
    x: xOffset * intensity,
    y: yOffset * intensity,
    scale: scale,
    duration: 0.25,
    ease: 'back.out(1.5)',
  });

  // Settle to final position
  tl.to(coachAvatar, {
    rotation: rotation * intensity,
    duration: 0.15,
    ease: 'power2.out',
  });

  log.debug('Tilt:', { direction, intensity });
}

/**
 * Return from tilt to neutral.
 */
export function untilt(): void {
  if (!coachAvatar) return;

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  tl.to(coachAvatar, {
    rotation: 0,
    x: 0,
    y: 0,
    scale: 1,
    duration: 0.3,
    ease: 'power2.out',
  });
}

/**
 * Nod - Agreement and understanding.
 *
 * @param count - Number of nods
 * @param speed - 'slow' for thoughtful, 'fast' for excited agreement
 */
export function nod(count: number = 2, speed: 'slow' | 'normal' | 'fast' = 'normal'): void {
  if (!coachAvatar) return;

  pauseBreathingFor(count * 300 + 200);

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  const duration = speed === 'slow' ? 0.25 : speed === 'fast' ? 0.1 : 0.15;
  const distance = speed === 'slow' ? 4 : speed === 'fast' ? 6 : 5;

  for (let i = 0; i < count; i++) {
    // Down
    tl.to(coachAvatar, {
      y: distance,
      scaleY: 0.97,
      duration,
      ease: 'power2.in',
    });

    // Up with slight overshoot
    tl.to(coachAvatar, {
      y: -2,
      scaleY: 1.02,
      duration,
      ease: 'power2.out',
    });
  }

  // Settle
  tl.to(coachAvatar, {
    y: 0,
    scaleY: 1,
    duration: 0.2,
    ease: 'elastic.out(1, 0.7)',
  });

  log.debug('Nod:', { count, speed });
}

/**
 * Perk up - Sudden interest or realization.
 * The "aha!" moment.
 */
export function perkUp(): void {
  if (!coachAvatar) return;

  pauseBreathingFor(600);

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  // Quick anticipation squash
  tl.to(coachAvatar, {
    scaleY: 0.9,
    scaleX: 1.08,
    y: 3,
    duration: 0.08,
    ease: 'power3.in',
  });

  // Pop up with stretch
  tl.to(coachAvatar, {
    scaleY: 1.12,
    scaleX: 0.94,
    y: -8,
    duration: 0.12,
    ease: 'power2.out',
  });

  // Settle with bounce
  tl.to(coachAvatar, {
    scaleY: 1,
    scaleX: 1,
    y: 0,
    duration: 0.4,
    ease: 'elastic.out(1.2, 0.4)',
  });

  log.debug('Perk up!');
}

/**
 * Shrink - Empathy, concern, or sadness.
 * Avatar becomes smaller, more humble.
 *
 * @param intensity - 0 to 1
 */
export function shrink(intensity: number = 0.5): void {
  if (!coachAvatar) return;

  pauseBreathingFor(1000);

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  const targetScale = 0.9 + (1 - intensity) * 0.08; // 0.9-0.98
  const droop = 4 + intensity * 4; // 4-8px

  tl.to(coachAvatar, {
    scale: targetScale,
    y: droop,
    duration: 0.4,
    ease: 'power2.out',
  });

  log.debug('Shrink:', { intensity });
}

/**
 * Return from shrink to normal.
 */
export function unshrink(): void {
  if (!coachAvatar) return;

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  tl.to(coachAvatar, {
    scale: 1,
    y: 0,
    duration: 0.5,
    ease: 'elastic.out(1, 0.6)',
  });
}

/**
 * Shake - Playful disagreement or laughter.
 *
 * @param intensity - 0 to 1
 */
export function shake(intensity: number = 0.5): void {
  if (!coachAvatar) return;

  pauseBreathingFor(500);

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  const distance = 3 + intensity * 4; // 3-7px
  const shakes = 3 + Math.floor(intensity * 2); // 3-5 shakes

  for (let i = 0; i < shakes; i++) {
    const decay = 1 - (i / shakes) * 0.5;
    const dir = i % 2 === 0 ? 1 : -1;

    tl.to(coachAvatar, {
      x: dir * distance * decay,
      rotation: dir * 3 * decay,
      duration: 0.06,
      ease: 'power1.out',
    });
  }

  // Return to center
  tl.to(coachAvatar, {
    x: 0,
    rotation: 0,
    duration: 0.15,
    ease: 'elastic.out(1, 0.5)',
  });

  log.debug('Shake:', { intensity });
}

/**
 * Look - Whole body orientation toward a direction.
 *
 * @param direction - 'left', 'right', 'up', 'down'
 */
export function look(direction: 'left' | 'right' | 'up' | 'down'): void {
  if (!coachAvatar) return;

  emotionTimeline?.kill();
  const tl = gsap.timeline();
  emotionTimeline = tl;

  const transforms: Record<string, { x: number; y: number; rotation: number }> = {
    left: { x: -4, y: 0, rotation: -4 },
    right: { x: 4, y: 0, rotation: 4 },
    up: { x: 0, y: -4, rotation: 0 },
    down: { x: 0, y: 3, rotation: 0 },
  };

  const t = transforms[direction] ?? { x: 0, y: 0, rotation: 0 };

  tl.to(coachAvatar, {
    x: t.x,
    y: t.y,
    rotation: t.rotation,
    duration: 0.25,
    ease: 'power2.out',
  });

  log.debug('Look:', direction);
}

/**
 * Reset look to center.
 */
export function lookCenter(): void {
  if (!coachAvatar) return;

  gsap.to(coachAvatar, {
    x: 0,
    y: 0,
    rotation: 0,
    duration: 0.2,
    ease: 'power2.out',
  });
}

// ============================================================================
// EMOTION PRESETS - Combining Movements for Character
// ============================================================================

/**
 * Express an emotion through body language.
 */
export function express(emotion: LampEmotion): void {
  state.currentEmotion = emotion;

  switch (emotion) {
    case 'happy':
      bounce(0.4, 1);
      break;

    case 'excited':
      bounce(0.8, 2);
      break;

    case 'curious':
      tilt('right', 0.6);
      break;

    case 'confused':
      tilt('left', 0.4);
      setTimeout(() => tilt('right', 0.3), 400);
      break;

    case 'listening':
      tilt('forward', 0.5);
      break;

    case 'thinking':
      look('up');
      setTimeout(() => tilt('left', 0.3), 200);
      break;

    case 'sad':
      shrink(0.6);
      break;

    case 'empathetic':
      shrink(0.3);
      setTimeout(() => nod(1, 'slow'), 400);
      break;

    case 'proud':
      perkUp();
      setTimeout(() => bounce(0.3, 1), 400);
      break;

    case 'surprised':
      perkUp();
      break;

    case 'laughing':
      bounce(0.3, 1);
      setTimeout(() => shake(0.6), 300);
      break;

    case 'acknowledging':
      nod(2, 'normal');
      break;

    case 'encouraging':
      nod(1, 'slow');
      setTimeout(() => bounce(0.2, 1), 300);
      break;

    case 'celebrating':
      bounce(0.9, 3);
      break;

    case 'neutral':
    default:
      untilt();
      unshrink();
      lookCenter();
      break;
  }

  log.debug('Express emotion:', emotion);
}

/**
 * Get current emotion.
 */
export function getCurrentEmotion(): LampEmotion {
  return state.currentEmotion;
}

// ============================================================================
// EVENT INTEGRATION
// ============================================================================

function setupEventListeners(): void {
  // Respond to Ferni emotion events
  document.addEventListener('ferni:emotion-change', ((e: CustomEvent) => {
    const emotion = e.detail?.emotion;
    if (emotion) {
      // Map Ferni emotions to lamp emotions
      const mapping: Record<string, LampEmotion> = {
        happy: 'happy',
        excited: 'excited',
        curious: 'curious',
        thinking: 'thinking',
        sad: 'sad',
        empathetic: 'empathetic',
        proud: 'proud',
        surprised: 'surprised',
        warm: 'happy',
        celebrating: 'celebrating',
        neutral: 'neutral',
      };
      express(mapping[emotion] || 'neutral');
    }
  }) as EventListener);

  // Respond to user speech - lean in to listen
  document.addEventListener('ferni:user-speech-start', () => {
    express('listening');
  });

  document.addEventListener('ferni:user-speech-end', () => {
    setTimeout(() => {
      if (state.currentEmotion === 'listening') {
        express('neutral');
      }
    }, 500);
  });

  // Respond to Ferni speaking
  document.addEventListener('ferni:agent-speech-start', () => {
    // Subtle engagement during speech
    if (state.currentEmotion === 'listening' || state.currentEmotion === 'neutral') {
      untilt();
    }
  });

  // Acknowledgment on message received
  document.addEventListener('ferni:message-received', () => {
    // Small nod to acknowledge
    if (state.currentEmotion === 'neutral' || state.currentEmotion === 'listening') {
      nod(1, 'fast');
    }
  });

  // Celebration events
  document.addEventListener('ferni:celebration', () => {
    express('celebrating');
  });

  // Memory callback - recognition moment
  document.addEventListener('ferni:memory-callback', () => {
    perkUp();
  });

  // Growth recognition
  document.addEventListener('ferni:growth-recognized', () => {
    express('proud');
  });

  log.debug('Event listeners set up');
}

// ============================================================================
// STYLES
// ============================================================================

function injectLampStyles(): void {
  const existingStyle = document.getElementById('avatar-lamp-styles');
  if (existingStyle) return;

  const style = document.createElement('style');
  style.id = 'avatar-lamp-styles';
  style.textContent = `
    /* Avatar Lamp - Pixar-Quality Body Language */
    /* NOTE: Do NOT add transform-style, perspective, will-change, or backface-visibility 
       to .avatar-container or #coachAvatar - causes visible box artifacts in Safari */
    
    #coachAvatar {
      /* Smooth transform origin for balanced animations */
      transform-origin: center bottom;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const avatarLamp = {
  // Lifecycle
  init: initAvatarLamp,
  dispose: disposeAvatarLamp,

  // Breathing
  startBreathing,
  stopBreathing,

  // Core movements
  bounce,
  tilt,
  untilt,
  nod,
  perkUp,
  shrink,
  unshrink,
  shake,
  look,
  lookCenter,

  // Emotion presets
  express,
  getCurrentEmotion,
};

export default avatarLamp;
