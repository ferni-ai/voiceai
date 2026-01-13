/**
 * Micro-Expressions Library
 *
 * These are subliminal expressions (40-150ms) that the user doesn't consciously
 * see but subconsciously feels. They build trust and connection.
 *
 * Inspired by human micro-expressions research (Paul Ekman) adapted for
 * Ferni's LUXO-style eyes (opaque white, no pupils - expression through shape).
 */

import { DURATION, EASING } from './animation-constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Keyframe {
  offset: number; // 0-1 through animation
  value: number;
}

export interface MicroExpression {
  /** Unique identifier */
  name: string;

  /** Human-readable description */
  description: string;

  /** Total duration in ms (40-150 for true micro-expressions) */
  duration: number;

  /** What triggers this expression */
  triggers: ExpressionTrigger[];

  /** Priority for queue management */
  priority: 'high' | 'normal' | 'low';

  /** Eye transforms (LUXO style - shape only) */
  eyes: {
    scaleX: Keyframe[];
    scaleY: Keyframe[];
    translateY: Keyframe[];
    rotation?: Keyframe[]; // Slight tilt for some expressions
  };

  /** Body/head transforms (very subtle) */
  body: {
    scale: Keyframe[];
    translateY: Keyframe[];
    rotation?: Keyframe[]; // Head tilt
  };

  /** Glow/aura effect */
  glow: {
    opacity: Keyframe[];
    scale: Keyframe[];
  };

  /** Timing function */
  easing: string;

  /** Stagger between left/right eye (ms) for natural asymmetry */
  eyeStagger: number;
}

export type ExpressionTrigger =
  | 'memory_recall' // Ferni remembers something about user
  | 'pattern_recognition' // Ferni notices a pattern
  | 'concern_detected' // Voice stress/concern detected
  | 'joy_detected' // Voice happiness detected
  | 'sadness_detected' // Voice sadness detected
  | 'thinking' // Ferni is processing
  | 'understanding' // Ferni comprehends what user said
  | 'user_pause' // User paused while speaking
  | 'breakthrough' // User had a realization
  | 'greeting' // Session start or return
  | 'farewell' // Session end
  | 'agreement' // User agrees with Ferni
  | 'disagreement' // User disagrees with Ferni
  | 'surprise' // Unexpected information
  | 'anticipation'; // Predicting user's direction

// ─────────────────────────────────────────────────────────────────────────────
// Core Expressions (10)
// ─────────────────────────────────────────────────────────────────────────────

