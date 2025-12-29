/**
 * Speaking Mouth Animation - Voice-Reactive Window Avatar System
 * 
 * This module brings the Window Avatar to life during speech by dynamically
 * animating the bottom lid to create a "mouth" effect. The mouth opens and
 * closes based on voice volume, creating the illusion that Ferni is speaking
 * through the window.
 * 
 * Design Philosophy:
 * "Ferni doesn't live in your phone. She peeks through it."
 * 
 * The bottom lid (window mask) becomes a voice-reactive mouth:
 * - Louder volume → larger opening
 * - Emotion + speech combine (happy smile that opens)
 * - Smooth, organic animation (never robotic)
 * 
 * Integration:
 * - Receives volume from presence.ui.ts voice pulse system
 * - Works with ferni-expressions.ui.ts lid overlay system
 * - Respects design tokens from window-avatar.json
 * 
 * @see docs/vision/WINDOW-AVATAR-DESIGN-LANGUAGE.md
 * @see design-system/tokens/window-avatar.json
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import type { EmotionalExpression } from './ferni-expressions.ui.js';

const log = createLogger('SpeakingMouth');

// ============================================================================
// TYPES
// ============================================================================

interface MouthState {
  /** Current mouth opening (0 = closed, 1 = max open) */
  openAmount: number;
  /** Target mouth opening */
  targetOpen: number;
  /** Current emotion affecting mouth shape */
  emotion: EmotionalExpression;
  /** Is animation loop running */
  isAnimating: boolean;
}

