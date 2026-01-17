/**
 * Moments System Constants
 *
 * Timing, animation, and haptic constants for the unified feedback system.
 * Based on Pixar animation principles: Anticipation → Action → Resolution
 *
 * @module ui/moments/constants
 */

import { DURATION, EASING, STAGGER } from '../../config/animation-constants.js';
import type { AnimationKeyframes, AnimationOptions, CelebrationBeat, HapticPattern } from './types.js';

// ============================================================================
// DURATION CONSTANTS
// ============================================================================

export const MOMENT_DURATIONS = {
  whisper: {
    default: 2500,
    short: 2000,
    error: 4000,
  },
  notice: {
    default: 4000,
    withAction: 8000,
  },
  celebration: {
    sequence: 1600,
    display: 5000,
  },
  milestone: {
    entrance: 800,
    contentStagger: 80,
  },
} as const;

// ============================================================================
// WHISPER ANIMATIONS
// ============================================================================

export const WHISPER_ANIMATION = {
  enter: {
    keyframes: [
      { opacity: 0, transform: 'translateY(8px) scale(0.95)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.SLOW,
      easing: EASING.SPRING,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
  exit: {
    keyframes: [
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.NORMAL,
      easing: EASING.STANDARD,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
} as const;

// ============================================================================
// NOTICE ANIMATIONS
// ============================================================================

export const NOTICE_ANIMATION = {
  avatarAnticipation: {
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(0.98)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.FAST,
      easing: EASING.ANTICIPATE,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
  avatarPulse: {
    keyframes: [
      { boxShadow: '0 0 0 0 var(--persona-glow, rgba(74, 103, 65, 0))' },
      { boxShadow: '0 0 30px 8px var(--persona-glow, rgba(74, 103, 65, 0.4))' },
      { boxShadow: '0 0 15px 4px var(--persona-glow, rgba(74, 103, 65, 0.2))' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
  enter: {
    keyframes: [
      { opacity: 0, transform: 'translateY(12px) scale(0.9)' },
      { opacity: 1, transform: 'translateY(0) scale(1.02)', offset: 0.7 },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.SLOW,
      easing: EASING.SPRING,
      delay: DURATION.FAST,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
  exit: {
    keyframes: [
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(-8px) scale(0.95)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.NORMAL,
      easing: EASING.EXPO_OUT,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
} as const;

// ============================================================================
// CELEBRATION SEQUENCE
// Pixar-style emotional beats
// ============================================================================

export const CELEBRATION_SEQUENCE: CelebrationBeat[] = [
  // Beat 1: Anticipation (Ferni notices)
  {
    name: 'anticipation',
    duration: DURATION.FAST,
    avatar: { scale: 0.95, expression: 'notice' },
    haptic: 'softTap',
  },
  // Beat 2: Wind-up (Ferni prepares)
  {
    name: 'windUp',
    duration: DURATION.NORMAL,
    avatar: { scale: 0.9, expression: 'delight-prep' },
  },
  // Beat 3: Celebration burst
  {
    name: 'burst',
    duration: DURATION.SLOW,
    easing: EASING.SPRING,
    avatar: { scale: 1.08, expression: 'delight', glow: 'full' },
    sparkles: { emit: 12, spread: 'radial' },
    message: true,
    haptic: 'success',
  },
  // Beat 4: Settle
  {
    name: 'settle',
    duration: DURATION.NORMAL,
    easing: EASING.EXPO_OUT,
    avatar: { scale: 1, expression: 'happy' },
    sparkles: { fade: true },
  },
  // Beat 5: Return to neutral
  {
    name: 'neutral',
    duration: DURATION.SLOW,
    avatar: { expression: 'neutral' },
    message: { persist: true },
  },
];

// ============================================================================
// MILESTONE ANIMATIONS
// ============================================================================

export const MILESTONE_ANIMATION = {
  backdrop: {
    keyframes: [
      { opacity: 0, backdropFilter: 'blur(0px)' },
      { opacity: 1, backdropFilter: 'blur(20px)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.SLOW,
      easing: EASING.STANDARD,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
  card: {
    keyframes: [
      { opacity: 0, transform: 'scale(0.8) translateY(40px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.DRAMATIC,
      easing: EASING.SPRING,
      delay: DURATION.NORMAL,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
  content: {
    keyframes: [
      { opacity: 0, transform: 'translateY(16px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.DELIBERATE,
      easing: EASING.EXPO_OUT,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
    stagger: STAGGER.RELAXED,
    elements: ['icon', 'eyebrow', 'title', 'message', 'stats', 'action'],
  },
  exit: {
    keyframes: [
      { opacity: 1, transform: 'scale(1) translateY(0)' },
      { opacity: 0, transform: 'scale(0.95) translateY(-20px)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.SLOW,
      easing: EASING.STANDARD,
      fill: 'forwards' as FillMode,
    } as AnimationOptions,
  },
} as const;

// ============================================================================
// BADGE ANIMATIONS
// ============================================================================

export const BADGE_ANIMATION = {
  streakFlicker: {
    keyframes: [
      { transform: 'scaleY(1)', opacity: 1 },
      { transform: 'scaleY(1.05)', opacity: 0.9, offset: 0.25 },
      { transform: 'scaleY(0.95)', opacity: 1, offset: 0.5 },
      { transform: 'scaleY(1.03)', opacity: 0.95, offset: 0.75 },
      { transform: 'scaleY(1)', opacity: 1 },
    ] as AnimationKeyframes[],
    options: {
      duration: 2000,
      easing: 'ease-in-out',
      iterations: Infinity,
    } as AnimationOptions,
  },
  seedGrow: {
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.3)', offset: 0.3 },
      { transform: 'scale(1)' },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.DRAMATIC,
      easing: EASING.SPRING,
    } as AnimationOptions,
  },
  badgeUnlock: {
    keyframes: [
      { transform: 'scale(0.8)', opacity: 0 },
      { transform: 'scale(1.2)', opacity: 1, offset: 0.5 },
      { transform: 'scale(1)', opacity: 1 },
    ] as AnimationKeyframes[],
    options: {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
    } as AnimationOptions,
  },
  checkinPulse: {
    keyframes: [
      { boxShadow: '0 2px 8px rgba(74, 103, 65, 0.3), 0 0 0 1px rgba(74, 103, 65, 0.2)' },
      { boxShadow: '0 2px 12px rgba(74, 103, 65, 0.5), 0 0 0 4px rgba(74, 103, 65, 0.1)', offset: 0.5 },
      { boxShadow: '0 2px 8px rgba(74, 103, 65, 0.3), 0 0 0 1px rgba(74, 103, 65, 0.2)' },
    ] as AnimationKeyframes[],
    options: {
      duration: 3000,
      easing: 'ease-in-out',
      iterations: Infinity,
    } as AnimationOptions,
  },
} as const;

// ============================================================================
// HAPTIC MAPPINGS
// ============================================================================

export const HAPTIC_MAP: Record<string, HapticPattern> = {
  // Whisper types
  'whisper:info': 'softTap',
  'whisper:success': 'softTap',
  'whisper:warning': 'notification',
  'whisper:error': 'error',

  // Notice types
  'notice:info': 'notification',
  'notice:seeds': 'sparkle',
  'notice:badge': 'success',
  'notice:streak': 'success',
  'notice:secret': 'sparkle',
  'notice:checkin': 'warmWelcome',

  // Celebration types
  'celebration:small_win': 'softTap',
  'celebration:big_win': 'success',
  'celebration:streak': 'success',
  'celebration:badge': 'success',
  'celebration:secret': 'sparkle',
  'celebration:team_unlock': 'warmWelcome',
  'celebration:first_meeting': 'warmWelcome',

  // Milestone
  'milestone:entrance': 'warmWelcome',
  'milestone:action': 'success',
} as const;

// ============================================================================
// COLOR MAPPINGS
// ============================================================================

export const MOMENT_COLORS = {
  whisper: {
    info: {
      background: 'var(--persona-primary)',
      text: 'white',
      border: 'var(--persona-secondary)',
    },
    success: {
      background: 'var(--persona-primary)',
      text: 'white',
      border: 'var(--persona-secondary)',
    },
    warning: {
      background: 'var(--color-semantic-warning)',
      text: 'white',
      border: 'var(--color-semantic-warning-border)',
    },
    error: {
      background: 'var(--color-semantic-error)',
      text: 'white',
      border: 'var(--color-semantic-error-border)',
    },
  },
  notice: {
    info: {
      background: 'var(--persona-primary)',
      text: 'white',
      glow: 'var(--persona-glow)',
    },
    seeds: {
      background: 'linear-gradient(135deg, var(--persona-primary), var(--persona-secondary))',
      text: 'white',
      glow: 'var(--persona-glow)',
    },
    badge: {
      background: 'var(--color-semantic-success)',
      text: 'white',
      glow: 'var(--color-semantic-success-glow)',
    },
  },
} as const;

// ============================================================================
// Z-INDEX LAYERS
// ============================================================================

export const MOMENT_Z_INDEX = {
  whisper: 1000,
  notice: 1100,
  celebration: 1200,
  badge: 1300,
  milestone: 2000,
  trophyRoom: 2100,
} as const;

// ============================================================================
// SPARKLE CONFIGURATION
// ============================================================================

export const SPARKLE_CONFIG = {
  count: { min: 6, max: 12 },
  size: { min: 4, max: 8 },
  spread: { min: 30, max: 60 },
  duration: DURATION.CELEBRATION,
  colors: ['rgba(255, 255, 255, 0.9)', 'var(--persona-glow)'],
} as const;

// ============================================================================
// ACCESSIBILITY
// ============================================================================

export const REDUCED_MOTION_DURATIONS = {
  whisper: DURATION.FAST,
  notice: DURATION.FAST,
  celebration: DURATION.NORMAL,
  milestone: DURATION.NORMAL,
} as const;
