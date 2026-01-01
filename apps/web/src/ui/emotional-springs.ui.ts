/**
 * Emotional Spring Animation System
 *
 * Goes beyond Apple's spring animations with emotional context.
 * UI elements feel heavier when delivering serious content, lighter when playful.
 *
 * @module @ferni/emotional-springs
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('EmotionalSprings');

// ============================================================================
// TYPES
// ============================================================================

export type SpringType = 'snappy' | 'gentle' | 'bouncy' | 'heavy' | 'ethereal' | 'organic';

export interface SpringConfig {
  tension: number;
  friction: number;
  mass: number;
  useCase: string;
  emotionalContext: string;
}

export interface SpringAnimationOptions {
  from: number;
  to: number;
  velocity?: number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

export interface EmotionalMomentumState {
  currentWeight: number;  // 0-1, affects all animations
  emotionalCarryover: SpringType;
  decayRate: number;
}

// ============================================================================
// SPRING CONFIGURATIONS (from physics.json)
// ============================================================================

export const SPRINGS: Record<SpringType, SpringConfig> = {
  snappy: {
    tension: 400,
    friction: 30,
    mass: 1,
    useCase: 'Quick confirmations, toggles, micro-interactions',
    emotionalContext: 'efficient, responsive',
  },
  gentle: {
    tension: 170,
    friction: 26,
    mass: 1,
    useCase: 'Modal appearances, card expansions',
    emotionalContext: 'calm, welcoming',
  },
  bouncy: {
    tension: 300,
    friction: 10,
    mass: 1,
    useCase: 'Celebrations, achievements, delightful moments',
    emotionalContext: 'joyful, playful',
  },
  heavy: {
    tension: 120,
    friction: 40,
    mass: 2,
    useCase: 'Important decisions, serious content, warnings',
    emotionalContext: 'weighty, significant',
  },
  ethereal: {
    tension: 80,
    friction: 20,
    mass: 0.5,
    useCase: 'Ambient elements, background particles, dreamy states',
    emotionalContext: 'floating, dreamlike',
  },
  organic: {
    tension: 200,
    friction: 22,
    mass: 1.2,
    useCase: 'Avatar movements, natural gestures',
    emotionalContext: 'alive, breathing',
  },
};

// ============================================================================
// EMOTIONAL MOMENTUM STATE
// ============================================================================

const emotionalState: EmotionalMomentumState = {
  currentWeight: 0.5,
  emotionalCarryover: 'gentle',
  decayRate: 0.05,
};

/**
 * Set the current emotional context - affects all subsequent animations
 */
export function setEmotionalContext(type: SpringType): void {
  emotionalState.emotionalCarryover = type;

  // Adjust weight based on spring type
  const weightMap: Record<SpringType, number> = {
    snappy: 0.3,
    gentle: 0.5,
    bouncy: 0.4,
    heavy: 0.9,
    ethereal: 0.2,
    organic: 0.6,
  };

  emotionalState.currentWeight = weightMap[type];
  log.debug('Set emotional context', { type, weight: emotionalState.currentWeight });
}

/**
 * Get the current emotional state
 */
export function getEmotionalState(): EmotionalMomentumState {
  return { ...emotionalState };
}

/**
 * Decay emotional weight back to neutral over time
 */
export function decayEmotionalWeight(): void {
  if (emotionalState.currentWeight > 0.5) {
    emotionalState.currentWeight = Math.max(0.5, emotionalState.currentWeight - emotionalState.decayRate);
  } else if (emotionalState.currentWeight < 0.5) {
    emotionalState.currentWeight = Math.min(0.5, emotionalState.currentWeight + emotionalState.decayRate);
  }
}

// ============================================================================
// SPRING PHYSICS ENGINE
// ============================================================================

interface SpringState {
  position: number;
  velocity: number;
}

/**
 * Calculate spring physics step
 * Uses the classic spring equation: F = -kx - cv
 */
function springStep(
  state: SpringState,
  target: number,
  config: SpringConfig,
  dt: number
): SpringState {
  const { tension, friction, mass } = config;

  // Apply emotional weight modifier
  const effectiveMass = mass * (0.5 + emotionalState.currentWeight);

  const displacement = state.position - target;
  const springForce = -tension * displacement;
  const dampingForce = -friction * state.velocity;
  const acceleration = (springForce + dampingForce) / effectiveMass;

  const newVelocity = state.velocity + acceleration * dt;
  const newPosition = state.position + newVelocity * dt;

  return {
    position: newPosition,
    velocity: newVelocity,
  };
}

/**
 * Check if spring has settled (reached equilibrium)
 */
function isSettled(state: SpringState, target: number, threshold = 0.001): boolean {
  return (
    Math.abs(state.position - target) < threshold &&
    Math.abs(state.velocity) < threshold
  );
}

