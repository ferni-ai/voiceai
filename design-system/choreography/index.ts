/**
 * Ferni Micro-Interaction Choreography
 * Frame-by-frame animation specifications
 * 
 * @module @design-system/choreography
 */

export * from './button-interactions.js';
export * from './card-interactions.js';
export * from './modal-transitions.js';
export * from './avatar-animations.js';
export * from './connection-states.js';
export * from './celebration-moments.js';
export * from './error-recovery.js';
export * from './toast-notifications.js';
export * from './loading-states.js';
export * from './ai-landing-interactions.js';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ChoreographyPhase {
  name: string;
  start: number;  // ms
  end: number;    // ms
  properties: Record<string, [string | number, string | number]>;
  easing: string;
}

export interface Choreography {
  name: string;
  description: string;
  totalDuration: number;
  phases: ChoreographyPhase[];
  reducedMotion: {
    totalDuration: number;
    properties: Record<string, [string | number, string | number]>;
  };
}

// ============================================================================
// ANIMATION UTILITIES
// ============================================================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Execute a choreography on an element
 */
export async function animate(
  element: HTMLElement,
  choreography: Choreography
): Promise<void> {
  if (prefersReducedMotion()) {
    return animateReduced(element, choreography);
  }
  
  const { phases, totalDuration } = choreography;
  
  for (const phase of phases) {
    const duration = phase.end - phase.start;
    const delay = phase.start;
    
    const keyframes: Keyframe[] = [
      Object.fromEntries(
        Object.entries(phase.properties).map(([prop, [start]]) => [prop, start])
      ),
      Object.fromEntries(
        Object.entries(phase.properties).map(([prop, [, end]]) => [prop, end])
      ),
    ];
    
    element.animate(keyframes, {
      duration,
      delay,
      easing: phase.easing,
      fill: 'forwards',
    });
  }
  
  return new Promise(resolve => setTimeout(resolve, totalDuration));
}

/**
 * Execute reduced motion version
 */
async function animateReduced(
  element: HTMLElement,
  choreography: Choreography
): Promise<void> {
  const { reducedMotion } = choreography;
  
  const keyframes: Keyframe[] = [
    Object.fromEntries(
      Object.entries(reducedMotion.properties).map(([prop, [start]]) => [prop, start])
    ),
    Object.fromEntries(
      Object.entries(reducedMotion.properties).map(([prop, [, end]]) => [prop, end])
    ),
  ];
  
  element.animate(keyframes, {
    duration: reducedMotion.totalDuration,
    easing: 'ease-out',
    fill: 'forwards',
  });
  
  return new Promise(resolve => setTimeout(resolve, reducedMotion.totalDuration));
}

/**
 * Chain multiple choreographies
 */
export async function sequence(
  element: HTMLElement,
  choreographies: Choreography[]
): Promise<void> {
  for (const choreography of choreographies) {
    await animate(element, choreography);
  }
}

/**
 * Run choreographies in parallel
 */
export async function parallel(
  animations: Array<{ element: HTMLElement; choreography: Choreography }>
): Promise<void> {
  await Promise.all(
    animations.map(({ element, choreography }) => animate(element, choreography))
  );
}

// ============================================================================
// EASING CONSTANTS
// ============================================================================

export const EASING = {
  // Standard
  STANDARD: 'cubic-bezier(0.4, 0, 0.2, 1)',
  DECELERATE: 'cubic-bezier(0, 0, 0.2, 1)',
  ACCELERATE: 'cubic-bezier(0.4, 0, 1, 1)',
  
  // Bouncy
  SPRING: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  SPRING_GENTLE: 'cubic-bezier(0.5, 1.25, 0.5, 1)',
  ELASTIC: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
  
  // Pixar-inspired
  ANTICIPATE: 'cubic-bezier(0.38, -0.4, 0.88, 0.65)',
  OVERSHOOT: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  
  // Organic
  GENTLE: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  ORGANIC: 'cubic-bezier(0.4, 0.2, 0.2, 1.1)',
  SMOOTH: 'cubic-bezier(0.45, 0, 0.55, 1)',
  
  // Dramatic
  EXPO_OUT: 'cubic-bezier(0.16, 1, 0.3, 1)',
  EXPO_IN_OUT: 'cubic-bezier(0.87, 0, 0.13, 1)',
} as const;

// ============================================================================
// DURATION CONSTANTS
// ============================================================================

export const DURATION = {
  MICRO: 50,
  FAST: 100,
  NORMAL: 200,
  SLOW: 300,
  MODERATE: 400,
  DELIBERATE: 500,
  DRAMATIC: 600,
  CELEBRATION: 800,
  CINEMATIC: 1000,
} as const;

