/**
 * Ferni Moments UI - Pixar-Style Character Expressions
 * 
 * Small, human, delightful moments that make Ferni feel alive.
 * These are CHARACTER reactions, not background effects.
 * 
 * 🎬 PIXAR PRINCIPLES:
 * - Every moment tells a micro-story
 * - Expressions are earned, not random
 * - Subtle beats overwhelming
 * - Human touches create connection
 * 
 * MOMENT CATEGORIES:
 * - Emotional: celebration, warmGlow, lightbulb, hearts, thinking
 * - Time-of-Day: coffee, sunshine, cozy, moonlight, sleepy
 * - Contextual: musicNotes, sparkle, books, growing
 * - Connection: wave, nod, headTilt, highFive, fistBump
 * - Milestones: birthday, streakFire, trophy, levelUp
 * - Human: yawn, stretch, breathe, blink, shiver, fan
 */

import { EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('FerniMoments');

// ============================================================================
// TYPES
// ============================================================================

export type MomentType = 
  // Emotional
  | 'celebration' | 'warmGlow' | 'lightbulb' | 'hearts' | 'thinking'
  // Time-of-day
  | 'coffee' | 'sunshine' | 'cozy' | 'moonlight' | 'sleepy'
  // Contextual
  | 'musicNotes' | 'sparkle' | 'books' | 'growing'
  // Connection
  | 'wave' | 'nod' | 'headTilt' | 'highFive' | 'fistBump'
  // Milestones
  | 'birthday' | 'streakFire' | 'trophy' | 'levelUp'
  // Human touches
  | 'yawn' | 'stretch' | 'breathe' | 'blink' | 'shiver' | 'fan';

export type MomentCategory = 
  | 'emotional' | 'timeOfDay' | 'contextual' 
  | 'connection' | 'milestone' | 'human';

interface MomentConfig {
  emoji?: string;
  duration: number;
  animation: 'float' | 'pulse' | 'bounce' | 'fade' | 'shake' | 'grow' | 'spin';
  count?: number; // How many particles/emojis
  sound?: boolean;
  avatarReaction?: 'bounce' | 'tilt' | 'nod' | 'shake' | 'glow' | 'pulse';
}

// ============================================================================
// MOMENT CONFIGURATIONS
// ============================================================================

const MOMENTS: Record<MomentType, MomentConfig> = {
  // === EMOTIONAL ===
  celebration: {
    emoji: '🎉',
    duration: 2000,
    animation: 'float',
    count: 5,
    avatarReaction: 'bounce',
  },
  warmGlow: {
    duration: 3000,
    animation: 'pulse',
    avatarReaction: 'glow',
  },
  lightbulb: {
    emoji: '💡',
    duration: 1500,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
  },
  hearts: {
    emoji: '❤️',
    duration: 2500,
    animation: 'float',
    count: 3,
  },
  thinking: {
    emoji: '🤔',
    duration: 2000,
    animation: 'pulse',
    count: 1,
    avatarReaction: 'tilt',
  },

  // === TIME OF DAY ===
  coffee: {
    emoji: '☕',
    duration: 3000,
    animation: 'fade',
    count: 1,
  },
  sunshine: {
    emoji: '☀️',
    duration: 2500,
    animation: 'pulse',
    count: 1,
    avatarReaction: 'glow',
  },
  cozy: {
    emoji: '🕯️',
    duration: 3000,
    animation: 'fade',
    avatarReaction: 'glow',
  },
  moonlight: {
    emoji: '🌙',
    duration: 2500,
    animation: 'fade',
    count: 1,
  },
  sleepy: {
    emoji: '😴',
    duration: 3000,
    animation: 'float',
    count: 1,
    avatarReaction: 'nod',
  },

  // === CONTEXTUAL ===
  musicNotes: {
    emoji: '♪',
    duration: 2500,
    animation: 'float',
    count: 4,
    avatarReaction: 'bounce',
  },
  sparkle: {
    emoji: '✨',
    duration: 2000,
    animation: 'spin',
    count: 5,
  },
  books: {
    emoji: '📚',
    duration: 2000,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'nod',
  },
  growing: {
    emoji: '🌱',
    duration: 2500,
    animation: 'grow',
    count: 1,
    avatarReaction: 'glow',
  },

  // === CONNECTION ===
  wave: {
    emoji: '👋',
    duration: 1500,
    animation: 'shake',
    count: 1,
    avatarReaction: 'bounce',
  },
  nod: {
    duration: 1000,
    animation: 'fade',
    avatarReaction: 'nod',
  },
  headTilt: {
    duration: 1200,
    animation: 'fade',
    avatarReaction: 'tilt',
  },
  highFive: {
    emoji: '✋',
    duration: 1200,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
  },
  fistBump: {
    emoji: '👊',
    duration: 1200,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
  },

  // === MILESTONES ===
  birthday: {
    emoji: '🎂',
    duration: 3000,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
  },
  streakFire: {
    emoji: '🔥',
    duration: 2000,
    animation: 'pulse',
    count: 3,
    avatarReaction: 'glow',
  },
  trophy: {
    emoji: '🏆',
    duration: 2500,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
  },
  levelUp: {
    emoji: '⬆️',
    duration: 2000,
    animation: 'float',
    count: 1,
    avatarReaction: 'glow',
  },

  // === HUMAN TOUCHES ===
  yawn: {
    emoji: '🥱',
    duration: 2000,
    animation: 'fade',
    count: 1,
    avatarReaction: 'tilt',
  },
  stretch: {
    duration: 1500,
    animation: 'fade',
    avatarReaction: 'bounce',
  },
  breathe: {
    duration: 3000,
    animation: 'pulse',
    avatarReaction: 'pulse',
  },
  blink: {
    duration: 300,
    animation: 'fade',
  },
  shiver: {
    emoji: '🥶',
    duration: 1500,
    animation: 'shake',
    count: 1,
    avatarReaction: 'shake',
  },
  fan: {
    emoji: '🥵',
    duration: 2000,
    animation: 'shake',
    count: 1,
    avatarReaction: 'pulse',
  },
};

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isInitialized = false;
let timeCheckInterval: number | null = null;
let lastTimeCheck: string | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the moments system.
 */
export function initFerniMoments(): void {
  if (isInitialized) return;
  
  injectStyles();
  
  // Start time-of-day awareness
  startTimeAwareness();
  
  isInitialized = true;
  log.info('Ferni moments initialized');
}

/**
 * Find or create container around avatar.
 */
function ensureContainer(): HTMLElement | null {
  if (container && document.body.contains(container)) {
    return container;
  }
  
  const avatar = document.querySelector('#coachAvatar, .coach-avatar, [data-avatar]');
  if (!avatar) {
    log.debug('Avatar not found for moments');
    return null;
  }
  
  container = document.createElement('div');
  container.id = 'ferni-moments';
  container.setAttribute('aria-hidden', 'true');
  
  const avatarRect = avatar.getBoundingClientRect();
  const size = Math.max(avatarRect.width, avatarRect.height) * 2;
  
  container.style.cssText = `
    position: fixed;
    top: ${avatarRect.top + avatarRect.height / 2 - size / 2}px;
    left: ${avatarRect.left + avatarRect.width / 2 - size / 2}px;
    width: ${size}px;
    height: ${size}px;
    pointer-events: none;
    z-index: 15;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  document.body.appendChild(container);
  
  // Update position on resize
  const updatePosition = () => {
    if (!container) return;
    const rect = avatar.getBoundingClientRect();
    const s = Math.max(rect.width, rect.height) * 2;
    container.style.top = `${rect.top + rect.height / 2 - s / 2}px`;
    container.style.left = `${rect.left + rect.width / 2 - s / 2}px`;
    container.style.width = `${s}px`;
    container.style.height = `${s}px`;
  };
  
  window.addEventListener('resize', updatePosition);
  
  return container;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Play a moment - the main function to trigger any moment type.
 */
export function playMoment(type: MomentType): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  const config = MOMENTS[type];
  if (!config) {
    log.warn('Unknown moment type:', type);
    return;
  }
  
  const momentContainer = ensureContainer();
  if (!momentContainer) return;
  
  // Play the visual effect
  if (config.emoji) {
    playEmojiMoment(momentContainer, config);
  } else {
    playAuraMoment(momentContainer, config);
  }
  
  // Trigger avatar reaction
  if (config.avatarReaction) {
    playAvatarReaction(config.avatarReaction, config.duration);
  }
  
  log.debug('Moment played:', type);
}

/**
 * Play multiple moments in sequence for celebrations.
 */
export function playCelebration(intensity: 'small' | 'medium' | 'big' = 'medium'): void {
  playMoment('celebration');
  
  if (intensity === 'medium' || intensity === 'big') {
    setTimeout(() => playMoment('sparkle'), 500);
  }
  
  if (intensity === 'big') {
    setTimeout(() => playMoment('hearts'), 1000);
    setTimeout(() => playMoment('trophy'), 1500);
  }
}

/**
 * Get appropriate time-of-day moment.
 */
export function getTimeOfDayMoment(): MomentType | null {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 10) return 'coffee';      // Morning
  if (hour >= 10 && hour < 17) return 'sunshine';   // Day
  if (hour >= 17 && hour < 21) return 'cozy';       // Evening
  if (hour >= 21 || hour < 2) return 'moonlight';   // Night
  if (hour >= 2 && hour < 5) return 'sleepy';       // Late night
  
  return null;
}

/**
 * Play time-appropriate moment.
 */
export function playTimeOfDayMoment(): void {
  const moment = getTimeOfDayMoment();
  if (moment) {
    playMoment(moment);
  }
}

/**
 * React to temperature (can connect to weather API later).
 */
export function reactToTemperature(tempF: number): void {
  if (tempF < 40) {
    playMoment('shiver');
  } else if (tempF > 85) {
    playMoment('fan');
  } else if (tempF >= 65 && tempF <= 75) {
    playMoment('sunshine');
  }
}

/**
 * Check if it's late and Ferni should be sleepy.
 */
export function checkIfSleepy(): boolean {
  const hour = new Date().getHours();
  return hour >= 2 && hour < 6;
}

// ============================================================================
// MOMENT IMPLEMENTATIONS
// ============================================================================

function playEmojiMoment(momentContainer: HTMLElement, config: MomentConfig): void {
  const count = config.count || 1;
  
  for (let i = 0; i < count; i++) {
    const emoji = document.createElement('div');
    emoji.className = `ferni-moment ferni-moment--${config.animation}`;
    emoji.textContent = config.emoji!;
    
    // Randomize position slightly for multiple emojis
    const offsetX = count > 1 ? (Math.random() - 0.5) * 60 : 0;
    const offsetY = count > 1 ? (Math.random() - 0.5) * 40 : -40;
    const delay = i * 150;
    const size = 20 + Math.random() * 12;
    
    emoji.style.cssText = `
      position: absolute;
      font-size: ${size}px;
      transform: translate(${offsetX}px, ${offsetY}px);
      animation-delay: ${delay}ms;
      opacity: 0;
    `;
    
    momentContainer.appendChild(emoji);
    
    // Trigger animation
    requestAnimationFrame(() => {
      emoji.style.opacity = '1';
      animateElement(emoji, config.animation, config.duration);
    });
    
    // Cleanup
    setTimeout(() => emoji.remove(), config.duration + delay + 100);
  }
}

function playAuraMoment(momentContainer: HTMLElement, config: MomentConfig): void {
  const aura = document.createElement('div');
  aura.className = `ferni-moment ferni-moment--aura ferni-moment--${config.animation}`;
  
  aura.style.cssText = `
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    pointer-events: none;
  `;
  
  momentContainer.appendChild(aura);
  
  animateElement(aura, config.animation, config.duration);
  
  setTimeout(() => aura.remove(), config.duration + 100);
}

function animateElement(el: HTMLElement, animation: MomentConfig['animation'], duration: number): void {
  const animations: Record<string, Keyframe[]> = {
    float: [
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(-50px) scale(1.1)', opacity: 0.8, offset: 0.5 },
      { transform: 'translateY(-80px) scale(0.9)', opacity: 0 },
    ],
    pulse: [
      { transform: 'scale(1)', opacity: 0.8 },
      { transform: 'scale(1.3)', opacity: 1, offset: 0.5 },
      { transform: 'scale(1)', opacity: 0 },
    ],
    bounce: [
      { transform: 'translateY(0) scale(0.5)', opacity: 0 },
      { transform: 'translateY(-30px) scale(1.2)', opacity: 1, offset: 0.3 },
      { transform: 'translateY(-20px) scale(1)', opacity: 1, offset: 0.6 },
      { transform: 'translateY(-25px) scale(1.05)', opacity: 0.8, offset: 0.8 },
      { transform: 'translateY(-30px) scale(0.8)', opacity: 0 },
    ],
    fade: [
      { opacity: 0, transform: 'scale(0.8)' },
      { opacity: 1, transform: 'scale(1)', offset: 0.2 },
      { opacity: 1, transform: 'scale(1)', offset: 0.8 },
      { opacity: 0, transform: 'scale(0.9)' },
    ],
    shake: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-5px)', offset: 0.1 },
      { transform: 'translateX(5px)', offset: 0.2 },
      { transform: 'translateX(-5px)', offset: 0.3 },
      { transform: 'translateX(5px)', offset: 0.4 },
      { transform: 'translateX(-3px)', offset: 0.5 },
      { transform: 'translateX(3px)', offset: 0.6 },
      { transform: 'translateX(0)', offset: 0.7 },
      { transform: 'translateX(0)', opacity: 1, offset: 0.8 },
      { transform: 'translateX(0)', opacity: 0 },
    ],
    grow: [
      { transform: 'scale(0) translateY(20px)', opacity: 0 },
      { transform: 'scale(1.2) translateY(-10px)', opacity: 1, offset: 0.4 },
      { transform: 'scale(1) translateY(-15px)', opacity: 1, offset: 0.7 },
      { transform: 'scale(0.9) translateY(-20px)', opacity: 0 },
    ],
    spin: [
      { transform: 'rotate(0deg) scale(0.5)', opacity: 0 },
      { transform: 'rotate(180deg) scale(1)', opacity: 1, offset: 0.3 },
      { transform: 'rotate(360deg) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'rotate(540deg) scale(0.5)', opacity: 0 },
    ],
  };
  
  const defaultFade: Keyframe[] = [
    { opacity: 0, transform: 'scale(0.8) translateY(10px)' },
    { opacity: 1, transform: 'scale(1) translateY(0)', offset: 0.2 },
    { opacity: 1, transform: 'scale(1) translateY(0)', offset: 0.8 },
    { opacity: 0, transform: 'scale(0.9)' },
  ];
  const keyframes = animations[animation] ?? defaultFade;
  el.animate(keyframes, {
    duration,
    easing: EASING.SPRING_GENTLE,
    fill: 'forwards',
  });
}

function playAvatarReaction(reaction: NonNullable<MomentConfig['avatarReaction']>, duration: number): void {
  const avatar = document.querySelector('#coachAvatar, .coach-avatar, [data-avatar]') as HTMLElement;
  if (!avatar) return;
  
  const reactions: Record<string, Keyframe[]> = {
    bounce: [
      { transform: 'translateY(0)' },
      { transform: 'translateY(-8px)', offset: 0.3 },
      { transform: 'translateY(0)', offset: 0.5 },
      { transform: 'translateY(-4px)', offset: 0.7 },
      { transform: 'translateY(0)' },
    ],
    tilt: [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-5deg)', offset: 0.3 },
      { transform: 'rotate(-5deg)', offset: 0.7 },
      { transform: 'rotate(0deg)' },
    ],
    nod: [
      { transform: 'translateY(0)' },
      { transform: 'translateY(3px)', offset: 0.2 },
      { transform: 'translateY(0)', offset: 0.4 },
      { transform: 'translateY(3px)', offset: 0.6 },
      { transform: 'translateY(0)' },
    ],
    shake: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-3px)', offset: 0.2 },
      { transform: 'translateX(3px)', offset: 0.4 },
      { transform: 'translateX(-2px)', offset: 0.6 },
      { transform: 'translateX(2px)', offset: 0.8 },
      { transform: 'translateX(0)' },
    ],
    glow: [
      { filter: 'brightness(1) drop-shadow(0 0 0 transparent)' },
      { filter: 'brightness(1.1) drop-shadow(0 0 20px rgba(255, 220, 100, 0.5))', offset: 0.3 },
      { filter: 'brightness(1.1) drop-shadow(0 0 20px rgba(255, 220, 100, 0.5))', offset: 0.7 },
      { filter: 'brightness(1) drop-shadow(0 0 0 transparent)' },
    ],
    pulse: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.05)', offset: 0.3 },
      { transform: 'scale(1)', offset: 0.5 },
      { transform: 'scale(1.03)', offset: 0.7 },
      { transform: 'scale(1)' },
    ],
  };
  
  const defaultBounce: Keyframe[] = [
    { transform: 'translateY(0)' },
    { transform: 'translateY(-8px)', offset: 0.3 },
    { transform: 'translateY(0)', offset: 0.5 },
    { transform: 'translateY(-4px)', offset: 0.7 },
    { transform: 'translateY(0)' },
  ];
  const reactionKeyframes = reactions[reaction] ?? defaultBounce;
  avatar.animate(reactionKeyframes, {
    duration: Math.min(duration, 1500),
    easing: EASING.SPRING_GENTLE,
  });
}

// ============================================================================
// TIME AWARENESS
// ============================================================================

function startTimeAwareness(): void {
  // Check every 30 minutes for time-of-day changes
  const checkTime = () => {
    const hour = new Date().getHours();
    const timeSlot = getTimeSlot(hour);
    
    if (timeSlot !== lastTimeCheck) {
      lastTimeCheck = timeSlot;
      // Only auto-play on significant transitions
      if (timeSlot === 'morning' || timeSlot === 'evening' || timeSlot === 'lateNight') {
        // Subtle moment on time transition
        setTimeout(() => {
          const moment = getTimeOfDayMoment();
          if (moment) playMoment(moment);
        }, 2000); // Delay so it doesn't feel jarring
      }
    }
  };
  
  checkTime();
  timeCheckInterval = window.setInterval(checkTime, 30 * 60 * 1000); // Every 30 min
}

function getTimeSlot(hour: number): string {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  if (hour >= 21 || hour < 2) return 'night';
  return 'lateNight';
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  const styleId = 'ferni-moments-styles';
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #ferni-moments {
      pointer-events: none;
    }
    
    .ferni-moment {
      user-select: none;
      will-change: transform, opacity;
    }
    
    .ferni-moment--aura {
      background: radial-gradient(
        circle,
        rgba(255, 220, 100, 0.3) 0%,
        rgba(255, 220, 100, 0.1) 50%,
        transparent 70%
      );
    }
    
    /* Reduce motion support */
    @media (prefers-reduced-motion: reduce) {
      #ferni-moments {
        display: none !important;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (timeCheckInterval) {
    clearInterval(timeCheckInterval);
    timeCheckInterval = null;
  }
  
  if (container?.parentNode) {
    container.parentNode.removeChild(container);
    container = null;
  }
  
  isInitialized = false;
}

// ============================================================================
// CATEGORY HELPERS
// ============================================================================

export const MOMENT_CATEGORIES: Record<MomentCategory, MomentType[]> = {
  emotional: ['celebration', 'warmGlow', 'lightbulb', 'hearts', 'thinking'],
  timeOfDay: ['coffee', 'sunshine', 'cozy', 'moonlight', 'sleepy'],
  contextual: ['musicNotes', 'sparkle', 'books', 'growing'],
  connection: ['wave', 'nod', 'headTilt', 'highFive', 'fistBump'],
  milestone: ['birthday', 'streakFire', 'trophy', 'levelUp'],
  human: ['yawn', 'stretch', 'breathe', 'blink', 'shiver', 'fan'],
};

export function getMomentsByCategory(category: MomentCategory): MomentType[] {
  return MOMENT_CATEGORIES[category] || [];
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ferniMoments = {
  init: initFerniMoments,
  play: playMoment,
  celebrate: playCelebration,
  timeOfDay: playTimeOfDayMoment,
  getTimeOfDayMoment,
  reactToTemperature,
  checkIfSleepy,
  categories: MOMENT_CATEGORIES,
  getByCategory: getMomentsByCategory,
  dispose,
};

