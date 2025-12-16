/**
 * 🎭 Ferni Emotion State Machine
 * 
 * Central emotion management for Ferni's character-level animation system.
 * All visual feedback (avatar, ring, glow, waveform) reacts to this state.
 * 
 * BRAND PHILOSOPHY:
 * - Warm, not saccharine
 * - Present, not flashy
 * - Grounded - calm, stable, reliable presence
 * - Human - natural, organic, approachable
 * 
 * Design Principles:
 * - Single source of truth for emotional state
 * - Smooth transitions between emotions (never jarring)
 * - Brand-compliant earthy colors from design tokens
 * - Persona-aware emotion palettes
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('EmotionState');

// ============================================================================
// TYPES
// ============================================================================

export type EmotionId = 
  // Core states
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'thinking'
  | 'calm'
  | 'sad'
  | 'frustrated'
  | 'listening'
  | 'speaking'
  // Brand-aligned additions
  | 'contemplative'  // Deep thought, wise energy
  | 'noticing'       // Picking up on subtle signals
  | 'holdingSpace'   // Emotional containment
  // Phase 1: Listening States - Ferni's superpower
  | 'attentive'      // Active, engaged listening
  | 'absorbing'      // Taking in heavy content
  | 'receiving'      // Open, accepting vulnerability
  | 'curiousLean'    // Leaning in with interest
  // Phase 2: Warmth Gradient - Nuanced positive emotions
  | 'warm'           // Baseline positive regard
  | 'pleased'        // Mild satisfaction
  | 'delighted'      // Genuine happiness
  | 'proud'          // Pride in user
  | 'celebrating'    // Full celebration
  // Phase 3: Presence States - Quality of "being with"
  | 'present'        // Fully here, grounded
  | 'holding'        // Containing emotion
  | 'accompanying'   // Walking alongside
  | 'waiting'        // Patient anticipation
  // Phase 4: Coaching Emotions - Active guidance
  | 'encouraging'    // Gentle support
  | 'challenging'    // Loving push
  | 'reflecting'     // Mirroring back
  | 'recognizing'    // "I see you" moment
  // Phase 5: Relational Moments - Connection depth
  | 'remembering'    // Callback moment
  | 'reconnecting'   // "Welcome back" energy
  | 'insider'        // Shared history moment
  | 'growing'        // Noticing evolution
  // Phase 6: Transition States - Smooth emotional flow
  | 'processing'     // Taking it in
  | 'realizing'      // Connecting dots
  | 'shifting'       // Changing gears
  | 'settling';      // Coming to rest

export interface EmotionColor {
  /** Ring/glow primary color - CSS variable or hex */
  primary: string;
  /** Shadow/glow color with alpha */
  glow: string;
  /** Glow intensity 0-1 */
  intensity: number;
}

export interface BreathingParams {
  /** Breaths per minute (human range: 12-20) */
  rate: number;
  /** Squash/stretch depth (0.98-1.04 range) */
  depth: number;
  /** Breathing rhythm pattern */
  rhythm: 'regular' | 'irregular' | 'sighing';
}

export interface MovementParams {
  /** Overall movement intensity 0-1 */
  energy: number;
  /** Animation speed multiplier */
  speed: number;
  /** Random micro-movement amount */
  jitter: number;
}

export interface WaveformParams {
  /** 9-bar height curve (0-1 for each bar) */
  shape: number[];
  /** Response to volume peaks */
  bounce: number;
  /** How quickly bars settle */
  smoothing: number;
}

export interface QuirkParams {
  /** Blinks per minute */
  blinkRate: number;
  /** Enable curious head tilts */
  curiousTilts: boolean;
  /** Enable warmth pulse effects */
  warmthPulses: boolean;
}

export interface EmotionState {
  id: EmotionId;
  color: EmotionColor;
  breathing: BreathingParams;
  movement: MovementParams;
  waveform: WaveformParams;
  quirks: QuirkParams;
}

export interface TransitionOptions {
  /** Transition duration in seconds */
  duration?: number;
  /** Easing function name */
  ease?: string;
  /** Callback when transition completes */
  onComplete?: () => void;
}

