/**
 * Imperfection Engine
 *
 * "Perfection is cold. Imperfection is human."
 * - Studio Ghibli Animation Philosophy
 *
 * This system adds subtle organic variations to prevent the "uncanny valley"
 * of overly-perfect digital motion:
 * - Timing wobble: Slight variations in animation timing
 * - Path deviation: Subtle curves in linear movements
 * - Amplitude variance: Breathing room in repetitive animations
 * - Phase drift: Synchronized elements that slowly desync
 *
 * The magic: Animations that feel handcrafted, not computed.
 */

import { DURATION, EASING } from '../config/animation-constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Types of imperfection to apply
 */
export type ImperfectionType =
  | 'timing'      // Duration/delay variations
  | 'path'        // Movement path variations
  | 'amplitude'   // Scale/distance variations
  | 'phase'       // Phase shift in cyclic animations
  | 'rotation'    // Slight rotational wobble
  | 'opacity';    // Subtle opacity variations

/**
 * Intensity of imperfection (how noticeable)
 */
export type ImperfectionIntensity =
  | 'subtle'      // Nearly imperceptible (1-3%)
  | 'gentle'      // Noticeable on close inspection (3-8%)
  | 'organic'     // Clearly handcrafted feel (8-15%)
  | 'expressive'; // Bold, artistic variations (15-25%)

/**
 * Configuration for imperfection generation
 */
export interface ImperfectionConfig {
  /** Seed for deterministic randomness */
  seed?: number;
  /** Base intensity */
  intensity: ImperfectionIntensity;
  /** Which types to apply */
  types: ImperfectionType[];
  /** Whether to sync with breath system */
  syncWithBreath?: boolean;
  /** Coherence - how much variations cluster vs scatter */
  coherence?: number;
}

/**
 * Generated imperfection values
 */
