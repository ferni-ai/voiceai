/**
 * Overlapping Action Engine
 *
 * "Nothing in nature moves all at once. A character's arm follows their body,
 * their fingers follow their arm, their hair follows their head."
 * - Frank Thomas & Ollie Johnston, Disney's Nine Old Men
 *
 * This system automatically staggers child element animations based on their
 * position in the DOM hierarchy. When a container animates, its children
 * cascade with calculated delays, creating organic, living motion.
 *
 * The magic: A simple "show" animation becomes a wave of appearance,
 * each element acknowledging the one before it.
 */

import { DURATION } from '../config/animation-constants.js';
import { calculateSpring, type SpringConfig, type Mass, type Material } from './physics.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Direction of the stagger cascade
 */
export type StaggerDirection =
  | 'forward'      // First to last (natural reading order)
  | 'reverse'      // Last to first (dramatic reveal)
  | 'center-out'   // From center outward (explosion)
  | 'edges-in'     // From edges to center (convergence)
  | 'random';      // Random order (organic chaos)

/**
 * Stagger pattern determines the rhythm of delays
 */
export type StaggerPattern =
  | 'linear'       // Equal delays between each element
  | 'ease-in'      // Accelerating delays (starts slow)
  | 'ease-out'     // Decelerating delays (ends slow)
  | 'ease-in-out'  // Slow start and end
  | 'spring'       // Physics-based variable delays
  | 'wave';        // Sinusoidal pattern

/**
 * Configuration for overlapping action
 */
export interface OverlapConfig {
  /** Base delay between elements in ms */
  baseDelay: number;
  /** Direction of the stagger */
  direction: StaggerDirection;
  /** Pattern of delay distribution */
  pattern: StaggerPattern;
  /** Total duration budget (delays will fit within this) */
  totalDuration?: number;
  /** Selector for child elements (default: direct children) */
  childSelector?: string;
  /** Whether to include depth-based modifications */
  useDepth?: boolean;
  /** Maximum depth to traverse */
  maxDepth?: number;
}

/**
 * Result of stagger calculation for an element
 */