// ============================================================================
// EMOTION PRESETS - Brand-Compliant Colors
// ============================================================================

export const EMOTIONS: Record<EmotionId, EmotionState> = {
  neutral: {
    id: 'neutral',
    color: {
      primary: 'var(--persona-primary)',
      glow: 'var(--persona-glow)',
      intensity: 0.3,
    },
    breathing: { rate: 14, depth: 1.015, rhythm: 'regular' },
    movement: { energy: 0.3, speed: 1.0, jitter: 0.02 },
    waveform: {
      shape: [0.3, 0.5, 0.7, 0.85, 1.0, 0.85, 0.7, 0.5, 0.3],
      bounce: 0,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 15, curiousTilts: true, warmthPulses: false },
  },

  happy: {
    id: 'happy',
    color: {
      primary: 'var(--color-highlight, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.4)',
      intensity: 0.5,
    },
    breathing: { rate: 16, depth: 1.02, rhythm: 'regular' },
    movement: { energy: 0.6, speed: 1.1, jitter: 0.05 },
    // SMILE shape - edges up like corners of mouth
    waveform: {
      shape: [0.9, 0.7, 0.5, 0.4, 0.35, 0.4, 0.5, 0.7, 0.9],
      bounce: 0.15,
      smoothing: 0.08,
    },
    quirks: { blinkRate: 12, curiousTilts: true, warmthPulses: true },
  },

  excited: {
    // BRAND: Grounded excitement - present and warm, NOT over-the-top
    id: 'excited',
    color: {
      primary: 'var(--color-jordan, #c4856a)',
      glow: 'rgba(196, 133, 106, 0.45)',
      intensity: 0.55, // Reduced from 0.7 - grounded, not flashy
    },
    breathing: { rate: 18, depth: 1.025, rhythm: 'irregular' }, // Calmer than before
    movement: { energy: 0.75, speed: 1.25, jitter: 0.07 }, // Reduced from 0.9/1.4
    // Warm engagement shape, not all-bars-maxed
    waveform: {
      shape: [0.75, 0.85, 0.95, 0.88, 0.95, 0.88, 0.95, 0.85, 0.75],
      bounce: 0.22, // Reduced from 0.3
      smoothing: 0.06,
    },
    quirks: { blinkRate: 16, curiousTilts: false, warmthPulses: true },
  },

  curious: {
    id: 'curious',
    color: {
      primary: 'var(--color-peter, #3a6b73)',
      glow: 'rgba(58, 107, 115, 0.4)',
      intensity: 0.4,
    },
    breathing: { rate: 15, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.5, speed: 0.9, jitter: 0.03 },
    // Slightly raised in middle - attentive
    waveform: {
      shape: [0.4, 0.5, 0.65, 0.8, 0.9, 0.8, 0.65, 0.5, 0.4],
      bounce: 0.08,
      smoothing: 0.12,
    },
    quirks: { blinkRate: 10, curiousTilts: true, warmthPulses: false },
  },

  thinking: {
    id: 'thinking',
    color: {
      primary: 'var(--color-alex, #5a6b8a)',
      glow: 'rgba(90, 107, 138, 0.35)',
      intensity: 0.35,
    },
    breathing: { rate: 12, depth: 1.01, rhythm: 'sighing' },
    movement: { energy: 0.2, speed: 0.7, jitter: 0.01 },
    // Pulsing, contemplative
    waveform: {
      shape: [0.4, 0.5, 0.6, 0.7, 0.8, 0.7, 0.6, 0.5, 0.4],
      bounce: 0.05,
      smoothing: 0.15,
    },
    quirks: { blinkRate: 8, curiousTilts: false, warmthPulses: false },
  },

  calm: {
    id: 'calm',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.3)',
      intensity: 0.25,
    },
    breathing: { rate: 10, depth: 1.012, rhythm: 'regular' },
    movement: { energy: 0.15, speed: 0.6, jitter: 0.005 },
    // Gentle even wave
    waveform: {
      shape: [0.5, 0.6, 0.7, 0.75, 0.8, 0.75, 0.7, 0.6, 0.5],
      bounce: 0.02,
      smoothing: 0.2,
    },
    quirks: { blinkRate: 12, curiousTilts: false, warmthPulses: true },
  },

  sad: {
    id: 'sad',
    color: {
      primary: 'var(--color-peter, #3a6b73)',
      glow: 'rgba(58, 107, 115, 0.25)',
      intensity: 0.2,
    },
    breathing: { rate: 11, depth: 1.008, rhythm: 'sighing' },
    movement: { energy: 0.1, speed: 0.5, jitter: 0 },
    // FROWN shape - edges down
    waveform: {
      shape: [0.2, 0.35, 0.55, 0.75, 0.85, 0.75, 0.55, 0.35, 0.2],
      bounce: 0,
      smoothing: 0.25,
    },
    quirks: { blinkRate: 20, curiousTilts: false, warmthPulses: false },
  },

  frustrated: {
    id: 'frustrated',
    color: {
      primary: 'var(--color-error, #a65a52)',
      glow: 'rgba(166, 90, 82, 0.4)',
      intensity: 0.45,
    },
    breathing: { rate: 18, depth: 1.025, rhythm: 'irregular' },
    movement: { energy: 0.7, speed: 1.2, jitter: 0.08 },
    // Jagged peaks
    waveform: {
      shape: [0.3, 0.8, 0.4, 0.9, 0.5, 0.85, 0.35, 0.75, 0.25],
      bounce: 0.12,
      smoothing: 0.06,
    },
    quirks: { blinkRate: 25, curiousTilts: false, warmthPulses: false },
  },

  listening: {
    id: 'listening',
    color: {
      primary: 'var(--color-accent, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.35)',
      intensity: 0.4,
    },
    breathing: { rate: 13, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.4, speed: 0.8, jitter: 0.02 },
    // Receptive, open shape
    waveform: {
      shape: [0.5, 0.6, 0.7, 0.8, 0.85, 0.8, 0.7, 0.6, 0.5],
      bounce: 0.1,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 14, curiousTilts: true, warmthPulses: false },
  },

  speaking: {
    id: 'speaking',
    color: {
      primary: 'var(--persona-primary)',
      glow: 'var(--persona-glow)',
      intensity: 0.5,
    },
    breathing: { rate: 16, depth: 1.02, rhythm: 'irregular' },
    movement: { energy: 0.6, speed: 1.0, jitter: 0.04 },
    // Active, expressive
    waveform: {
      shape: [0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4],
      bounce: 0.2,
      smoothing: 0.06,
    },
    quirks: { blinkRate: 16, curiousTilts: false, warmthPulses: false },
  },

  // ============================================================================
  // BRAND-ALIGNED EMOTION ADDITIONS
  // ============================================================================

  contemplative: {
    // BRAND: Deep thought - wise, measured energy (like Jack Bogle)
    id: 'contemplative',
    color: {
      primary: 'var(--color-jack, #9a7b5a)',
      glow: 'rgba(154, 123, 90, 0.3)',
      intensity: 0.3,
    },
    breathing: { rate: 10, depth: 1.01, rhythm: 'sighing' },
    movement: { energy: 0.15, speed: 0.5, jitter: 0.005 },
    // Slow, thoughtful wave - even and measured
    waveform: {
      shape: [0.45, 0.55, 0.65, 0.72, 0.75, 0.72, 0.65, 0.55, 0.45],
      bounce: 0.02,
      smoothing: 0.2,
    },
    quirks: { blinkRate: 8, curiousTilts: false, warmthPulses: false },
  },

  noticing: {
    // BRAND: Picking up on subtle signals - perceptive, attentive
    // Used when Ferni detects what's NOT being said
    id: 'noticing',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.35)',
      intensity: 0.35,
    },
    breathing: { rate: 13, depth: 1.015, rhythm: 'regular' },
    movement: { energy: 0.35, speed: 0.8, jitter: 0.02 },
    // Slightly heightened awareness shape
    waveform: {
      shape: [0.5, 0.6, 0.7, 0.78, 0.82, 0.78, 0.7, 0.6, 0.5],
      bounce: 0.06,
      smoothing: 0.12,
    },
    quirks: { blinkRate: 10, curiousTilts: true, warmthPulses: false },
  },

  holdingSpace: {
    // BRAND: Emotional containment - present, grounded, supportive
    // Used during difficult moments - "I'm here with you"
    id: 'holdingSpace',
    color: {
      primary: 'var(--color-maya, #a67a6a)',
      glow: 'rgba(166, 122, 106, 0.3)',
      intensity: 0.3,
    },
    breathing: { rate: 11, depth: 1.012, rhythm: 'regular' },
    movement: { energy: 0.2, speed: 0.6, jitter: 0.01 },
    // Stable, supportive wave - soft but present
    waveform: {
      shape: [0.55, 0.62, 0.68, 0.72, 0.75, 0.72, 0.68, 0.62, 0.55],
      bounce: 0.03,
      smoothing: 0.18,
    },
    quirks: { blinkRate: 12, curiousTilts: false, warmthPulses: true },
  },

  // ============================================================================
  // PHASE 1: LISTENING STATES - Ferni's superpower
  // ============================================================================

  attentive: {
    // Active, engaged listening - user is speaking normally
    id: 'attentive',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.35)',
      intensity: 0.35,
    },
    breathing: { rate: 14, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.4, speed: 0.85, jitter: 0.02 },
    waveform: {
      shape: [0.5, 0.6, 0.72, 0.82, 0.88, 0.82, 0.72, 0.6, 0.5],
      bounce: 0.08,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 12, curiousTilts: true, warmthPulses: false },
  },

  absorbing: {
    // Taking in heavy content - user shares something big
    id: 'absorbing',
    color: {
      primary: 'var(--color-jack, #9a7b5a)',
      glow: 'rgba(154, 123, 90, 0.3)',
      intensity: 0.3,
    },
    breathing: { rate: 10, depth: 1.025, rhythm: 'sighing' },
    movement: { energy: 0.15, speed: 0.5, jitter: 0.005 },
    waveform: {
      shape: [0.45, 0.55, 0.65, 0.72, 0.76, 0.72, 0.65, 0.55, 0.45],
      bounce: 0.02,
      smoothing: 0.2,
    },
    quirks: { blinkRate: 8, curiousTilts: false, warmthPulses: false },
  },

  receiving: {
    // Open, accepting - user shares vulnerability
    id: 'receiving',
    color: {
      primary: 'var(--color-maya, #a67a6a)',
      glow: 'rgba(166, 122, 106, 0.35)',
      intensity: 0.35,
    },
    breathing: { rate: 11, depth: 1.015, rhythm: 'regular' },
    movement: { energy: 0.2, speed: 0.6, jitter: 0.01 },
    waveform: {
      shape: [0.55, 0.62, 0.68, 0.73, 0.76, 0.73, 0.68, 0.62, 0.55],
      bounce: 0.03,
      smoothing: 0.18,
    },
    quirks: { blinkRate: 10, curiousTilts: false, warmthPulses: true },
  },

  curiousLean: {
    // Leaning in with interest - something intriguing
    id: 'curiousLean',
    color: {
      primary: 'var(--color-peter, #3a6b73)',
      glow: 'rgba(58, 107, 115, 0.4)',
      intensity: 0.4,
    },
    breathing: { rate: 15, depth: 1.02, rhythm: 'regular' },
    movement: { energy: 0.5, speed: 0.9, jitter: 0.03 },
    waveform: {
      shape: [0.45, 0.55, 0.68, 0.8, 0.88, 0.8, 0.68, 0.55, 0.45],
      bounce: 0.1,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 10, curiousTilts: true, warmthPulses: false },
  },

  // ============================================================================
  // PHASE 2: WARMTH GRADIENT - Nuanced positive emotions
  // ============================================================================

  warm: {
    // Baseline positive regard - default warmth
    id: 'warm',
    color: {
      primary: 'var(--color-highlight, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.25)',
      intensity: 0.3,
    },
    breathing: { rate: 14, depth: 1.015, rhythm: 'regular' },
    movement: { energy: 0.35, speed: 0.9, jitter: 0.02 },
    waveform: {
      shape: [0.6, 0.65, 0.7, 0.75, 0.78, 0.75, 0.7, 0.65, 0.6],
      bounce: 0.05,
      smoothing: 0.12,
    },
    quirks: { blinkRate: 14, curiousTilts: true, warmthPulses: true },
  },

  pleased: {
    // Mild satisfaction - small good news
    id: 'pleased',
    color: {
      primary: 'var(--color-highlight, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.35)',
      intensity: 0.4,
    },
    breathing: { rate: 15, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.45, speed: 0.95, jitter: 0.03 },
    waveform: {
      shape: [0.7, 0.68, 0.6, 0.52, 0.5, 0.52, 0.6, 0.68, 0.7],
      bounce: 0.08,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 13, curiousTilts: true, warmthPulses: true },
  },

  delighted: {
    // Genuine happiness - good news, progress
    id: 'delighted',
    color: {
      primary: 'var(--color-highlight, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.45)',
      intensity: 0.5,
    },
    breathing: { rate: 16, depth: 1.022, rhythm: 'regular' },
    movement: { energy: 0.55, speed: 1.05, jitter: 0.04 },
    waveform: {
      shape: [0.8, 0.7, 0.55, 0.45, 0.4, 0.45, 0.55, 0.7, 0.8],
      bounce: 0.12,
      smoothing: 0.08,
    },
    quirks: { blinkRate: 12, curiousTilts: true, warmthPulses: true },
  },

  proud: {
    // Pride in user - user accomplishment
    id: 'proud',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.45)',
      intensity: 0.5,
    },
    breathing: { rate: 14, depth: 1.02, rhythm: 'regular' },
    movement: { energy: 0.5, speed: 0.95, jitter: 0.03 },
    waveform: {
      shape: [0.75, 0.7, 0.6, 0.5, 0.45, 0.5, 0.6, 0.7, 0.75],
      bounce: 0.1,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 11, curiousTilts: false, warmthPulses: true },
  },

  celebrating: {
    // Full celebration - major milestone
    id: 'celebrating',
    color: {
      primary: 'var(--color-jordan, #c4856a)',
      glow: 'rgba(196, 133, 106, 0.5)',
      intensity: 0.6,
    },
    breathing: { rate: 17, depth: 1.028, rhythm: 'irregular' },
    movement: { energy: 0.7, speed: 1.15, jitter: 0.06 },
    waveform: {
      shape: [0.85, 0.75, 0.6, 0.48, 0.42, 0.48, 0.6, 0.75, 0.85],
      bounce: 0.18,
      smoothing: 0.06,
    },
    quirks: { blinkRate: 14, curiousTilts: false, warmthPulses: true },
  },

  // ============================================================================
  // PHASE 3: PRESENCE STATES - Quality of "being with"
  // ============================================================================

  present: {
    // Fully here, grounded - default connected state
    id: 'present',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.3)',
      intensity: 0.3,
    },
    breathing: { rate: 12, depth: 1.015, rhythm: 'regular' },
    movement: { energy: 0.3, speed: 0.8, jitter: 0.015 },
    waveform: {
      shape: [0.5, 0.58, 0.66, 0.72, 0.75, 0.72, 0.66, 0.58, 0.5],
      bounce: 0.04,
      smoothing: 0.15,
    },
    quirks: { blinkRate: 14, curiousTilts: false, warmthPulses: true },
  },

  holding: {
    // Containing emotion - user processing hard things
    id: 'holding',
    color: {
      primary: 'var(--color-maya, #a67a6a)',
      glow: 'rgba(166, 122, 106, 0.28)',
      intensity: 0.28,
    },
    breathing: { rate: 10, depth: 1.012, rhythm: 'sighing' },
    movement: { energy: 0.15, speed: 0.55, jitter: 0.008 },
    waveform: {
      shape: [0.52, 0.58, 0.64, 0.7, 0.72, 0.7, 0.64, 0.58, 0.52],
      bounce: 0.02,
      smoothing: 0.2,
    },
    quirks: { blinkRate: 10, curiousTilts: false, warmthPulses: false },
  },

  accompanying: {
    // Walking alongside - user in difficult moment
    id: 'accompanying',
    color: {
      primary: 'var(--color-maya, #a67a6a)',
      glow: 'rgba(166, 122, 106, 0.32)',
      intensity: 0.32,
    },
    breathing: { rate: 11, depth: 1.014, rhythm: 'regular' },
    movement: { energy: 0.22, speed: 0.65, jitter: 0.01 },
    waveform: {
      shape: [0.5, 0.58, 0.65, 0.71, 0.74, 0.71, 0.65, 0.58, 0.5],
      bounce: 0.03,
      smoothing: 0.18,
    },
    quirks: { blinkRate: 12, curiousTilts: false, warmthPulses: true },
  },

  waiting: {
    // Patient anticipation - giving space to think
    id: 'waiting',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.25)',
      intensity: 0.25,
    },
    breathing: { rate: 11, depth: 1.01, rhythm: 'regular' },
    movement: { energy: 0.18, speed: 0.6, jitter: 0.01 },
    waveform: {
      shape: [0.48, 0.55, 0.62, 0.68, 0.7, 0.68, 0.62, 0.55, 0.48],
      bounce: 0.02,
      smoothing: 0.2,
    },
    quirks: { blinkRate: 12, curiousTilts: false, warmthPulses: false },
  },

  // ============================================================================
  // PHASE 4: COACHING EMOTIONS - Active guidance
  // ============================================================================

  encouraging: {
    // Gentle support - user needs boost
    id: 'encouraging',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.4)',
      intensity: 0.4,
    },
    breathing: { rate: 15, depth: 1.02, rhythm: 'regular' },
    movement: { energy: 0.5, speed: 1.0, jitter: 0.03 },
    waveform: {
      shape: [0.65, 0.68, 0.72, 0.78, 0.82, 0.78, 0.72, 0.68, 0.65],
      bounce: 0.1,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 13, curiousTilts: false, warmthPulses: true },
  },

  challenging: {
    // Loving push - user needs to grow
    id: 'challenging',
    color: {
      primary: 'var(--color-peter, #3a6b73)',
      glow: 'rgba(58, 107, 115, 0.38)',
      intensity: 0.38,
    },
    breathing: { rate: 14, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.45, speed: 0.9, jitter: 0.025 },
    waveform: {
      shape: [0.55, 0.62, 0.7, 0.78, 0.82, 0.78, 0.7, 0.62, 0.55],
      bounce: 0.06,
      smoothing: 0.12,
    },
    quirks: { blinkRate: 11, curiousTilts: true, warmthPulses: false },
  },

  reflecting: {
    // Mirroring back - showing user their pattern
    id: 'reflecting',
    color: {
      primary: 'var(--color-alex, #5a6b8a)',
      glow: 'rgba(90, 107, 138, 0.35)',
      intensity: 0.35,
    },
    breathing: { rate: 12, depth: 1.012, rhythm: 'regular' },
    movement: { energy: 0.28, speed: 0.75, jitter: 0.015 },
    waveform: {
      shape: [0.5, 0.58, 0.66, 0.72, 0.74, 0.72, 0.66, 0.58, 0.5],
      bounce: 0.04,
      smoothing: 0.15,
    },
    quirks: { blinkRate: 10, curiousTilts: false, warmthPulses: false },
  },

  recognizing: {
    // "I see you" moment - acknowledging who they are
    id: 'recognizing',
    color: {
      primary: 'var(--color-highlight, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.42)',
      intensity: 0.42,
    },
    breathing: { rate: 13, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.4, speed: 0.85, jitter: 0.02 },
    waveform: {
      shape: [0.6, 0.65, 0.7, 0.76, 0.8, 0.76, 0.7, 0.65, 0.6],
      bounce: 0.08,
      smoothing: 0.12,
    },
    quirks: { blinkRate: 11, curiousTilts: false, warmthPulses: true },
  },

  // ============================================================================
  // PHASE 5: RELATIONAL MOMENTS - Connection depth
  // ============================================================================

  remembering: {
    // Callback moment - referencing past conversation
    id: 'remembering',
    color: {
      primary: 'var(--color-jack, #9a7b5a)',
      glow: 'rgba(154, 123, 90, 0.38)',
      intensity: 0.38,
    },
    breathing: { rate: 12, depth: 1.015, rhythm: 'regular' },
    movement: { energy: 0.35, speed: 0.8, jitter: 0.02 },
    waveform: {
      shape: [0.55, 0.6, 0.66, 0.72, 0.75, 0.72, 0.66, 0.6, 0.55],
      bounce: 0.06,
      smoothing: 0.14,
    },
    quirks: { blinkRate: 10, curiousTilts: false, warmthPulses: true },
  },

  reconnecting: {
    // "Welcome back" energy - user returns after absence
    id: 'reconnecting',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.42)',
      intensity: 0.42,
    },
    breathing: { rate: 15, depth: 1.02, rhythm: 'regular' },
    movement: { energy: 0.5, speed: 0.95, jitter: 0.03 },
    waveform: {
      shape: [0.65, 0.68, 0.72, 0.78, 0.82, 0.78, 0.72, 0.68, 0.65],
      bounce: 0.1,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 12, curiousTilts: true, warmthPulses: true },
  },

  insider: {
    // Shared history moment - inside joke, shared reference
    id: 'insider',
    color: {
      primary: 'var(--color-highlight, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.4)',
      intensity: 0.45,
    },
    breathing: { rate: 15, depth: 1.02, rhythm: 'irregular' },
    movement: { energy: 0.5, speed: 1.0, jitter: 0.04 },
    waveform: {
      shape: [0.72, 0.68, 0.58, 0.5, 0.48, 0.5, 0.58, 0.68, 0.72],
      bounce: 0.1,
      smoothing: 0.08,
    },
    quirks: { blinkRate: 13, curiousTilts: true, warmthPulses: true },
  },

  growing: {
    // Noticing evolution - user has grown since before
    id: 'growing',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.45)',
      intensity: 0.45,
    },
    breathing: { rate: 14, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.45, speed: 0.9, jitter: 0.025 },
    waveform: {
      shape: [0.6, 0.65, 0.7, 0.76, 0.8, 0.76, 0.7, 0.65, 0.6],
      bounce: 0.08,
      smoothing: 0.12,
    },
    quirks: { blinkRate: 11, curiousTilts: false, warmthPulses: true },
  },

  // ============================================================================
  // PHASE 6: TRANSITION STATES - Smooth emotional flow
  // ============================================================================

  processing: {
    // Taking it in - after user says something big
    id: 'processing',
    color: {
      primary: 'var(--color-alex, #5a6b8a)',
      glow: 'rgba(90, 107, 138, 0.32)',
      intensity: 0.32,
    },
    breathing: { rate: 11, depth: 1.012, rhythm: 'sighing' },
    movement: { energy: 0.2, speed: 0.65, jitter: 0.01 },
    waveform: {
      shape: [0.45, 0.52, 0.6, 0.68, 0.72, 0.68, 0.6, 0.52, 0.45],
      bounce: 0.03,
      smoothing: 0.18,
    },
    quirks: { blinkRate: 9, curiousTilts: false, warmthPulses: false },
  },

  realizing: {
    // Connecting dots - Ferni makes a connection
    id: 'realizing',
    color: {
      primary: 'var(--color-peter, #3a6b73)',
      glow: 'rgba(58, 107, 115, 0.4)',
      intensity: 0.4,
    },
    breathing: { rate: 14, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.45, speed: 0.9, jitter: 0.03 },
    waveform: {
      shape: [0.5, 0.58, 0.68, 0.78, 0.85, 0.78, 0.68, 0.58, 0.5],
      bounce: 0.08,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 11, curiousTilts: true, warmthPulses: false },
  },

  shifting: {
    // Changing gears - topic or energy change
    id: 'shifting',
    color: {
      primary: 'var(--persona-primary)',
      glow: 'var(--persona-glow)',
      intensity: 0.32,
    },
    breathing: { rate: 13, depth: 1.015, rhythm: 'regular' },
    movement: { energy: 0.35, speed: 0.85, jitter: 0.02 },
    waveform: {
      shape: [0.5, 0.58, 0.65, 0.72, 0.75, 0.72, 0.65, 0.58, 0.5],
      bounce: 0.05,
      smoothing: 0.14,
    },
    quirks: { blinkRate: 13, curiousTilts: false, warmthPulses: false },
  },

  settling: {
    // Coming to rest - after emotional peak
    id: 'settling',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.28)',
      intensity: 0.28,
    },
    breathing: { rate: 11, depth: 1.012, rhythm: 'regular' },
    movement: { energy: 0.22, speed: 0.7, jitter: 0.01 },
    waveform: {
      shape: [0.48, 0.55, 0.62, 0.68, 0.72, 0.68, 0.62, 0.55, 0.48],
      bounce: 0.03,
      smoothing: 0.18,
    },
    quirks: { blinkRate: 13, curiousTilts: false, warmthPulses: false },
  },
};

