/**
 * Voice Typography System
 *
 * "Typography should feel like the voice speaking it."
 *
 * This system dynamically adjusts typography based on:
 * - Speaking state (agent speaking = larger, more prominent)
 * - Emotional intensity (excitement = bolder, grief = lighter)
 * - Conversation pace (fast = compact, slow = spacious)
 * - Content importance (key insights = emphasized)
 *
 * The magic: Text that breathes with the conversation,
 * making reading feel like listening.
 */

import { DURATION, EASING } from '../config/animation-constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Speaking states that affect typography
 */
export type SpeakingState =
  | 'silent'            // No one speaking - neutral typography
  | 'agent-speaking'    // Agent is speaking - larger, more prominent
  | 'user-speaking'     // User is speaking - listening mode, softer
  | 'thinking'          // Agent is processing - subtle animation
  | 'transitioning';    // Between states

/**
 * Emotional intensity levels
 */
export type IntensityLevel =
  | 'whisper'           // Very soft, intimate
  | 'soft'              // Gentle, calm
  | 'normal'            // Standard
  | 'emphasized'        // Important
  | 'strong'            // Emphatic
  | 'exclaimed';        // Maximum emphasis

/**
 * Typography role in the interface
 */
export type TypographyRole =
  | 'transcript'        // Live transcription
  | 'message'           // Chat messages
  | 'insight'           // Key insights/realizations
  | 'label'             // UI labels
  | 'heading'           // Section headings
  | 'caption'           // Supporting text
  | 'quote';            // Quoted content

/**
 * Typography configuration
 */
export interface TypographyState {
  speakingState: SpeakingState;
  intensity: IntensityLevel;
  pace: 'slow' | 'normal' | 'fast';
  isKeyMoment: boolean;
}

/**
 * Computed typography values
 */