// ============================================================================
// ANIMATION API
// ============================================================================

export interface SpringAnimation {
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Create and run a spring animation
 */
export function animateSpring(
  type: SpringType,
  options: SpringAnimationOptions
): SpringAnimation {
  const config = SPRINGS[type];
  const { from, to, velocity = 0, onUpdate, onComplete } = options;

  let state: SpringState = { position: from, velocity };
  let running = true;
  let rafId: number | null = null;
  let lastTime = performance.now();

  const tick = (currentTime: number) => {
    if (!running) return;

    const dt = Math.min((currentTime - lastTime) / 1000, 0.064); // Cap at ~16fps minimum
    lastTime = currentTime;

    state = springStep(state, to, config, dt);
    onUpdate(state.position);

    if (isSettled(state, to)) {
      onUpdate(to); // Snap to final value
      running = false;
      onComplete?.();
      log.debug('Spring animation complete', { type, from, to });
    } else {
      rafId = requestAnimationFrame(tick);
    }
  };

  rafId = requestAnimationFrame(tick);
  log.debug('Spring animation started', { type, from, to, config });

  return {
    stop: () => {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    },
    isRunning: () => running,
  };
}

/**
 * Animate multiple properties with spring physics
 */
export function animateSpringMultiple(
  type: SpringType,
  properties: Array<{
    from: number;
    to: number;
    onUpdate: (value: number) => void;
  }>,
  onComplete?: () => void
): SpringAnimation {
  const config = SPRINGS[type];
  const states: SpringState[] = properties.map(p => ({ position: p.from, velocity: 0 }));

  let running = true;
  let rafId: number | null = null;
  let lastTime = performance.now();

  const tick = (currentTime: number) => {
    if (!running) return;

    const dt = Math.min((currentTime - lastTime) / 1000, 0.064);
    lastTime = currentTime;

    let allSettled = true;

    for (let i = 0; i < properties.length; i++) {
      const state = states[i];
      const prop = properties[i];
      if (!state || !prop) continue;
      
      states[i] = springStep(state, prop.to, config, dt);
      const newState = states[i];
      if (newState) {
        prop.onUpdate(newState.position);
        if (!isSettled(newState, prop.to)) {
          allSettled = false;
        }
      }
    }

    if (allSettled) {
      // Snap all to final values
      properties.forEach((p) => {
        p.onUpdate(p.to);
      });
      running = false;
      onComplete?.();
    } else {
      rafId = requestAnimationFrame(tick);
    }
  };

  rafId = requestAnimationFrame(tick);

  return {
    stop: () => {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    },
    isRunning: () => running,
  };
}

// ============================================================================
// CSS SPRING GENERATION (for CSS animations)
// ============================================================================

/**
 * Generate CSS cubic-bezier approximation of spring
 * Note: CSS can't do true springs, but we can approximate
 */
export function springToCubicBezier(type: SpringType): string {
  // Pre-calculated bezier curves that approximate each spring type
  const beziers: Record<SpringType, string> = {
    snappy: 'cubic-bezier(0.2, 1.2, 0.4, 1)',
    gentle: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    bouncy: 'cubic-bezier(0.5, 1.8, 0.5, 0.8)',
    heavy: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ethereal: 'cubic-bezier(0.1, 0.5, 0.3, 1)',
    organic: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  };

  return beziers[type];
}

/**
 * Get recommended duration for a spring type (ms)
 */
export function getSpringDuration(type: SpringType): number {
  const durations: Record<SpringType, number> = {
    snappy: 200,
    gentle: 400,
    bouncy: 600,
    heavy: 800,
    ethereal: 1000,
    organic: 500,
  };

  return durations[type];
}

/**
 * Generate CSS transition string for spring animation
 */
export function springTransition(type: SpringType, property = 'all'): string {
  return `${property} ${getSpringDuration(type)}ms ${springToCubicBezier(type)}`;
}

// ============================================================================
// ELEMENT ANIMATION HELPERS
// ============================================================================

/**
 * Apply spring animation to an element's transform
 */
export function springTransform(
  element: HTMLElement,
  type: SpringType,
  transform: {
    x?: { from: number; to: number };
    y?: { from: number; to: number };
    scale?: { from: number; to: number };
    rotate?: { from: number; to: number };
    opacity?: { from: number; to: number };
  },
  onComplete?: () => void
): SpringAnimation {
  const properties: Array<{
    key: string;
    from: number;
    to: number;
    current: number;
  }> = [];

  if (transform.x) properties.push({ key: 'x', ...transform.x, current: transform.x.from });
  if (transform.y) properties.push({ key: 'y', ...transform.y, current: transform.y.from });
  if (transform.scale) properties.push({ key: 'scale', ...transform.scale, current: transform.scale.from });
  if (transform.rotate) properties.push({ key: 'rotate', ...transform.rotate, current: transform.rotate.from });
  if (transform.opacity) properties.push({ key: 'opacity', ...transform.opacity, current: transform.opacity.from });

  const updateElement = () => {
    const transforms: string[] = [];
    let opacity = 1;

    for (const prop of properties) {
      switch (prop.key) {
        case 'x':
          transforms.push(`translateX(${prop.current}px)`);
          break;
        case 'y':
          transforms.push(`translateY(${prop.current}px)`);
          break;
        case 'scale':
          transforms.push(`scale(${prop.current})`);
          break;
        case 'rotate':
          transforms.push(`rotate(${prop.current}deg)`);
          break;
        case 'opacity':
          opacity = prop.current;
          break;
      }
    }

    if (transforms.length > 0) {
      element.style.transform = transforms.join(' ');
    }
    element.style.opacity = String(opacity);
  };

  return animateSpringMultiple(
    type,
    properties.map(p => ({
      from: p.from,
      to: p.to,
      onUpdate: (value) => {
        p.current = value;
        updateElement();
      },
    })),
    onComplete
  );
}

/**
 * Entrance animation with emotional spring
 */
export function springEnter(
  element: HTMLElement,
  type: SpringType = 'gentle',
  direction: 'up' | 'down' | 'left' | 'right' | 'scale' = 'up'
): SpringAnimation {
  const distance = 20;

  const transforms: Parameters<typeof springTransform>[2] = {
    opacity: { from: 0, to: 1 },
  };

  switch (direction) {
    case 'up':
      transforms.y = { from: distance, to: 0 };
      break;
    case 'down':
      transforms.y = { from: -distance, to: 0 };
      break;
    case 'left':
      transforms.x = { from: distance, to: 0 };
      break;
    case 'right':
      transforms.x = { from: -distance, to: 0 };
      break;
    case 'scale':
      transforms.scale = { from: 0.9, to: 1 };
      break;
  }

  return springTransform(element, type, transforms);
}

/**
 * Exit animation with emotional spring
 */
export function springExit(
  element: HTMLElement,
  type: SpringType = 'snappy',
  direction: 'up' | 'down' | 'left' | 'right' | 'scale' = 'up',
  onComplete?: () => void
): SpringAnimation {
  const distance = 20;

  const transforms: Parameters<typeof springTransform>[2] = {
    opacity: { from: 1, to: 0 },
  };

  switch (direction) {
    case 'up':
      transforms.y = { from: 0, to: -distance };
      break;
    case 'down':
      transforms.y = { from: 0, to: distance };
      break;
    case 'left':
      transforms.x = { from: 0, to: -distance };
      break;
    case 'right':
      transforms.x = { from: 0, to: distance };
      break;
    case 'scale':
      transforms.scale = { from: 1, to: 0.9 };
      break;
  }

  return springTransform(element, type, transforms, onComplete);
}

/**
 * Celebration bounce animation
 */
export function springCelebrate(element: HTMLElement): SpringAnimation {
  setEmotionalContext('bouncy');

  return springTransform(element, 'bouncy', {
    scale: { from: 1, to: 1.15 },
  }, () => {
    // Bounce back
    springTransform(element, 'bouncy', {
      scale: { from: 1.15, to: 1 },
    });
  });
}

/**
 * Heavy/serious emphasis animation
 */
export function springEmphasize(element: HTMLElement): SpringAnimation {
  setEmotionalContext('heavy');

  return springTransform(element, 'heavy', {
    scale: { from: 1, to: 1.02 },
    y: { from: 0, to: -2 },
  }, () => {
    springTransform(element, 'heavy', {
      scale: { from: 1.02, to: 1 },
      y: { from: -2, to: 0 },
    });
  });
}

/**
 * Ethereal floating animation (continuous)
 */
export function springFloat(
  element: HTMLElement,
  amplitude = 5
): { stop: () => void } {
  setEmotionalContext('ethereal');

  let running = true;
  let currentAnimation: SpringAnimation | null = null;

  const floatUp = () => {
    if (!running) return;

    currentAnimation = springTransform(element, 'ethereal', {
      y: { from: 0, to: -amplitude },
    }, floatDown);
  };

  const floatDown = () => {
    if (!running) return;

    currentAnimation = springTransform(element, 'ethereal', {
      y: { from: -amplitude, to: 0 },
    }, floatUp);
  };

  floatUp();

  return {
    stop: () => {
      running = false;
      currentAnimation?.stop();
    },
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

export function initEmotionalSprings(): void {
  if (initialized) return;
  initialized = true;

  // Start emotional decay interval
  setInterval(decayEmotionalWeight, 5000);

  log.info('Emotional springs initialized');
}

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  initEmotionalSprings();
}