interface MouthEmotionModifier {
  /** Curve direction: negative = smile up, positive = frown down */
  curve: number;
  /** Asymmetry: offset for one side higher */
  asymmetry: number;
  /** Base offset added to opening */
  baseOffset: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Animation timing constants */
const MOUTH_CONFIG = {
  /** Smoothing factor for volume increases (faster attack) */
  SMOOTHING_ATTACK: 0.25,
  /** Smoothing factor for volume decreases (slower release) */
  SMOOTHING_RELEASE: 0.12,
  /** Minimum mouth opening when speaking (ensures visible movement) */
  MIN_SPEAKING_OPEN: 0.15,
  /** Maximum mouth opening */
  MAX_OPEN: 0.35,
  /** How quickly animation updates (ms) */
  UPDATE_INTERVAL: 16, // ~60fps
  /** Threshold for stopping animation */
  THRESHOLD: 0.001,
} as const;

/** SVG path parameters */
const PATH_CONFIG = {
  /** SVG viewBox dimensions */
  VIEW_WIDTH: 100,
  VIEW_HEIGHT: 100,
  /** Y position of bottom lid baseline */
  BASELINE_Y: 100,
  /** Control point Y when closed */
  CLOSED_CONTROL_Y: 110,
  /** Control point Y when max open */
  OPEN_CONTROL_Y: 65,
  /** Curve multiplier for emotions */
  CURVE_MULTIPLIER: 8,
  /** Asymmetry multiplier */
  ASYMMETRY_MULTIPLIER: 5,
} as const;

/**
 * How each emotion affects the mouth shape
 * - curve: negative = smile (curve up), positive = frown (curve down)
 * - asymmetry: left-right offset for expressions like skeptical
 * - baseOffset: additional opening for expressive emotions
 */
const MOUTH_EMOTION_MODIFIERS: Record<string, MouthEmotionModifier> = {
  // Core expressions
  neutral: { curve: 0, asymmetry: 0, baseOffset: 0 },
  happy: { curve: -0.20, asymmetry: 0, baseOffset: 0.02 },
  delighted: { curve: -0.30, asymmetry: 0, baseOffset: 0.04 },
  sad: { curve: 0.15, asymmetry: 0, baseOffset: -0.02 },
  surprised: { curve: 0, asymmetry: 0, baseOffset: 0.06 },
  sleepy: { curve: 0.05, asymmetry: 0, baseOffset: -0.03 },
  skeptical: { curve: 0.08, asymmetry: 0.20, baseOffset: 0 },
  curious: { curve: 0, asymmetry: 0.12, baseOffset: 0.01 },
  worried: { curve: 0.12, asymmetry: 0.05, baseOffset: -0.02 },
  excited: { curve: -0.18, asymmetry: 0, baseOffset: 0.03 },
  
  // Listening states
  attentive: { curve: -0.05, asymmetry: 0, baseOffset: 0 },
  absorbing: { curve: 0.03, asymmetry: 0, baseOffset: -0.01 },
  receiving: { curve: -0.08, asymmetry: 0, baseOffset: 0 },
  curiousLean: { curve: 0, asymmetry: 0.08, baseOffset: 0.01 },
  
  // Warmth gradient
  warm: { curve: -0.10, asymmetry: 0, baseOffset: 0.01 },
  pleased: { curve: -0.15, asymmetry: 0, baseOffset: 0.02 },
  proud: { curve: -0.18, asymmetry: 0, baseOffset: 0.03 },
  celebrating: { curve: -0.25, asymmetry: 0, baseOffset: 0.05 },
  
  // Presence states
  present: { curve: -0.05, asymmetry: 0, baseOffset: 0 },
  holding: { curve: 0.03, asymmetry: 0, baseOffset: -0.01 },
  accompanying: { curve: -0.08, asymmetry: 0, baseOffset: 0 },
  waiting: { curve: 0, asymmetry: 0, baseOffset: 0 },
  
  // Coaching emotions
  encouraging: { curve: -0.12, asymmetry: 0, baseOffset: 0.02 },
  challenging: { curve: 0.05, asymmetry: 0.05, baseOffset: 0 },
  reflecting: { curve: 0.02, asymmetry: 0, baseOffset: 0 },
  recognizing: { curve: -0.15, asymmetry: 0, baseOffset: 0.02 },
  
  // Relational moments
  remembering: { curve: -0.10, asymmetry: 0.03, baseOffset: 0.01 },
  reconnecting: { curve: -0.18, asymmetry: 0, baseOffset: 0.03 },
  insider: { curve: -0.12, asymmetry: 0.05, baseOffset: 0.02 },
  growing: { curve: -0.15, asymmetry: 0, baseOffset: 0.02 },
  
  // Transition states
  processing: { curve: 0.02, asymmetry: 0, baseOffset: -0.01 },
  realizing: { curve: -0.08, asymmetry: 0, baseOffset: 0.02 },
  shifting: { curve: 0, asymmetry: 0.05, baseOffset: 0 },
  settling: { curve: -0.03, asymmetry: 0, baseOffset: 0 },
  
  // Farewell
  farewell: { curve: -0.15, asymmetry: 0, baseOffset: 0.01 },
  
  // Thinking states
  thinking: { curve: 0.05, asymmetry: 0.08, baseOffset: -0.01 },
  contemplative: { curve: 0.03, asymmetry: 0.10, baseOffset: 0 },
  empathetic: { curve: -0.10, asymmetry: 0.05, baseOffset: 0.01 },
  noticing: { curve: 0, asymmetry: 0.06, baseOffset: 0.01 },
  holdingSpace: { curve: 0.02, asymmetry: 0, baseOffset: -0.01 },
};

// ============================================================================
// STATE
// ============================================================================

const state: MouthState = {
  openAmount: 0,
  targetOpen: 0,
  emotion: 'neutral',
  isAnimating: false,
};

let bottomLidElement: SVGPathElement | null = null;
let animationFrame: number | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the speaking mouth system.
 * Finds the bottom lid SVG path element in the DOM.
 */
export function initSpeakingMouth(): void {
  bottomLidElement = document.querySelector('.avatar-lid-overlay .lid-bottom');
  
  if (!bottomLidElement) {
    log.warn('Bottom lid element not found - speaking mouth disabled');
    return;
  }
  
  log.info('Speaking mouth system initialized');
}

/**
 * Cleanup the speaking mouth system.
 */
export function cleanupSpeakingMouth(): void {
  stopAnimation();
  bottomLidElement = null;
  state.openAmount = 0;
  state.targetOpen = 0;
  state.isAnimating = false;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Set the target mouth opening based on voice volume.
 * Called by the voice pulse system in presence.ui.ts
 * 
 * @param volume Voice volume from 0-1
 */
export function setMouthVolume(volume: number): void {
  // Clamp and scale volume to mouth opening range
  const clampedVolume = Math.max(0, Math.min(1, volume));
  
  // Add minimum speaking threshold so there's always visible movement
  const scaledOpen = clampedVolume > 0.05 
    ? MOUTH_CONFIG.MIN_SPEAKING_OPEN + clampedVolume * (MOUTH_CONFIG.MAX_OPEN - MOUTH_CONFIG.MIN_SPEAKING_OPEN)
    : 0;
  
  state.targetOpen = scaledOpen;
  
  // Start animation if not running
  if (!state.isAnimating && state.targetOpen !== state.openAmount) {
    startAnimation();
  }
}

/**
 * Set the current emotion to modify mouth shape.
 * Called when expression changes.
 * 
 * @param emotion Current emotional expression
 */
export function setMouthEmotion(emotion: EmotionalExpression): void {
  state.emotion = emotion;
  
  // If currently open, update the path to reflect new emotion
  if (state.openAmount > 0) {
    updateMouthPath();
  }
}

/**
 * Immediately close the mouth (e.g., when speech ends).
 */
export function closeMouth(): void {
  state.targetOpen = 0;
  
  if (!state.isAnimating) {
    startAnimation();
  }
}

/**
 * Get current mouth state for debugging.
 */
export function getMouthState(): Readonly<MouthState> {
  return { ...state };
}

// ============================================================================
// ANIMATION
// ============================================================================

function startAnimation(): void {
  if (state.isAnimating) return;
  
  state.isAnimating = true;
  animationFrame = requestAnimationFrame(animationLoop);
}

function stopAnimation(): void {
  state.isAnimating = false;
  
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
}

function animationLoop(): void {
  if (!state.isAnimating) return;
  
  // Calculate smoothing factor based on direction
  const delta = state.targetOpen - state.openAmount;
  const smoothing = delta > 0 
    ? MOUTH_CONFIG.SMOOTHING_ATTACK  // Opening - faster
    : MOUTH_CONFIG.SMOOTHING_RELEASE; // Closing - slower
  
  // Apply smoothing
  state.openAmount += delta * smoothing;
  
  // Update the SVG path
  updateMouthPath();
  
  // Check if we've reached target
  if (Math.abs(delta) < MOUTH_CONFIG.THRESHOLD) {
    state.openAmount = state.targetOpen;
    updateMouthPath();
    stopAnimation();
    return;
  }
  
  // Continue animation
  animationFrame = requestAnimationFrame(animationLoop);
}

// ============================================================================
// PATH GENERATION
// ============================================================================

function updateMouthPath(): void {
  if (!bottomLidElement) return;
  
  const path = generateMouthPath(state.openAmount, state.emotion);
  bottomLidElement.setAttribute('d', path);
}

/**
 * Generate SVG path for the bottom lid based on opening and emotion.
 * 
 * Path structure: M 0,Y Q 50,controlY 100,Y L 100,100 L 0,100 Z
 * - M: Move to left edge
 * - Q: Quadratic curve to right edge (control point determines shape)
 * - L: Line to bottom corners and close
 */
function generateMouthPath(openAmount: number, emotion: EmotionalExpression): string {
  const { VIEW_WIDTH, VIEW_HEIGHT, BASELINE_Y, CLOSED_CONTROL_Y, OPEN_CONTROL_Y, CURVE_MULTIPLIER, ASYMMETRY_MULTIPLIER } = PATH_CONFIG;
  
  // Get emotion modifier
  const modifier = MOUTH_EMOTION_MODIFIERS[emotion] ?? MOUTH_EMOTION_MODIFIERS.neutral;
  
  // Apply emotion base offset to opening
  const adjustedOpen = Math.max(0, Math.min(1, openAmount + modifier.baseOffset));
  
  // Calculate control point Y (lower = more open)
  // Closed: 110, Max open: 65
  const controlY = CLOSED_CONTROL_Y - (adjustedOpen * (CLOSED_CONTROL_Y - OPEN_CONTROL_Y));
  
  // Apply emotion curve
  const curveAdjustment = modifier.curve * CURVE_MULTIPLIER;
  const adjustedControlY = controlY + curveAdjustment;
  
  // Apply asymmetry (left side offset)
  const leftY = BASELINE_Y + (modifier.asymmetry * ASYMMETRY_MULTIPLIER);
  const rightY = BASELINE_Y - (modifier.asymmetry * ASYMMETRY_MULTIPLIER);
  
  // Generate path
  // M = Move to, Q = Quadratic curve, L = Line to, Z = Close path
  return `M 0,${leftY} Q ${VIEW_WIDTH / 2},${adjustedControlY} ${VIEW_WIDTH},${rightY} L ${VIEW_WIDTH},${VIEW_HEIGHT} L 0,${VIEW_HEIGHT} Z`;
}

// ============================================================================
// UTILITY EXPORTS FOR TESTING
// ============================================================================

export const _testing = {
  generateMouthPath,
  MOUTH_EMOTION_MODIFIERS,
  MOUTH_CONFIG,
  PATH_CONFIG,
};
