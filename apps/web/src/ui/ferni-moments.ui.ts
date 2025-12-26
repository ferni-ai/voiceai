/**
 * Ferni Moments UI - Pixar-Style Character Expressions
 *
 * Small, human, delightful moments that make Ferni feel alive.
 * These are CHARACTER reactions, not background effects.
 *
 * PIXAR ANIMATION STRATEGY (GSAP-powered):
 * =========================================
 * Every moment follows the Pixar Lamp animation principle:
 *
 * 1. ANTICIPATION: Avatar text fades, avatar subtly squishes
 * 2. ACTION: Icon bounces into center with spring physics
 * 3. HOLD: Icon stays visible (the "moment")
 * 4. FOLLOW-THROUGH: Icon fades, text returns with gentle settle
 *
 * The avatar text ("FE") HIDES when showing an icon-based moment.
 * This creates the illusion that Ferni is "expressing" the icon.
 *
 * BRAND COMPLIANCE:
 * - NO emojis - Uses Lucide SVG icons only
 * - All icons use 2px stroke, rounded corners
 * - Colors from design system CSS variables
 *
 * MOMENT CATEGORIES:
 * - Emotional: celebration, warmGlow, lightbulb, hearts, thinking
 * - Time-of-Day: coffee, sunshine, cozy, moonlight, sleepy
 * - Contextual: musicNotes, sparkle, books, growing
 * - Connection: wave, nod, headTilt, highFive, fistBump
 * - Milestones: birthday, streakFire, trophy, levelUp
 * - Human: yawn, stretch, breathe, blink, shiver, fan
 */

import { DURATION } from '../config/animation-constants.js';
import { gsap } from '../utils/gsap-setup.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { morphIconToText, morphTextToIcon, setExpression } from './ferni-expressions.ui.js';

const log = createLogger('FerniMoments');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// GSAP helper - convert ms to seconds
const toSeconds = (ms: number) => ms / 1000;

// ============================================================================
// ICONS (Lucide-style, brand compliant - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  // Emotional
  celebration:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="M22 2 12 12"/><path d="M12 12 8.2 15.8"/></svg>',
  lightbulb:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  thinking:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"/></svg>',

  // Time of Day
  coffee:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  flame:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  cloudMoon:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z"/><path d="M10.1 9A6 6 0 0 1 16 4a4.24 4.24 0 0 0 6 6 6 6 0 0 1-3 5.197"/></svg>',

  // Contextual
  music:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  sparkles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  bookOpen:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  sprout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>',

  // Connection
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  handshake:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg>',

  // Milestones
  cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h0.01"/><path d="M12 4h0.01"/><path d="M17 4h0.01"/></svg>',
  trophy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  arrowUp:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>',
  trendingUp:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',

  // Human touches
  bedSingle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/><path d="M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 18h18"/></svg>',
  snowflake:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>',
  thermometer:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>',
  wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
};

// ============================================================================
// TYPES
// ============================================================================

export type MomentType =
  // Emotional
  | 'celebration'
  | 'warmGlow'
  | 'lightbulb'
  | 'hearts'
  | 'thinking'
  // Time-of-day
  | 'coffee'
  | 'sunshine'
  | 'cozy'
  | 'moonlight'
  | 'sleepy'
  // Contextual
  | 'musicNotes'
  | 'sparkle'
  | 'books'
  | 'growing'
  // Connection
  | 'wave'
  | 'nod'
  | 'headTilt'
  | 'highFive'
  | 'fistBump'
  // Milestones
  | 'birthday'
  | 'streakFire'
  | 'trophy'
  | 'levelUp'
  // Human touches
  | 'yawn'
  | 'stretch'
  | 'breathe'
  | 'blink'
  | 'shiver'
  | 'fan';

export type MomentCategory =
  | 'emotional'
  | 'timeOfDay'
  | 'contextual'
  | 'connection'
  | 'milestone'
  | 'human';

interface MomentConfig {
  /** Lucide SVG icon key (from ICONS object) - NO emojis per brand guidelines */
  icon?: keyof typeof ICONS;
  duration: number;
  animation: 'float' | 'pulse' | 'bounce' | 'fade' | 'shake' | 'grow' | 'spin';
  count?: number; // How many particles/icons to show
  sound?: boolean;
  avatarReaction?: 'bounce' | 'tilt' | 'nod' | 'shake' | 'glow' | 'pulse';
  /** Icon color - uses CSS variable */
  color?: string;
}