export interface ImperfectionValues {
  /** Timing offset in ms */
  timingOffset: number;
  /** Duration multiplier (0.9 = 10% faster, 1.1 = 10% slower) */
  durationMultiplier: number;
  /** X path deviation in % of distance */
  pathDeviationX: number;
  /** Y path deviation in % of distance */
  pathDeviationY: number;
  /** Amplitude multiplier */
  amplitudeMultiplier: number;
  /** Phase offset in radians */
  phaseOffset: number;
  /** Rotation offset in degrees */
  rotationOffset: number;
  /** Opacity offset */
  opacityOffset: number;
  /** Easing variation (cubic bezier control point adjustments) */
  easingVariation: { p1x: number; p1y: number; p2x: number; p2y: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intensity ranges for each imperfection type
 * Values are percentages of the base value
 */
const INTENSITY_RANGES: Record<ImperfectionIntensity, { min: number; max: number }> = {
  subtle: { min: 0.01, max: 0.03 },
  gentle: { min: 0.03, max: 0.08 },
  organic: { min: 0.08, max: 0.15 },
  expressive: { min: 0.15, max: 0.25 },
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ImperfectionConfig = {
  intensity: 'gentle',
  types: ['timing', 'amplitude'],
  syncWithBreath: false,
  coherence: 0.7,
};

// ─────────────────────────────────────────────────────────────────────────────
// Seeded Random Number Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mulberry32 - A simple seeded PRNG
 * Provides deterministic randomness for consistent imperfections
 */
function createSeededRandom(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let result = t;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Get a random number in a range using seeded generator
 */
function randomInRange(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/**
 * Get a random number with normal (gaussian) distribution
 */
function randomGaussian(random: () => number): number {
  // Box-Muller transform
  const u1 = random();
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate imperfection values
 *
 * @param config - Configuration options
 * @param elementId - Optional element identifier for consistent per-element variation
 */
export function generateImperfection(
  config: Partial<ImperfectionConfig> = {},
  elementId?: string
): ImperfectionValues {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Create seeded random generator
  // If elementId is provided, derive seed from it for consistency
  const baseSeed = cfg.seed ?? Date.now();
  const elementSeed = elementId
    ? elementId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    : 0;
  const random = createSeededRandom(baseSeed + elementSeed);

  // Get intensity range
  const range = INTENSITY_RANGES[cfg.intensity];
  const intensity = randomInRange(random, range.min, range.max);

  // Apply coherence - higher coherence means variations cluster together
  const coherenceFactor = cfg.coherence ?? 0.7;
  const baseVariation = randomGaussian(random);

  // Generate each imperfection type
  const values: ImperfectionValues = {
    timingOffset: 0,
    durationMultiplier: 1,
    pathDeviationX: 0,
    pathDeviationY: 0,
    amplitudeMultiplier: 1,
    phaseOffset: 0,
    rotationOffset: 0,
    opacityOffset: 0,
    easingVariation: { p1x: 0, p1y: 0, p2x: 0, p2y: 0 },
  };

  // Timing imperfections
  if (cfg.types.includes('timing')) {
    const timingVariation = baseVariation * coherenceFactor + randomGaussian(random) * (1 - coherenceFactor);
    values.timingOffset = timingVariation * intensity * DURATION.NORMAL * 0.5;
    values.durationMultiplier = 1 + timingVariation * intensity * 0.3;
  }

  // Path imperfections
  if (cfg.types.includes('path')) {
    const pathVariation = baseVariation * coherenceFactor + randomGaussian(random) * (1 - coherenceFactor);
    values.pathDeviationX = pathVariation * intensity * 10; // percentage
    values.pathDeviationY = randomGaussian(random) * intensity * 10;
  }

  // Amplitude imperfections
  if (cfg.types.includes('amplitude')) {
    const ampVariation = baseVariation * coherenceFactor + randomGaussian(random) * (1 - coherenceFactor);
    values.amplitudeMultiplier = 1 + ampVariation * intensity * 0.5;
  }

  // Phase imperfections
  if (cfg.types.includes('phase')) {
    values.phaseOffset = random() * Math.PI * intensity * 0.5;
  }

  // Rotation imperfections
  if (cfg.types.includes('rotation')) {
    values.rotationOffset = randomGaussian(random) * intensity * 5; // degrees
  }

  // Opacity imperfections
  if (cfg.types.includes('opacity')) {
    values.opacityOffset = randomGaussian(random) * intensity * 0.1;
  }

  // Easing variations (subtle control point adjustments)
  if (cfg.types.includes('timing')) {
    const easingIntensity = intensity * 0.1;
    values.easingVariation = {
      p1x: randomGaussian(random) * easingIntensity,
      p1y: randomGaussian(random) * easingIntensity,
      p2x: randomGaussian(random) * easingIntensity,
      p2y: randomGaussian(random) * easingIntensity,
    };
  }

  return values;
}

/**
 * Apply imperfection to a CSS transform
 */
export function applyImperfectionToTransform(
  baseTransform: string,
  values: ImperfectionValues
): string {
  const rotationPart = values.rotationOffset !== 0
    ? `rotate(${values.rotationOffset}deg)`
    : '';

  const scalePart = values.amplitudeMultiplier !== 1
    ? `scale(${values.amplitudeMultiplier})`
    : '';

  const translatePart = (values.pathDeviationX !== 0 || values.pathDeviationY !== 0)
    ? `translate(${values.pathDeviationX}%, ${values.pathDeviationY}%)`
    : '';

  const imperfections = [rotationPart, scalePart, translatePart]
    .filter(Boolean)
    .join(' ');

  return baseTransform
    ? `${baseTransform} ${imperfections}`.trim()
    : imperfections;
}

/**
 * Apply imperfection to animation timing
 */
export function applyImperfectionToTiming(
  baseDuration: number,
  baseDelay: number,
  values: ImperfectionValues
): { duration: number; delay: number } {
  return {
    duration: Math.round(baseDuration * values.durationMultiplier),
    delay: Math.round(baseDelay + values.timingOffset),
  };
}

/**
 * Apply imperfection to easing (cubic bezier)
 */
export function applyImperfectionToEasing(
  baseEasing: string,
  values: ImperfectionValues
): string {
  // Parse cubic-bezier or return base if not parseable
  const match = baseEasing.match(/cubic-bezier\(([^)]+)\)/);
  if (!match) return baseEasing;

  const points = match[1]!.split(',').map(Number);
  if (points.length !== 4 || points.some(isNaN)) return baseEasing;

  const [p1x, p1y, p2x, p2y] = points as [number, number, number, number];
  const v = values.easingVariation;

  // Clamp to valid cubic-bezier range
  const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val));

  return `cubic-bezier(${clamp(p1x + v.p1x, 0, 1)}, ${p1y + v.p1y}, ${clamp(p2x + v.p2x, 0, 1)}, ${p2y + v.p2y})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply imperfection as CSS custom properties
 */
export function applyImperfectionToElement(
  element: HTMLElement,
  config?: Partial<ImperfectionConfig>
): ImperfectionValues {
  const values = generateImperfection(config, element.id || element.dataset.imperfectionId);

  element.style.setProperty('--imperfection-timing-offset', `${values.timingOffset}ms`);
  element.style.setProperty('--imperfection-duration-mult', String(values.durationMultiplier));
  element.style.setProperty('--imperfection-path-x', `${values.pathDeviationX}%`);
  element.style.setProperty('--imperfection-path-y', `${values.pathDeviationY}%`);
  element.style.setProperty('--imperfection-amplitude', String(values.amplitudeMultiplier));
  element.style.setProperty('--imperfection-phase', `${values.phaseOffset}rad`);
  element.style.setProperty('--imperfection-rotation', `${values.rotationOffset}deg`);
  element.style.setProperty('--imperfection-opacity', String(1 + values.opacityOffset));

  return values;
}

/**
 * Generate CSS for imperfection utility classes
 */
export function generateImperfectionCSS(): string {
  return `
/* Imperfection Engine */

/* Base imperfect modifier - applies all imperfections */
.imperfect {
  --imperfection-timing-offset: 0ms;
  --imperfection-duration-mult: 1;
  --imperfection-path-x: 0%;
  --imperfection-path-y: 0%;
  --imperfection-amplitude: 1;
  --imperfection-phase: 0rad;
  --imperfection-rotation: 0deg;
  --imperfection-opacity: 1;

  transform:
    rotate(var(--imperfection-rotation))
    scale(var(--imperfection-amplitude))
    translate(var(--imperfection-path-x), var(--imperfection-path-y));
  opacity: var(--imperfection-opacity);
  transition-delay: var(--imperfection-timing-offset);
}

/* Intensity presets */
.imperfect-subtle {
  --imperfection-timing-offset: ${Math.random() * 15}ms;
  --imperfection-amplitude: ${0.99 + Math.random() * 0.02};
  --imperfection-rotation: ${(Math.random() - 0.5) * 0.5}deg;
}

.imperfect-gentle {
  --imperfection-timing-offset: ${Math.random() * 40}ms;
  --imperfection-amplitude: ${0.97 + Math.random() * 0.06};
  --imperfection-rotation: ${(Math.random() - 0.5) * 1.5}deg;
}

.imperfect-organic {
  --imperfection-timing-offset: ${Math.random() * 80}ms;
  --imperfection-amplitude: ${0.93 + Math.random() * 0.14};
  --imperfection-rotation: ${(Math.random() - 0.5) * 3}deg;
  --imperfection-path-x: ${(Math.random() - 0.5) * 2}%;
  --imperfection-path-y: ${(Math.random() - 0.5) * 2}%;
}

.imperfect-expressive {
  --imperfection-timing-offset: ${Math.random() * 120}ms;
  --imperfection-amplitude: ${0.88 + Math.random() * 0.24};
  --imperfection-rotation: ${(Math.random() - 0.5) * 5}deg;
  --imperfection-path-x: ${(Math.random() - 0.5) * 4}%;
  --imperfection-path-y: ${(Math.random() - 0.5) * 4}%;
}

/* Wobble animation - organic idle */
@keyframes imperfect-wobble {
  0%, 100% {
    transform: rotate(calc(var(--imperfection-rotation) * 0.5));
  }
  25% {
    transform: rotate(calc(var(--imperfection-rotation) * -0.3)) scale(calc(1 + var(--imperfection-amplitude) * 0.01));
  }
  50% {
    transform: rotate(calc(var(--imperfection-rotation) * 0.2));
  }
  75% {
    transform: rotate(calc(var(--imperfection-rotation) * -0.4)) scale(calc(1 - var(--imperfection-amplitude) * 0.01));
  }
}

.imperfect-wobble {
  animation: imperfect-wobble 4s ease-in-out infinite;
  animation-delay: var(--imperfection-timing-offset);
}

/* Drift animation - slow organic movement */
@keyframes imperfect-drift {
  0%, 100% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(var(--imperfection-path-x), calc(var(--imperfection-path-y) * -1));
  }
  50% {
    transform: translate(calc(var(--imperfection-path-x) * -1), var(--imperfection-path-y));
  }
  75% {
    transform: translate(var(--imperfection-path-y), var(--imperfection-path-x));
  }
}

.imperfect-drift {
  animation: imperfect-drift 8s ease-in-out infinite;
  animation-delay: calc(var(--imperfection-timing-offset) + var(--imperfection-phase, 0) * 1000ms);
}

/* Breathe animation - subtle scale pulse */
@keyframes imperfect-breathe {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(var(--imperfection-amplitude));
  }
}

.imperfect-breathe {
  animation: imperfect-breathe 5s ease-in-out infinite;
  animation-delay: var(--imperfection-timing-offset);
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .imperfect,
  .imperfect-wobble,
  .imperfect-drift,
  .imperfect-breathe {
    animation: none;
    transform: none;
    transition-delay: 0ms;
  }
}
  `.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Processing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply imperfection to multiple elements with coherent variation
 */
export function applyImperfectionToGroup(
  elements: HTMLElement[],
  config?: Partial<ImperfectionConfig>
): void {
  const baseSeed = Date.now();

  elements.forEach((element, index) => {
    const elementConfig = {
      ...config,
      seed: baseSeed + index * 1000,
    };
    applyImperfectionToElement(element, elementConfig);
  });
}

/**
 * Initialize imperfection for elements with [data-imperfect] attribute
 */
export function initImperfectionObserver(): void {
  if (typeof document === 'undefined') return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.dataset.imperfect !== undefined) {
            const intensity = (node.dataset.imperfect || 'gentle') as ImperfectionIntensity;
            applyImperfectionToElement(node, { intensity });
          }

          // Also check children
          const imperfectChildren = node.querySelectorAll<HTMLElement>('[data-imperfect]');
          imperfectChildren.forEach((child) => {
            const intensity = (child.dataset.imperfect || 'gentle') as ImperfectionIntensity;
            applyImperfectionToElement(child, { intensity });
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Process existing elements
  const existingElements = document.querySelectorAll<HTMLElement>('[data-imperfect]');
  existingElements.forEach((element) => {
    const intensity = (element.dataset.imperfect || 'gentle') as ImperfectionIntensity;
    applyImperfectionToElement(element, { intensity });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quick imperfection API
 */
export const imperfect = {
  /** Generate imperfection values */
  generate: generateImperfection,

  /** Apply to element */
  apply: applyImperfectionToElement,

  /** Apply to group */
  applyGroup: applyImperfectionToGroup,

  /** Modify transform string */
  transform: applyImperfectionToTransform,

  /** Modify timing */
  timing: applyImperfectionToTiming,

  /** Modify easing */
  easing: applyImperfectionToEasing,

  /** Initialize auto-detection */
  init: initImperfectionObserver,

  /** Intensity presets */
  presets: {
    subtle: { intensity: 'subtle' as ImperfectionIntensity, types: ['timing', 'amplitude'] as ImperfectionType[] },
    gentle: { intensity: 'gentle' as ImperfectionIntensity, types: ['timing', 'amplitude', 'rotation'] as ImperfectionType[] },
    organic: { intensity: 'organic' as ImperfectionIntensity, types: ['timing', 'path', 'amplitude', 'rotation'] as ImperfectionType[] },
    expressive: { intensity: 'expressive' as ImperfectionIntensity, types: ['timing', 'path', 'amplitude', 'rotation', 'phase'] as ImperfectionType[] },
  },
} as const;