// ============================================================================
// EMOTION STATE MANAGER
// ============================================================================

type EmotionListener = (emotion: EmotionState, previous: EmotionState) => void;

class EmotionStateManager {
  private current: EmotionState = EMOTIONS.neutral;
  private previous: EmotionState = EMOTIONS.neutral;
  private listeners: Set<EmotionListener> = new Set();
  private transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  
  /**
   * Get current emotion state
   */
  get emotion(): EmotionState {
    return this.current;
  }
  
  /**
   * Get previous emotion state (for transitions)
   */
  get previousEmotion(): EmotionState {
    return this.previous;
  }
  
  /**
   * Set emotion with optional transition
   */
  setEmotion(emotionId: EmotionId, options?: TransitionOptions): void {
    const newEmotion = EMOTIONS[emotionId];
    if (!newEmotion) {
      log.warn(`Unknown emotion: ${emotionId}`);
      return;
    }
    
    if (this.current.id === emotionId) {
      return; // Already in this emotion
    }
    
    log.debug(`Emotion transition: ${this.current.id} → ${emotionId}`);
    
    this.previous = this.current;
    this.current = newEmotion;
    
    // Notify listeners
    this.notifyListeners();
    
    // Handle onComplete callback
    if (options?.onComplete) {
      const duration = (options.duration ?? 0.8) * 1000;
      this.transitionTimeout = setTimeout(options.onComplete, duration);
    }
  }
  
