/**
 * Design System Integration
 *
 * Unified entry point for Ferni's "Better Than Human" design system.
 * Coordinates typography, color, and visualization systems to create
 * emotionally responsive interfaces.
 *
 * DESIGN PRINCIPLES INTEGRATED:
 * - Edward Tufte: Maximum data-ink ratio, sparklines, small multiples
 * - Giorgia Lupi: Emotional data encoding, living data art
 * - Josef Albers: Color interaction, simultaneous contrast
 * - James Gurney: Atmospheric perspective for temporal depth
 * - Pixar: 12 animation principles for character
 *
 * @module design-system-integration
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('DesignSystem');

// ============================================================================
// TYPES
// ============================================================================

export type MoodState = 'calm' | 'joyful' | 'anxious' | 'tired' | 'focused' | 'reflective' | 'stressed' | 'energized' | 'peaceful';
export type PersonaId = 'ferni' | 'maya' | 'peter' | 'jordan' | 'alex' | 'nayan';

export interface DesignSystemState {
  /** Current mood affecting all systems */
  mood: MoodState;
  /** Active persona */
  persona: PersonaId;
  /** Intensity of effects (0-1) */
  intensity: number;
  /** Whether system is initialized */
  initialized: boolean;
  /** Reduced motion preference */
  prefersReducedMotion: boolean;
}

export interface DesignSystemConfig {
  /** Initial persona */
  persona?: PersonaId;
  /** Initial mood */
  mood?: MoodState;
  /** Effect intensity (0-1) */
  intensity?: number;
  /** Auto-adapt to device capabilities */
  deviceAdaptive?: boolean;
}

// ============================================================================
// STATE
// ============================================================================

const state: DesignSystemState = {
  mood: 'calm',
  persona: 'ferni',
  intensity: 1,
  initialized: false,
  prefersReducedMotion: false,
};

// Track cleanup functions
const cleanupFunctions: Array<() => void> = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the design system with configuration.
 * Call once at app startup.
 */