export interface TypographyValues {
  /** Font size multiplier (1 = base) */
  sizeScale: number;
  /** Font weight */
  weight: number;
  /** Letter spacing in em */
  letterSpacing: number;
  /** Line height multiplier */
  lineHeight: number;
  /** Opacity */
  opacity: number;
  /** Transition duration in ms */
  transitionDuration: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base type scale (based on perfect fourth: 1.333)
 */
const TYPE_SCALE = {
  '-2': 0.563,    // 9px at 16px base
  '-1': 0.75,     // 12px
  '0': 1,         // 16px - base
  '1': 1.333,     // 21px
  '2': 1.777,     // 28px
  '3': 2.369,     // 38px
  '4': 3.157,     // 50px
} as const;

/**
 * Weight scale
 */
const WEIGHT_SCALE = {
  thin: 100,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
} as const;

/**
 * Speaking state adjustments
 */
const SPEAKING_ADJUSTMENTS: Record<SpeakingState, Partial<TypographyValues>> = {
  silent: {
    sizeScale: 1,
    weight: 400,
    opacity: 1,
  },
  'agent-speaking': {
    sizeScale: 1.05,      // 5% larger when agent speaks
    weight: 500,          // Slightly bolder
    lineHeight: 1.5,      // More breathing room
    opacity: 1,
  },
  'user-speaking': {
    sizeScale: 0.95,      // Slightly smaller (listening mode)
    weight: 400,
    opacity: 0.85,        // Softer presence
  },
  thinking: {
    sizeScale: 1,
    weight: 400,
    opacity: 0.7,         // Dimmed during processing
  },
  transitioning: {
    sizeScale: 1,
    weight: 400,
    opacity: 0.9,
  },
};

/**
 * Intensity adjustments
 */
const INTENSITY_ADJUSTMENTS: Record<IntensityLevel, Partial<TypographyValues>> = {
  whisper: {
    sizeScale: 0.9,
    weight: 300,
    letterSpacing: 0.02,
    opacity: 0.7,
  },
  soft: {
    sizeScale: 0.95,
    weight: 400,
    letterSpacing: 0.01,
    opacity: 0.85,
  },
  normal: {
    sizeScale: 1,
    weight: 400,
    letterSpacing: 0,
    opacity: 1,
  },
  emphasized: {
    sizeScale: 1.05,
    weight: 500,
    letterSpacing: 0,
    opacity: 1,
  },
  strong: {
    sizeScale: 1.1,
    weight: 600,
    letterSpacing: -0.01,
    opacity: 1,
  },
  exclaimed: {
    sizeScale: 1.15,
    weight: 700,
    letterSpacing: -0.02,
    opacity: 1,
  },
};

/**
 * Role-based base styles
 */
const ROLE_BASE_STYLES: Record<TypographyRole, Partial<TypographyValues>> = {
  transcript: {
    sizeScale: 1,
    weight: 400,
    lineHeight: 1.6,
    letterSpacing: 0,
  },
  message: {
    sizeScale: 1,
    weight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  insight: {
    sizeScale: 1.1,
    weight: 500,
    lineHeight: 1.4,
    letterSpacing: -0.01,
  },
  label: {
    sizeScale: 0.875,
    weight: 500,
    lineHeight: 1.2,
    letterSpacing: 0.02,
  },
  heading: {
    sizeScale: 1.5,
    weight: 600,
    lineHeight: 1.2,
    letterSpacing: -0.02,
  },
  caption: {
    sizeScale: 0.75,
    weight: 400,
    lineHeight: 1.4,
    letterSpacing: 0.01,
  },
  quote: {
    sizeScale: 1.1,
    weight: 400,
    lineHeight: 1.6,
    letterSpacing: 0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let currentState: TypographyState = {
  speakingState: 'silent',
  intensity: 'normal',
  pace: 'normal',
  isKeyMoment: false,
};

let animationFrame: number | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate typography values for a role in current state
 */
export function calculateTypography(
  role: TypographyRole,
  state: Partial<TypographyState> = {}
): TypographyValues {
  const mergedState = { ...currentState, ...state };

  // Start with role base
  const base = ROLE_BASE_STYLES[role];

  // Apply speaking state
  const speaking = SPEAKING_ADJUSTMENTS[mergedState.speakingState];

  // Apply intensity
  const intensity = INTENSITY_ADJUSTMENTS[mergedState.intensity];

  // Pace adjustment
  const paceMultiplier = mergedState.pace === 'fast' ? 0.95 : mergedState.pace === 'slow' ? 1.05 : 1;

  // Key moment boost
  const keyMomentMultiplier = mergedState.isKeyMoment ? 1.1 : 1;

  // Combine all adjustments
  const sizeScale = (base.sizeScale ?? 1) *
    (speaking.sizeScale ?? 1) *
    (intensity.sizeScale ?? 1) *
    paceMultiplier *
    keyMomentMultiplier;

  return {
    sizeScale,
    weight: intensity.weight ?? speaking.weight ?? base.weight ?? 400,
    letterSpacing: (base.letterSpacing ?? 0) + (intensity.letterSpacing ?? 0),
    lineHeight: base.lineHeight ?? 1.5,
    opacity: (speaking.opacity ?? 1) * (intensity.opacity ?? 1),
    transitionDuration: mergedState.speakingState === 'transitioning' ? DURATION.FAST : DURATION.NORMAL,
  };
}

/**
 * Get CSS for typography role
 */
export function getTypographyCSS(
  role: TypographyRole,
  baseFontSize: number = 16
): string {
  const values = calculateTypography(role);

  return `
    font-size: ${baseFontSize * values.sizeScale}px;
    font-weight: ${values.weight};
    letter-spacing: ${values.letterSpacing}em;
    line-height: ${values.lineHeight};
    opacity: ${values.opacity};
    transition: all ${values.transitionDuration}ms ${EASING.DECELERATE};
  `.trim();
}

/**
 * Apply typography to an element
 */
export function applyTypography(
  element: HTMLElement,
  role: TypographyRole,
  baseFontSize: number = 16
): void {
  const values = calculateTypography(role);

  element.style.fontSize = `${baseFontSize * values.sizeScale}px`;
  element.style.fontWeight = String(values.weight);
  element.style.letterSpacing = `${values.letterSpacing}em`;
  element.style.lineHeight = String(values.lineHeight);
  element.style.opacity = String(values.opacity);
  element.style.transition = `all ${values.transitionDuration}ms ${EASING.DECELERATE}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update speaking state
 */
export function setSpeakingState(state: SpeakingState): void {
  if (currentState.speakingState === state) return;

  // Transition through transitioning state for smooth animation
  currentState.speakingState = 'transitioning';
  applyToRoot();

  requestAnimationFrame(() => {
    currentState.speakingState = state;
    applyToRoot();
  });
}

/**
 * Update intensity
 */
export function setTypographyIntensity(intensity: IntensityLevel): void {
  currentState.intensity = intensity;
  applyToRoot();
}

/**
 * Update pace
 */
export function setConversationPace(pace: 'slow' | 'normal' | 'fast'): void {
  currentState.pace = pace;
  applyToRoot();
}

/**
 * Mark current moment as key/important
 */
export function setKeyMoment(isKey: boolean): void {
  currentState.isKeyMoment = isKey;
  applyToRoot();
}

/**
 * Get current typography state
 */
export function getTypographyState(): TypographyState {
  return { ...currentState };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Custom Properties
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply typography state to document root
 */
function applyToRoot(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // Calculate values for each role
  const roles: TypographyRole[] = ['transcript', 'message', 'insight', 'label', 'heading', 'caption', 'quote'];

  roles.forEach((role) => {
    const values = calculateTypography(role);

    root.style.setProperty(`--type-${role}-scale`, String(values.sizeScale));
    root.style.setProperty(`--type-${role}-weight`, String(values.weight));
    root.style.setProperty(`--type-${role}-spacing`, `${values.letterSpacing}em`);
    root.style.setProperty(`--type-${role}-height`, String(values.lineHeight));
    root.style.setProperty(`--type-${role}-opacity`, String(values.opacity));
  });

  // Global state indicators
  root.style.setProperty('--type-speaking-state', currentState.speakingState);
  root.style.setProperty('--type-intensity', currentState.intensity);
  root.style.setProperty('--type-pace', currentState.pace);
  root.style.setProperty('--type-key-moment', currentState.isKeyMoment ? '1' : '0');
}

/**
 * Generate CSS for voice typography utility classes
 */
export function generateTypographyCSS(): string {
  return `
/* Voice Typography System */

/* Role-based typography */
.type-transcript {
  font-size: calc(1rem * var(--type-transcript-scale, 1));
  font-weight: var(--type-transcript-weight, 400);
  letter-spacing: var(--type-transcript-spacing, 0);
  line-height: var(--type-transcript-height, 1.6);
  opacity: var(--type-transcript-opacity, 1);
  transition: all var(--duration-normal, 200ms) var(--ease-decelerate);
}

.type-message {
  font-size: calc(1rem * var(--type-message-scale, 1));
  font-weight: var(--type-message-weight, 400);
  letter-spacing: var(--type-message-spacing, 0);
  line-height: var(--type-message-height, 1.5);
  opacity: var(--type-message-opacity, 1);
  transition: all var(--duration-normal, 200ms) var(--ease-decelerate);
}

.type-insight {
  font-size: calc(1rem * var(--type-insight-scale, 1.1));
  font-weight: var(--type-insight-weight, 500);
  letter-spacing: var(--type-insight-spacing, -0.01em);
  line-height: var(--type-insight-height, 1.4);
  opacity: var(--type-insight-opacity, 1);
  transition: all var(--duration-normal, 200ms) var(--ease-decelerate);
}

.type-label {
  font-size: calc(1rem * var(--type-label-scale, 0.875));
  font-weight: var(--type-label-weight, 500);
  letter-spacing: var(--type-label-spacing, 0.02em);
  line-height: var(--type-label-height, 1.2);
  opacity: var(--type-label-opacity, 1);
  text-transform: uppercase;
  transition: all var(--duration-normal, 200ms) var(--ease-decelerate);
}

.type-heading {
  font-size: calc(1rem * var(--type-heading-scale, 1.5));
  font-weight: var(--type-heading-weight, 600);
  letter-spacing: var(--type-heading-spacing, -0.02em);
  line-height: var(--type-heading-height, 1.2);
  opacity: var(--type-heading-opacity, 1);
  transition: all var(--duration-normal, 200ms) var(--ease-decelerate);
}

.type-caption {
  font-size: calc(1rem * var(--type-caption-scale, 0.75));
  font-weight: var(--type-caption-weight, 400);
  letter-spacing: var(--type-caption-spacing, 0.01em);
  line-height: var(--type-caption-height, 1.4);
  opacity: var(--type-caption-opacity, 1);
  transition: all var(--duration-normal, 200ms) var(--ease-decelerate);
}

.type-quote {
  font-size: calc(1rem * var(--type-quote-scale, 1.1));
  font-weight: var(--type-quote-weight, 400);
  letter-spacing: var(--type-quote-spacing, 0);
  line-height: var(--type-quote-height, 1.6);
  opacity: var(--type-quote-opacity, 1);
  font-style: italic;
  transition: all var(--duration-normal, 200ms) var(--ease-decelerate);
}

/* Intensity modifiers */
.type-whisper { --intensity-scale: 0.9; --intensity-weight: 300; }
.type-soft { --intensity-scale: 0.95; --intensity-weight: 400; }
.type-emphasized { --intensity-scale: 1.05; --intensity-weight: 500; }
.type-strong { --intensity-scale: 1.1; --intensity-weight: 600; }
.type-exclaimed { --intensity-scale: 1.15; --intensity-weight: 700; }

/* Key moment highlight */
.type-key-moment {
  --type-scale-boost: 1.1;
  animation: keyMomentPulse 600ms ease-out;
}

@keyframes keyMomentPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}
  `.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize voice typography system
 */
export function initVoiceTypography(): void {
  applyToRoot();
}

/**
 * Destroy voice typography system
 */
export function destroyVoiceTypography(): void {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  currentState = {
    speakingState: 'silent',
    intensity: 'normal',
    pace: 'normal',
    isKeyMoment: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Exports
// ─────────────────────────────────────────────────────────────────────────────

export const typography = {
  calculate: calculateTypography,
  apply: applyTypography,
  getCSS: getTypographyCSS,
  setSpeaking: setSpeakingState,
  setIntensity: setTypographyIntensity,
  setPace: setConversationPace,
  setKeyMoment,
  getState: getTypographyState,
} as const;