  /**
   * Flash an emotion temporarily, then return to previous
   */
  flashEmotion(emotionId: EmotionId, durationMs: number = 2000): void {
    const returnTo = this.current.id;
    
    this.setEmotion(emotionId);
    
    // Clear any existing timeout
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
    }
    
    this.transitionTimeout = setTimeout(() => {
      this.setEmotion(returnTo);
    }, durationMs);
  }
  
  /**
   * Subscribe to emotion changes
   */
  subscribe(listener: EmotionListener): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current state
    listener(this.current, this.previous);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  /**
   * Notify all listeners of emotion change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.current, this.previous);
      } catch (error) {
        log.error('Emotion listener error:', error);
      }
    });
  }
  
  /**
   * Clean up
   */
  dispose(): void {
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
    }
    this.listeners.clear();
    this.current = EMOTIONS.neutral;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const emotionState = new EmotionStateManager();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export function setEmotion(emotionId: EmotionId, options?: TransitionOptions): void {
  emotionState.setEmotion(emotionId, options);
}

// Alias for backward compatibility
export const transitionEmotion = setEmotion;

export function flashEmotion(emotionId: EmotionId, durationMs?: number): void {
  emotionState.flashEmotion(emotionId, durationMs);
}

export function getCurrentEmotion(): EmotionState {
  return emotionState.emotion;
}

export function subscribeToEmotion(listener: EmotionListener): () => void {
  return emotionState.subscribe(listener);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default emotionState;