export async function initDesignSystem(config: DesignSystemConfig = {}): Promise<void> {
  const {
    persona = 'ferni',
    mood = 'calm',
    intensity = 1,
    deviceAdaptive = true,
  } = config;

  // Check reduced motion preference
  if (typeof window !== 'undefined') {
    state.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Adjust intensity for device
  let adjustedIntensity = intensity;
  if (deviceAdaptive) {
    adjustedIntensity = getDeviceAdaptiveIntensity() * intensity;
  }

  // Set initial state
  state.mood = mood;
  state.persona = persona;
  state.intensity = adjustedIntensity;
  state.initialized = true;

  log.info('Design system initialized', {
    persona,
    mood,
    intensity: adjustedIntensity,
    reducedMotion: state.prefersReducedMotion,
  });
}

/**
 * Get device-appropriate intensity based on screen size and capabilities.
 */
function getDeviceAdaptiveIntensity(): number {
  if (typeof window === 'undefined') return 1;

  const width = window.innerWidth;

  // Watch: Minimal effects for readability
  if (width < 300) return 0.3;

  // Phone: Reduced for battery/performance
  if (width < 768) return 0.6;

  // Tablet: Moderate
  if (width < 1024) return 0.8;

  // Desktop/TV: Full effects
  return 1;
}

// ============================================================================
// MOOD MANAGEMENT
// ============================================================================

/**
 * Update the design system mood.
 */
export function setMood(mood: MoodState): void {
  const previousMood = state.mood;
  state.mood = mood;
  log.debug('Mood transition', { from: previousMood, to: mood });
}

/**
 * Get the current mood state.
 */
export function getMood(): MoodState {
  return state.mood;
}

// ============================================================================
// PERSONA MANAGEMENT
// ============================================================================

/**
 * Set the active persona.
 */
export function setPersona(persona: PersonaId): void {
  const previousPersona = state.persona;
  state.persona = persona;
  log.debug('Persona transition', { from: previousPersona, to: persona });
}

/**
 * Get the current persona.
 */
export function getPersona(): PersonaId {
  return state.persona;
}

// ============================================================================
// TYPOGRAPHY HELPERS
// ============================================================================

/**
 * Apply breathing typography to an element.
 * Text subtly expands/contracts with emotional rhythm.
 */
export async function applyBreathingTypography(
  element: HTMLElement,
  options?: {
    mood?: MoodState;
    intensity?: number;
  }
): Promise<() => void> {
  if (state.prefersReducedMotion) {
    return () => {}; // No-op cleanup
  }

  try {
    const { applyBreathingTypography: apply } = await import('./typography/breathing-text.js');
    const cleanup = apply({
      target: element,
      mood: options?.mood || state.mood,
      intensity: options?.intensity ?? state.intensity,
    });

    element.dataset.ferniTypography = 'breathing';
    cleanupFunctions.push(cleanup);
    return cleanup;
  } catch (error) {
    log.warn('Failed to apply breathing typography', { error });
    return () => {};
  }
}

/**
 * Apply mood-responsive typography to an element.
 */
export async function applyMoodTypography(
  element: HTMLElement,
  options?: {
    mood?: MoodState;
  }
): Promise<() => void> {
  try {
    const { applyMoodTypography: apply } = await import('./typography/mood-weight.js');
    const cleanup = apply(
      element,
      options?.mood || state.mood
    );

    element.dataset.ferniTypography = 'mood';
    cleanupFunctions.push(cleanup);
    return cleanup;
  } catch (error) {
    log.warn('Failed to apply mood typography', { error });
    return () => {};
  }
}

/**
 * Apply persona-specific typography.
 */
export async function applyPersonaTypography(
  element: HTMLElement,
  options?: {
    persona?: PersonaId;
  }
): Promise<() => void> {
  try {
    const { applyPersonaTypography: apply } = await import('./typography/persona-voice-type.js');
    const cleanup = apply(
      element,
      options?.persona || state.persona
    );

    element.dataset.ferniTypography = 'persona';
    cleanupFunctions.push(cleanup);
    return cleanup;
  } catch (error) {
    log.warn('Failed to apply persona typography', { error });
    return () => {};
  }
}

// ============================================================================
// COLOR HELPERS
// ============================================================================

/**
 * Apply time fading to an element based on its timestamp.
 * Older items desaturate and fade (Gurney's atmospheric perspective).
 */
export async function applyTimeFading(
  element: HTMLElement,
  timestamp: Date | number | string,
  options?: {
    baseColor?: string;
    applyBlur?: boolean;
  }
): Promise<() => void> {
  try {
    const { applyTimeFading: apply } = await import('./color/time-fading.js');
    const cleanup = apply(element, {
      date: timestamp,
      baseColor: options?.baseColor || '#4a6741',
      applyBlur: options?.applyBlur ?? !state.prefersReducedMotion,
      persona: state.persona,
      intensity: state.intensity,
    });

    cleanupFunctions.push(cleanup);
    return cleanup;
  } catch (error) {
    log.warn('Failed to apply time fading', { error });
    return () => {};
  }
}

/**
 * Get a color adjusted for the current mood and time context.
 */
export async function getContextualColor(
  baseColor: string,
  timestamp?: Date | number | string
): Promise<string> {
  try {
    const { getContextualColor: get } = await import('./color/index.js');
    return get(baseColor, {
      mood: state.mood,
      persona: state.persona,
      timestamp,
      intensity: state.intensity,
    }).color;
  } catch (error) {
    log.warn('Failed to get contextual color', { error });
    return baseColor;
  }
}

/**
 * Get harmonic colors for transitioning between two personas.
 */
export async function getPersonaTransitionColors(
  fromPersona: PersonaId,
  toPersona: PersonaId
): Promise<{
  bridgeColor: string;
  duration: number;
  steps: string[];
}> {
  try {
    const { getPersonaTransition } = await import('./color/persona-harmony.js');
    const transition = getPersonaTransition(fromPersona, toPersona);

    return {
      bridgeColor: transition.bridgeColor,
      duration: transition.duration,
      steps: transition.colorSteps.map((s) => s.color),
    };
  } catch (error) {
    log.warn('Failed to get persona transition colors', { error });
    return { bridgeColor: '#888888', duration: 400, steps: [] };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the current design system state.
 */
export function getDesignSystemState(): Readonly<DesignSystemState> {
  return { ...state };
}

/**
 * Check if design system is initialized.
 */
export function isInitialized(): boolean {
  return state.initialized;
}

/**
 * Set the effect intensity (0-1).
 */
export function setIntensity(intensity: number): void {
  state.intensity = Math.max(0, Math.min(1, intensity));
}

/**
 * Cleanup all applied effects.
 * Call before unmounting or reinitializing.
 */
export function cleanup(): void {
  cleanupFunctions.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      log.warn('Cleanup function failed', { error });
    }
  });
  cleanupFunctions.length = 0;

  // Remove data attributes
  document.querySelectorAll<HTMLElement>('[data-ferni-typography]').forEach((el) => {
    delete el.dataset.ferniTypography;
  });

  document.querySelectorAll<HTMLElement>('[data-time-period]').forEach((el) => {
    delete el.dataset.timePeriod;
  });
}

/**
 * Reset the design system to default state.
 */
export function reset(): void {
  cleanup();
  state.mood = 'calm';
  state.persona = 'ferni';
  state.intensity = 1;
  state.initialized = false;
}