export const MICRO_EXPRESSIONS: Record<string, MicroExpression> = {
  /**
   * Recognition Flash
   * When Ferni recalls something about the user
   * "I know you" moment
   */
  recognition: {
    name: 'recognition',
    description: 'Eyes widen briefly - I remember you',
    duration: 80,
    triggers: ['memory_recall', 'pattern_recognition'],
    priority: 'high',
    eyes: {
      scaleX: [
        { offset: 0, value: 1 },
        { offset: 0.35, value: 1.12 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.35, value: 1.18 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.35, value: -1 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.4, value: 1.01 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.4, value: -1 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [
        { offset: 0, value: 0 },
        { offset: 0.3, value: 0.4 },
        { offset: 1, value: 0 },
      ],
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.3, value: 1.1 },
        { offset: 1, value: 1 },
      ],
    },
    easing: EASING.OUT_EXPO,
    eyeStagger: 8,
  },

  /**
   * Concern Flicker
   * When stress/worry is detected in voice
   * "I sense something's wrong" moment
   */
  concern: {
    name: 'concern',
    description: 'Eyes soften and narrow slightly - I sense concern',
    duration: 100,
    triggers: ['concern_detected', 'sadness_detected'],
    priority: 'high',
    eyes: {
      scaleX: [
        { offset: 0, value: 1 },
        { offset: 0.4, value: 1.05 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.4, value: 0.9 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 1 },
        { offset: 1, value: 0 },
      ],
      rotation: [
        { offset: 0, value: 0 },
        { offset: 0.4, value: -2 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 2 },
        { offset: 1, value: 0 },
      ],
      rotation: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 1 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 0.2 },
        { offset: 1, value: 0 },
      ],
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
    },
    easing: EASING.DECELERATE,
    eyeStagger: 15,
  },

  /**
   * Joy Spark
   * When happiness/excitement is detected
   * "I share your joy" moment
   */
  joy: {
    name: 'joy',
    description: 'Eyes brighten and lift - shared happiness',
    duration: 60,
    triggers: ['joy_detected', 'breakthrough'],
    priority: 'high',
    eyes: {
      scaleX: [
        { offset: 0, value: 1 },
        { offset: 0.25, value: 1.15 },
        { offset: 0.6, value: 1.08 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.25, value: 1.1 },
        { offset: 0.6, value: 0.95 }, // Slight squint like smiling
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.25, value: -2 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.3, value: 1.02 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.3, value: -2 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [
        { offset: 0, value: 0 },
        { offset: 0.2, value: 0.5 },
        { offset: 1, value: 0 },
      ],
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.3, value: 1.15 },
        { offset: 1, value: 1 },
      ],
    },
    easing: EASING.SPRING,
    eyeStagger: 5,
  },

  /**
   * Understanding Nod
   * When Ferni comprehends what user is saying
   * "I get it" moment
   */
  understanding: {
    name: 'understanding',
    description: 'Subtle nod with eyes tracking - I understand',
    duration: 120,
    triggers: ['understanding', 'agreement'],
    priority: 'normal',
    eyes: {
      scaleX: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.3, value: 0.92 },
        { offset: 0.6, value: 1.02 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.3, value: 2 },
        { offset: 0.6, value: -1 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.35, value: 3 },
        { offset: 0.65, value: -1 },
        { offset: 1, value: 0 },
      ],
      rotation: [
        { offset: 0, value: 0 },
        { offset: 0.35, value: 2 },
        { offset: 0.65, value: -0.5 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [{ offset: 0, value: 0 }, { offset: 1, value: 0 }],
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
    },
    easing: EASING.DECELERATE,
    eyeStagger: 0, // Synchronized for nod
  },

  /**
   * Protective Narrowing
   * When user mentions difficulty or threat
   * "I've got you" moment
   */
  protective: {
    name: 'protective',
    description: 'Eyes narrow protectively - I will help',
    duration: 100,
    triggers: ['concern_detected'],
    priority: 'normal',
    eyes: {
      scaleX: [
        { offset: 0, value: 1 },
        { offset: 0.4, value: 1.08 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.4, value: 0.85 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.4, value: 1 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.5, value: 1.01 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: -2 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [
        { offset: 0, value: 0 },
        { offset: 0.4, value: 0.25 },
        { offset: 1, value: 0 },
      ],
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
    },
    easing: EASING.DECELERATE,
    eyeStagger: 10,
  },

  /**
   * Pondering
   * When Ferni is thinking/processing
   * "Let me think" moment
   */
  pondering: {
    name: 'pondering',
    description: 'Eyes drift slightly upward - thinking',
    duration: 150,
    triggers: ['thinking'],
    priority: 'low',
    eyes: {
      scaleX: [
        { offset: 0, value: 1 },
        { offset: 0.5, value: 0.95 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.5, value: 0.98 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: -3 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: -1 },
        { offset: 1, value: 0 },
      ],
      rotation: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 3 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [{ offset: 0, value: 0 }, { offset: 1, value: 0 }],
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
    },
    easing: EASING.DECELERATE,
    eyeStagger: 20,
  },

  /**
   * Patient Presence
   * When user pauses, Ferni holds space
   * "Take your time" moment
   */
  patience: {
    name: 'patience',
    description: 'Soft, still presence - I am here',
    duration: 150,
    triggers: ['user_pause'],
    priority: 'low',
    eyes: {
      scaleX: [
        { offset: 0, value: 1 },
        { offset: 0.5, value: 1.02 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.5, value: 0.98 },
        { offset: 1, value: 1 },
      ],
      translateY: [{ offset: 0, value: 0 }, { offset: 1, value: 0 }],
    },
    body: {
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 1 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 0.15 },
        { offset: 1, value: 0.1 },
      ],
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.5, value: 1.05 },
        { offset: 1, value: 1.02 },
      ],
    },
    easing: EASING.DECELERATE,
    eyeStagger: 0,
  },

  /**
   * Surprise
   * When unexpected information arrives
   * "Oh!" moment
   */
  surprise: {
    name: 'surprise',
    description: 'Eyes widen suddenly - unexpected',
    duration: 70,
    triggers: ['surprise'],
    priority: 'high',
    eyes: {
      scaleX: [
        { offset: 0, value: 1 },
        { offset: 0.2, value: 1.2 },
        { offset: 0.5, value: 1.15 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.2, value: 1.25 },
        { offset: 0.5, value: 1.18 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.2, value: -2 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.2, value: 1.015 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.2, value: -3 },
        { offset: 0.6, value: -1 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [
        { offset: 0, value: 0 },
        { offset: 0.15, value: 0.5 },
        { offset: 1, value: 0 },
      ],
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.2, value: 1.2 },
        { offset: 1, value: 1 },
      ],
    },
    easing: EASING.OUT_EXPO,
    eyeStagger: 3,
  },

  /**
   * Anticipation
   * When Ferni predicts where user is going
   * "I see where this is heading" moment
   */
  anticipation: {
    name: 'anticipation',
    description: 'Eyes lean forward slightly - I anticipate',
    duration: 100,
    triggers: ['anticipation'],
    priority: 'normal',
    eyes: {
      scaleX: [
        { offset: 0, value: 1 },
        { offset: 0.4, value: 1.05 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 1 },
        { offset: 0.4, value: 1.08 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.4, value: 2 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [
        { offset: 0, value: 1 },
        { offset: 0.4, value: 1.008 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 0 },
        { offset: 0.4, value: -3 },
        { offset: 1, value: 0 },
      ],
      rotation: [
        { offset: 0, value: 0 },
        { offset: 0.4, value: -1 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [
        { offset: 0, value: 0 },
        { offset: 0.3, value: 0.2 },
        { offset: 1, value: 0 },
      ],
      scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1 }],
    },
    easing: EASING.DECELERATE,
    eyeStagger: 12,
  },

  /**
   * Warm Greeting
   * At session start or return
   * "Welcome back" moment
   */
  greeting: {
    name: 'greeting',
    description: 'Eyes brighten with warmth - hello friend',
    duration: 140,
    triggers: ['greeting'],
    priority: 'high',
    eyes: {
      scaleX: [
        { offset: 0, value: 0.9 },
        { offset: 0.3, value: 1.1 },
        { offset: 0.6, value: 1.05 },
        { offset: 1, value: 1 },
      ],
      scaleY: [
        { offset: 0, value: 0.8 },
        { offset: 0.3, value: 1.15 },
        { offset: 0.6, value: 0.95 }, // Slight squint like smiling
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 5 },
        { offset: 0.3, value: -2 },
        { offset: 1, value: 0 },
      ],
    },
    body: {
      scale: [
        { offset: 0, value: 0.98 },
        { offset: 0.3, value: 1.02 },
        { offset: 1, value: 1 },
      ],
      translateY: [
        { offset: 0, value: 5 },
        { offset: 0.3, value: -2 },
        { offset: 1, value: 0 },
      ],
    },
    glow: {
      opacity: [
        { offset: 0, value: 0 },
        { offset: 0.3, value: 0.4 },
        { offset: 1, value: 0.1 },
      ],
      scale: [
        { offset: 0, value: 0.8 },
        { offset: 0.3, value: 1.15 },
        { offset: 1, value: 1 },
      ],
    },
    easing: EASING.SPRING,
    eyeStagger: 8,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get expression by trigger type
 */
export function getExpressionForTrigger(trigger: ExpressionTrigger): MicroExpression | null {
  for (const expression of Object.values(MICRO_EXPRESSIONS)) {
    if (expression.triggers.includes(trigger)) {
      return expression;
    }
  }
  return null;
}

/**
 * Get all expressions for a given priority
 */
export function getExpressionsByPriority(priority: 'high' | 'normal' | 'low'): MicroExpression[] {
  return Object.values(MICRO_EXPRESSIONS).filter(e => e.priority === priority);
}

/**
 * Interpolate keyframes for a given progress (0-1)
 */
export function interpolateKeyframes(keyframes: Keyframe[], progress: number): number {
  // Find surrounding keyframes
  let lower: Keyframe | null = null;
  let upper: Keyframe | null = null;

  for (const kf of keyframes) {
    if (kf.offset <= progress) {
      lower = kf;
    }
    if (kf.offset >= progress && !upper) {
      upper = kf;
    }
  }

  if (!lower) return upper?.value ?? 0;
  if (!upper) return lower.value;
  if (lower === upper) return lower.value;

  // Linear interpolation between keyframes
  const range = upper.offset - lower.offset;
  const localProgress = (progress - lower.offset) / range;

  return lower.value + (upper.value - lower.value) * localProgress;
}