export interface StaggerResult {
  element: HTMLElement;
  index: number;
  delay: number;
  depth: number;
  /** CSS custom properties to apply */
  cssVars: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: OverlapConfig = {
  baseDelay: 40,
  direction: 'forward',
  pattern: 'ease-out',
  useDepth: true,
  maxDepth: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pattern functions calculate delay multipliers based on position.
 * Returns a value typically between 0 and 1.
 */
const PATTERN_FUNCTIONS: Record<StaggerPattern, (t: number, count: number) => number> = {
  linear: (t) => t,

  'ease-in': (t) => t * t,

  'ease-out': (t) => 1 - Math.pow(1 - t, 2),

  'ease-in-out': (t) => {
    return t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;
  },

  spring: (t, count) => {
    // Spring pattern creates a bounce effect in timing
    const frequency = 2 + count * 0.1;
    const decay = 0.3;
    return t + Math.sin(t * Math.PI * frequency) * decay * (1 - t);
  },

  wave: (t, count) => {
    // Sinusoidal wave pattern
    const amplitude = 0.2;
    return t + Math.sin(t * Math.PI * 2) * amplitude;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Direction Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reorder indices based on direction
 */
function applyDirection(
  indices: number[],
  direction: StaggerDirection
): number[] {
  const count = indices.length;

  switch (direction) {
    case 'forward':
      return indices;

    case 'reverse':
      return indices.slice().reverse();

    case 'center-out': {
      const result: number[] = [];
      const mid = Math.floor(count / 2);
      for (let i = 0; i <= mid; i++) {
        if (mid + i < count) result.push(mid + i);
        if (mid - i >= 0 && mid - i !== mid + i) result.push(mid - i);
      }
      return result;
    }

    case 'edges-in': {
      const result: number[] = [];
      for (let i = 0; i < Math.ceil(count / 2); i++) {
        result.push(i);
        if (count - 1 - i !== i) result.push(count - 1 - i);
      }
      return result;
    }

    case 'random': {
      const shuffled = indices.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i]!;
        shuffled[i] = shuffled[j]!;
        shuffled[j] = temp;
      }
      return shuffled;
    }

    default:
      return indices;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Calculation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the depth of an element in the DOM tree.
 * Depth affects delay - deeper elements take slightly longer.
 */
function calculateDepth(element: HTMLElement, root: HTMLElement): number {
  let depth = 0;
  let current: HTMLElement | null = element;

  while (current && current !== root) {
    depth++;
    current = current.parentElement;
  }

  return depth;
}

/**
 * Calculate stagger delays for a set of elements.
 * This is the heart of the Overlapping Action system.
 */
export function calculateStagger(
  container: HTMLElement,
  config: Partial<OverlapConfig> = {}
): StaggerResult[] {
  const cfg: OverlapConfig = { ...DEFAULT_CONFIG, ...config };

  // Get child elements
  const children = cfg.childSelector
    ? Array.from(container.querySelectorAll<HTMLElement>(cfg.childSelector))
    : Array.from(container.children) as HTMLElement[];

  if (children.length === 0) return [];

  const count = children.length;
  const patternFn = PATTERN_FUNCTIONS[cfg.pattern];

  // Create index mapping based on direction
  const indices = Array.from({ length: count }, (_, i) => i);
  const orderedIndices = applyDirection(indices, cfg.direction);

  // Create a map from original index to order position
  const orderMap = new Map<number, number>();
  orderedIndices.forEach((originalIndex, orderPosition) => {
    orderMap.set(originalIndex, orderPosition);
  });

  // Calculate delays
  const results: StaggerResult[] = [];

  children.forEach((element, originalIndex) => {
    const orderPosition = orderMap.get(originalIndex) ?? originalIndex;
    const t = count > 1 ? orderPosition / (count - 1) : 0;

    // Apply pattern function
    const patternMultiplier = patternFn(t, count);

    // Calculate depth modifier
    const depth = cfg.useDepth ? calculateDepth(element, container) : 0;
    const depthMultiplier = 1 + (depth * 0.1);

    // Calculate final delay
    let delay = cfg.baseDelay * patternMultiplier * count * depthMultiplier;

    // Clamp to total duration if specified
    if (cfg.totalDuration) {
      const maxDelay = cfg.totalDuration * 0.7; // Leave 30% for animation
      delay = Math.min(delay, maxDelay * t);
    }

    // Round to avoid sub-pixel timing issues
    delay = Math.round(delay);

    results.push({
      element,
      index: originalIndex,
      delay,
      depth,
      cssVars: {
        '--stagger-index': String(originalIndex),
        '--stagger-delay': `${delay}ms`,
        '--stagger-depth': String(depth),
        '--stagger-t': t.toFixed(3),
      },
    });
  });

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply stagger CSS variables to elements.
 * Elements can then use these variables in their CSS animations.
 */
export function applyStagger(
  container: HTMLElement,
  config: Partial<OverlapConfig> = {}
): StaggerResult[] {
  const results = calculateStagger(container, config);

  results.forEach(({ element, cssVars }) => {
    Object.entries(cssVars).forEach(([key, value]) => {
      element.style.setProperty(key, value);
    });
  });

  return results;
}

/**
 * Animate elements with overlapping action.
 * This triggers the actual animation with calculated stagger.
 */
export function animateWithOverlap(
  container: HTMLElement,
  animationClass: string,
  config: Partial<OverlapConfig> = {}
): Promise<void> {
  return new Promise((resolve) => {
    const results = applyStagger(container, config);

    if (results.length === 0) {
      resolve();
      return;
    }

    // Find the longest delay
    const maxDelay = Math.max(...results.map(r => r.delay));
    const animationDuration = DURATION.NORMAL;

    // Add animation class to each element with delay
    results.forEach(({ element, delay }) => {
      setTimeout(() => {
        element.classList.add(animationClass);
      }, delay);
    });

    // Resolve when all animations complete
    setTimeout(() => {
      resolve();
    }, maxDelay + animationDuration);
  });
}

/**
 * Remove stagger animation classes.
 */
export function removeOverlap(
  container: HTMLElement,
  animationClass: string,
  config: Partial<OverlapConfig> = {}
): void {
  const children = config.childSelector
    ? Array.from(container.querySelectorAll<HTMLElement>(config.childSelector))
    : Array.from(container.children) as HTMLElement[];

  children.forEach((element) => {
    element.classList.remove(animationClass);
    // Clean up CSS variables
    element.style.removeProperty('--stagger-index');
    element.style.removeProperty('--stagger-delay');
    element.style.removeProperty('--stagger-depth');
    element.style.removeProperty('--stagger-t');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets for Common Animations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Preset configurations for common stagger patterns.
 */
export const STAGGER_PRESETS = {
  /** Quick, subtle stagger for lists */
  list: {
    baseDelay: 30,
    direction: 'forward' as StaggerDirection,
    pattern: 'ease-out' as StaggerPattern,
  },

  /** Grid reveal from corner */
  grid: {
    baseDelay: 40,
    direction: 'forward' as StaggerDirection,
    pattern: 'ease-in-out' as StaggerPattern,
  },

  /** Dramatic center-outward explosion */
  explosion: {
    baseDelay: 50,
    direction: 'center-out' as StaggerDirection,
    pattern: 'spring' as StaggerPattern,
  },

  /** Convergence from edges */
  convergence: {
    baseDelay: 45,
    direction: 'edges-in' as StaggerDirection,
    pattern: 'ease-in' as StaggerPattern,
  },

  /** Organic, slightly random feel */
  organic: {
    baseDelay: 35,
    direction: 'forward' as StaggerDirection,
    pattern: 'wave' as StaggerPattern,
  },

  /** Fast, snappy stagger */
  snappy: {
    baseDelay: 20,
    direction: 'forward' as StaggerDirection,
    pattern: 'linear' as StaggerPattern,
  },

  /** Slow, deliberate reveal */
  deliberate: {
    baseDelay: 80,
    direction: 'forward' as StaggerDirection,
    pattern: 'ease-in-out' as StaggerPattern,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CSS Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate CSS for staggered animations.
 * Use this to create reusable animation classes.
 */
export function generateStaggerCSS(
  animationName: string,
  keyframes: string
): string {
  return `
@keyframes ${animationName} {
${keyframes}
}

.stagger-${animationName} {
  animation: ${animationName} var(--stagger-duration, ${DURATION.NORMAL}ms) var(--stagger-easing, ease-out);
  animation-delay: var(--stagger-delay, 0ms);
  animation-fill-mode: both;
}
  `.trim();
}

/**
 * Common stagger animation keyframes
 */
export const STAGGER_KEYFRAMES = {
  fadeIn: `
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
  `,

  fadeOut: `
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-10px);
  }
  `,

  scaleIn: `
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
  `,

  slideUp: `
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
  `,

  slideRight: `
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
  `,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Observer for Automatic Staggering
// ─────────────────────────────────────────────────────────────────────────────

let staggerObserver: IntersectionObserver | null = null;

/**
 * Initialize automatic stagger observation.
 * Elements with [data-stagger] will automatically stagger when visible.
 */
export function initStaggerObserver(): void {
  if (staggerObserver) return;

  staggerObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const container = entry.target as HTMLElement;
          const preset = container.dataset.stagger as keyof typeof STAGGER_PRESETS || 'list';
          const animation = container.dataset.staggerAnimation || 'stagger-fadeIn';

          applyStagger(container, STAGGER_PRESETS[preset] || STAGGER_PRESETS.list);

          // Add animation class to children
          const children = Array.from(container.children) as HTMLElement[];
          children.forEach((child) => {
            child.classList.add(animation);
          });

          // Unobserve after triggering
          staggerObserver?.unobserve(container);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '50px',
    }
  );
}

/**
 * Observe a container for automatic staggering.
 */
export function observeStagger(container: HTMLElement): void {
  initStaggerObserver();
  staggerObserver?.observe(container);
}

/**
 * Stop observing a container.
 */
export function unobserveStagger(container: HTMLElement): void {
  staggerObserver?.unobserve(container);
}

/**
 * Destroy the stagger observer.
 */
export function destroyStaggerObserver(): void {
  staggerObserver?.disconnect();
  staggerObserver = null;
}