// ============================================================================
// MOMENT CONFIGURATIONS
// ============================================================================

const MOMENTS: Record<MomentType, MomentConfig> = {
  // === EMOTIONAL ===
  celebration: {
    icon: 'celebration',
    duration: 2000,
    animation: 'float',
    count: 3,
    avatarReaction: 'bounce',
    color: 'var(--persona-primary)',
  },
  warmGlow: {
    duration: 3000,
    animation: 'pulse',
    avatarReaction: 'glow',
  },
  lightbulb: {
    icon: 'lightbulb',
    duration: 1500,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
    color: 'var(--color-semantic-warning, #b8956a)',
  },
  hearts: {
    icon: 'heart',
    duration: 2500,
    animation: 'float',
    count: 3,
    color: 'var(--color-semantic-error, #a67a6a)',
  },
  thinking: {
    icon: 'thinking',
    duration: 2000,
    animation: 'pulse',
    count: 1,
    avatarReaction: 'tilt',
    color: 'var(--persona-secondary)',
  },

  // === TIME OF DAY ===
  coffee: {
    icon: 'coffee',
    duration: 3000,
    animation: 'fade',
    count: 1,
    color: 'var(--color-text-secondary, #9a7b5a)',
  },
  sunshine: {
    icon: 'sun',
    duration: 2500,
    animation: 'pulse',
    count: 1,
    avatarReaction: 'glow',
    color: 'var(--color-semantic-warning, #c4856a)',
  },
  cozy: {
    icon: 'flame',
    duration: 3000,
    animation: 'fade',
    avatarReaction: 'glow',
    color: 'var(--color-semantic-warning, #c4856a)',
  },
  moonlight: {
    icon: 'moon',
    duration: 2500,
    animation: 'fade',
    count: 1,
    color: 'var(--color-text-muted, #5a6b8a)',
  },
  sleepy: {
    icon: 'cloudMoon',
    duration: 3000,
    animation: 'float',
    count: 1,
    avatarReaction: 'nod',
    color: 'var(--color-text-muted, #5a6b8a)',
  },

  // === CONTEXTUAL ===
  musicNotes: {
    icon: 'music',
    duration: 2500,
    animation: 'float',
    count: 3,
    avatarReaction: 'bounce',
    color: 'var(--persona-primary)',
  },
  sparkle: {
    icon: 'sparkles',
    duration: 2000,
    animation: 'spin',
    count: 4,
    color: 'var(--color-semantic-warning, #b8956a)',
  },
  books: {
    icon: 'bookOpen',
    duration: 2000,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'nod',
    color: 'var(--persona-secondary)',
  },
  growing: {
    icon: 'sprout',
    duration: 2500,
    animation: 'grow',
    count: 1,
    avatarReaction: 'glow',
    color: 'var(--persona-primary, #4a6741)',
  },

  // === CONNECTION ===
  wave: {
    icon: 'hand',
    duration: 1500,
    animation: 'shake',
    count: 1,
    avatarReaction: 'bounce',
    color: 'var(--persona-primary)',
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
    icon: 'hand',
    duration: 1200,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
    color: 'var(--persona-primary)',
  },
  fistBump: {
    icon: 'handshake',
    duration: 1200,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
    color: 'var(--persona-primary)',
  },

  // === MILESTONES ===
  birthday: {
    icon: 'cake',
    duration: 3000,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
    color: 'var(--color-semantic-warning, #c4856a)',
  },
  streakFire: {
    icon: 'flame',
    duration: 2000,
    animation: 'pulse',
    count: 3,
    avatarReaction: 'glow',
    color: 'var(--color-semantic-warning, #c4856a)',
  },
  trophy: {
    icon: 'trophy',
    duration: 2500,
    animation: 'bounce',
    count: 1,
    avatarReaction: 'bounce',
    color: 'var(--color-semantic-warning, #b8956a)',
  },
  levelUp: {
    icon: 'trendingUp',
    duration: 2000,
    animation: 'float',
    count: 1,
    avatarReaction: 'glow',
    color: 'var(--persona-primary)',
  },

  // === HUMAN TOUCHES ===
  yawn: {
    icon: 'cloudMoon',
    duration: 2000,
    animation: 'fade',
    count: 1,
    avatarReaction: 'tilt',
    color: 'var(--color-text-muted)',
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
    icon: 'snowflake',
    duration: 1500,
    animation: 'shake',
    count: 1,
    avatarReaction: 'shake',
    color: 'var(--color-text-muted, #5a6b8a)',
  },
  fan: {
    icon: 'wind',
    duration: 2000,
    animation: 'shake',
    count: 1,
    avatarReaction: 'pulse',
    color: 'var(--color-semantic-warning, #c4856a)',
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
    z-index: var(--z-dropdown);
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
  if (config.icon) {
    playIconMoment(momentContainer, config);
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
    trackedTimeout(() => playMoment('sparkle'), 500);
  }

  if (intensity === 'big') {
    trackedTimeout(() => playMoment('hearts'), 1000);
    trackedTimeout(() => playMoment('trophy'), 1500);
  }
}

/**
 * Get appropriate time-of-day moment.
 */
export function getTimeOfDayMoment(): MomentType | null {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 10) return 'coffee'; // Morning
  if (hour >= 10 && hour < 17) return 'sunshine'; // Day
  if (hour >= 17 && hour < 21) return 'cozy'; // Evening
  if (hour >= 21 || hour < 2) return 'moonlight'; // Night
  if (hour >= 2 && hour < 5) return 'sleepy'; // Late night

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

/**
 * Play an icon-based moment with Pixar-style GSAP animation.
 *
 * 🆕 UPGRADED PIXAR ANIMATION SEQUENCE:
 * 1. ANTICIPATION - Text squashes into a point (dramatic morph)
 * 2. EXPLOSION - Point explodes, icon forms from particles
 * 3. HOLD - Icon visible with emotional expression
 * 4. FOLLOW-THROUGH - Icon collapses, text springs back
 *
 * Uses the new pixar-emotions morphTextToIcon system for theatrical transitions.
 * Brand compliant - NO emojis, uses Lucide SVG icons only.
 */
function playIconMoment(momentContainer: HTMLElement, config: MomentConfig): void {
  const count = config.count || 1;
  const iconKey = config.icon;

  if (!iconKey || !ICONS[iconKey]) {
    log.warn('Missing icon for moment:', iconKey);
    return;
  }

  const iconSvg = ICONS[iconKey];
  const isSingleCenteredIcon = count === 1;

  // For single centered icons, use the dramatic morph system
  if (isSingleCenteredIcon) {
    void playDramaticIconMoment(iconSvg, config);
    return;
  }

  // For multiple icons (particles), use the scatter animation
  playScatterIconMoment(momentContainer, iconKey, config);
}

/**
 * Play a dramatic single-icon moment using the Pixar morph system.
 * The text morphs into the icon with full theatrical flair.
 */
async function playDramaticIconMoment(iconSvg: string, config: MomentConfig): Promise<void> {
  // Set an appropriate emotional expression during the moment
  const expressionForMoment = getExpressionForConfig(config);
  if (expressionForMoment) {
    setExpression(expressionForMoment, DURATION.FAST);
  }

  // Morph text → icon with dramatic Pixar animation
  const iconElement = await morphTextToIcon(iconSvg, DURATION.MODERATE);

  if (!iconElement) {
    log.warn('Failed to create icon element');
    return;
  }

  // Apply color from config
  iconElement.style.color = config.color || 'var(--persona-primary, #4a6741)';

  // Play the icon's animation style
  playIconAnimation(iconElement, config.animation, config.duration);

  // Hold duration (total - morph in - morph out)
  const holdDuration = Math.max(config.duration - DURATION.MODERATE - DURATION.MODERATE, 300);

  // Wait for hold, then morph back
  await new Promise<void>((resolve) => setTimeout(resolve, holdDuration));

  // Morph icon → text with spring physics
  await morphIconToText(iconElement);

  // Return expression to neutral
  if (expressionForMoment) {
    setExpression('neutral', DURATION.SLOW);
  }

  log.debug('Dramatic icon moment complete');
}

/**
 * Get the appropriate emotional expression for a moment config.
 */
function getExpressionForConfig(config: MomentConfig): Parameters<typeof setExpression>[0] | null {
  switch (config.avatarReaction) {
    case 'bounce':
      return 'happy';
    case 'glow':
      return 'delighted';
    case 'tilt':
      return 'curious';
    case 'nod':
      return 'empathetic';
    case 'shake':
      return 'worried';
    case 'pulse':
      return 'excited';
    default:
      return null;
  }
}

/**
 * Play animation on the icon element based on config.
 */
function playIconAnimation(
  element: HTMLElement,
  animation: MomentConfig['animation'],
  duration: number
): void {
  switch (animation) {
    case 'bounce':
      gsap
        .timeline({ repeat: 2, yoyo: true })
        .to(element, {
          y: -8,
          duration: toSeconds(duration / 6),
          ease: 'power2.out',
        })
        .to(element, {
          y: 0,
          duration: toSeconds(duration / 6),
          ease: 'bounce.out',
        });
      break;

    case 'pulse':
      gsap
        .timeline({ repeat: 3 })
        .to(element, {
          scale: 1.15,
          duration: toSeconds(duration / 8),
          ease: 'power2.out',
        })
        .to(element, {
          scale: 1,
          duration: toSeconds(duration / 8),
          ease: 'power2.in',
        });
      break;

    case 'float':
      gsap.to(element, {
        y: -6,
        duration: toSeconds(duration / 2),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 1,
      });
      break;

    case 'spin':
      gsap.to(element, {
        rotation: 360,
        duration: toSeconds(duration),
        ease: 'power1.inOut',
      });
      break;

    case 'shake':
      gsap
        .timeline({ repeat: 4 })
        .to(element, {
          x: -3,
          rotation: -5,
          duration: 0.05,
          ease: 'power1.inOut',
        })
        .to(element, {
          x: 3,
          rotation: 5,
          duration: 0.05,
          ease: 'power1.inOut',
        })
        .to(element, {
          x: 0,
          rotation: 0,
          duration: 0.05,
          ease: 'power1.out',
        });
      break;

    case 'grow':
      gsap.from(element, {
        scale: 0.5,
        duration: toSeconds(duration * 0.6),
        ease: 'elastic.out(1, 0.4)',
      });
      break;

    case 'fade':
    default:
      // Just holds - no extra animation needed
      break;
  }
}

/**
 * Play scatter icon moment (multiple floating icons).
 * Used when count > 1 for particle-like effects.
 */
function playScatterIconMoment(
  momentContainer: HTMLElement,
  iconKey: keyof typeof ICONS,
  config: MomentConfig
): void {
  const count = config.count || 3;
  const avatarText = document.getElementById('avatarText');
  const coachAvatar = document.getElementById('coachAvatar');

  const masterTL = gsap.timeline({
    onComplete: () => log.debug('Scatter moment complete'),
  });

  // Anticipation - avatar squish
  if (coachAvatar) {
    masterTL.to(
      coachAvatar,
      {
        scaleY: 0.96,
        scaleX: 1.02,
        duration: toSeconds(DURATION.FAST),
        ease: 'power2.in',
      },
      0
    );
  }

  // Text dims slightly (doesn't fully hide for scatter)
  if (avatarText) {
    masterTL.to(
      avatarText,
      {
        opacity: 0.3,
        scale: 0.9,
        duration: toSeconds(DURATION.FAST),
        ease: 'power2.in',
      },
      0
    );
  }

  // Create and animate scatter icons
  for (let i = 0; i < count; i++) {
    const iconWrapper = document.createElement('div');
    iconWrapper.className = `ferni-moment ferni-moment--icon ferni-moment--scatter`;
    iconWrapper.innerHTML = ICONS[iconKey];

    // Random scattered position
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = 35 + Math.random() * 25;
    const targetX = Math.cos(angle) * distance;
    const targetY = Math.sin(angle) * distance;
    const size = 14 + Math.random() * 10;
    const staggerDelay = i * 0.08;

    iconWrapper.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      color: ${config.color || 'var(--persona-primary, #4a6741)'};
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      opacity: 0;
      transform: scale(0);
    `;

    const svg = iconWrapper.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
    }

    momentContainer.appendChild(iconWrapper);

    // Scatter out with spring
    masterTL.to(
      iconWrapper,
      {
        x: targetX,
        y: targetY,
        opacity: 1,
        scale: 1,
        rotation: (Math.random() - 0.5) * 30,
        duration: toSeconds(DURATION.SLOW),
        ease: 'back.out(2)',
      },
      toSeconds(DURATION.FAST) + staggerDelay
    );
  }

  // Avatar settles
  if (coachAvatar) {
    masterTL.to(
      coachAvatar,
      {
        scaleY: 1,
        scaleX: 1,
        duration: toSeconds(DURATION.NORMAL),
        ease: 'elastic.out(1, 0.7)',
      },
      toSeconds(DURATION.FAST)
    );
  }

  // Calculate hold and exit timing
  const holdDuration = config.duration - DURATION.FAST - DURATION.SLOW - DURATION.NORMAL;
  const exitStart = toSeconds(DURATION.FAST + DURATION.SLOW + Math.max(holdDuration, 400));

  // Scatter icons float up and fade
  masterTL.to(
    '.ferni-moment--scatter',
    {
      y: '-=20',
      opacity: 0,
      scale: 0.6,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'power2.in',
      stagger: 0.03,
    },
    exitStart
  );

  // Text returns
  if (avatarText) {
    masterTL.to(
      avatarText,
      {
        opacity: 1,
        scale: 1,
        duration: toSeconds(DURATION.SLOW),
        ease: 'elastic.out(1, 0.7)',
        clearProps: 'opacity,scale,transform',
      },
      exitStart + toSeconds(DURATION.FAST)
    );
  }

  // Cleanup
  masterTL.call(
    () => {
      momentContainer.querySelectorAll('.ferni-moment--scatter').forEach((el) => el.remove());
    },
    [],
    exitStart + toSeconds(DURATION.SLOW)
  );
}

/**
 * Play an aura-based moment (no icon, just ambient glow).
 * Used for warmGlow, breathe, nod, headTilt, stretch, blink.
 *
 * These don't hide the avatar text - they're subtle ambient effects.
 */
function playAuraMoment(momentContainer: HTMLElement, config: MomentConfig): void {
  const aura = document.createElement('div');
  aura.className = `ferni-moment ferni-moment--aura ferni-moment--${config.animation}`;

  aura.style.cssText = `
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    pointer-events: none;
    opacity: 0;
    transform: scale(0.8);
  `;

  momentContainer.appendChild(aura);

  // GSAP timeline for smooth aura effect
  const tl = gsap.timeline({
    onComplete: () => aura.remove(),
  });

  // Aura fades in and expands
  tl.to(aura, {
    opacity: 1,
    scale: 1,
    duration: toSeconds(config.duration * 0.3),
    ease: 'power2.out',
  });

  // Hold
  tl.to(aura, {
    scale: 1.05,
    duration: toSeconds(config.duration * 0.4),
    ease: 'power1.inOut',
  });

  // Fade out
  tl.to(aura, {
    opacity: 0,
    scale: 1.1,
    duration: toSeconds(config.duration * 0.3),
    ease: 'power2.in',
  });
}

/**
 * Play avatar reaction with GSAP (Pixar-style physics).
 * These are secondary animations that accompany moments.
 */
function playAvatarReaction(
  reaction: NonNullable<MomentConfig['avatarReaction']>,
  duration: number
): void {
  const avatar = document.querySelector(
    '#coachAvatar, .coach-avatar, [data-avatar]'
  ) as HTMLElement;
  if (!avatar) return;

  // Use GSAP for smooth, physics-based reactions
  const reactionDuration = Math.min(duration, 1500);

  // All reactions use clearProps at the end to remove inline styles and preserve CSS
  switch (reaction) {
    case 'bounce':
      // Pixar-style anticipation → bounce → settle
      gsap
        .timeline()
        .to(avatar, { y: 2, duration: toSeconds(DURATION.MICRO), ease: 'power2.in' })
        .to(avatar, { y: -8, duration: toSeconds(DURATION.FAST), ease: 'power2.out' })
        .to(avatar, {
          y: 0,
          duration: toSeconds(DURATION.NORMAL),
          ease: 'elastic.out(1, 0.5)',
          clearProps: 'y',
        });
      break;

    case 'tilt':
      // Curious head tilt (like WALL-E)
      gsap
        .timeline()
        .to(avatar, { rotation: -5, duration: toSeconds(DURATION.NORMAL), ease: 'power2.out' })
        .to(avatar, { rotation: -5, duration: toSeconds(reactionDuration * 0.5) })
        .to(avatar, {
          rotation: 0,
          duration: toSeconds(DURATION.SLOW),
          ease: 'elastic.out(1, 0.8)',
          clearProps: 'rotation',
        });
      break;

    case 'nod':
      // Understanding nod
      gsap
        .timeline()
        .to(avatar, { y: 3, duration: toSeconds(DURATION.FAST), ease: 'power2.out' })
        .to(avatar, { y: 0, duration: toSeconds(DURATION.FAST), ease: 'power2.in' })
        .to(avatar, { y: 3, duration: toSeconds(DURATION.FAST), ease: 'power2.out' })
        .to(avatar, {
          y: 0,
          duration: toSeconds(DURATION.NORMAL),
          ease: 'elastic.out(1, 0.8)',
          clearProps: 'y',
        });
      break;

    case 'shake':
      // Concerned head shake
      gsap
        .timeline()
        .to(avatar, { x: -3, duration: toSeconds(DURATION.MICRO), ease: 'power2.out' })
        .to(avatar, { x: 3, duration: toSeconds(DURATION.MICRO), ease: 'power2.inOut' })
        .to(avatar, { x: -2, duration: toSeconds(DURATION.MICRO), ease: 'power2.inOut' })
        .to(avatar, { x: 2, duration: toSeconds(DURATION.MICRO), ease: 'power2.inOut' })
        .to(avatar, {
          x: 0,
          duration: toSeconds(DURATION.NORMAL),
          ease: 'elastic.out(1, 0.5)',
          clearProps: 'x',
        });
      break;

    case 'glow':
      // Warm glow effect (brightness + subtle scale)
      gsap
        .timeline()
        .to(avatar, {
          filter:
            'brightness(1.15) drop-shadow(0 0 20px var(--persona-glow, rgba(74, 103, 65, 0.5)))',
          scale: 1.02,
          duration: toSeconds(DURATION.SLOW),
          ease: 'power2.out',
        })
        .to(avatar, {
          filter:
            'brightness(1.15) drop-shadow(0 0 20px var(--persona-glow, rgba(74, 103, 65, 0.5)))',
          scale: 1.02,
          duration: toSeconds(reactionDuration * 0.5),
        })
        .to(avatar, {
          filter: 'brightness(1) drop-shadow(0 0 0 transparent)',
          scale: 1,
          duration: toSeconds(DURATION.SLOW),
          ease: 'power2.in',
          clearProps: 'filter,scale',
        });
      break;

    case 'pulse':
      // Breathing pulse (like heartbeat)
      gsap
        .timeline()
        .to(avatar, { scale: 1.05, duration: toSeconds(DURATION.NORMAL), ease: 'power2.out' })
        .to(avatar, { scale: 1, duration: toSeconds(DURATION.FAST), ease: 'power2.in' })
        .to(avatar, { scale: 1.03, duration: toSeconds(DURATION.FAST), ease: 'power2.out' })
        .to(avatar, {
          scale: 1,
          duration: toSeconds(DURATION.SLOW),
          ease: 'elastic.out(1, 0.8)',
          clearProps: 'scale',
        });
      break;

    default:
      // Default bounce fallback
      gsap
        .timeline()
        .to(avatar, { y: -6, duration: toSeconds(DURATION.FAST), ease: 'power2.out' })
        .to(avatar, {
          y: 0,
          duration: toSeconds(DURATION.NORMAL),
          ease: 'elastic.out(1, 0.5)',
          clearProps: 'y',
        });
  }

  log.debug('Avatar reaction:', reaction);
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
        trackedTimeout(() => {
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
    
    /* Icon moments - Lucide SVG styling */
    .ferni-moment--icon {
      filter: drop-shadow(0 2px 4px rgba(44, 37, 32, 0.15));
      transition: filter 0.2s ease;
    }
    
    .ferni-moment--icon svg {
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    
    /* Aura effect - uses persona colors from design system */
    .ferni-moment--aura {
      background: radial-gradient(
        circle,
        var(--persona-glow, rgba(74, 103, 65, 0.25)) 0%,
        var(--persona-tint, rgba(74, 103, 65, 0.1)) 50%,
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

/**
 * Async wrapper for playMoment - used by narrative-director
 * Returns a promise that resolves after the moment animation completes
 */
export async function triggerMoment(type: MomentType): Promise<void> {
  playMoment(type);
  // Wait for animation to complete (most moments are ~1-2 seconds)
  const config = MOMENTS[type];
  const duration = config?.duration || 1000;
  return new Promise((resolve) => trackedTimeout(resolve, duration));
}
