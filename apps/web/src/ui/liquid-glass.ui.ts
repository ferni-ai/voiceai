/**
 * Liquid Glass UI Effects
 * 
 * iOS 26 / Apple "Liquid Glass" inspired interactions.
 * Adds dynamic 3D tilt, ripple effects, and specular highlight tracking.
 * 
 * @example
 * // Enable tilt effect on an element
 * import { initLiquidGlass, enableTilt, enableRipple } from './ui/liquid-glass.ui.js';
 * 
 * initLiquidGlass(); // Initialize all .glass-liquid-tilt elements
 * 
 * // Or manually on specific elements:
 * enableTilt(myElement, { maxAngle: 8, perspective: 800 });
 * enableRipple(myButton);
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('LiquidGlass');

// ============================================================================
// TYPES
// ============================================================================

interface TiltOptions {
  /** Maximum tilt angle in degrees (default: 5) */
  maxAngle?: number;
  /** Perspective distance in px (default: 1000) */
  perspective?: number;
  /** Transition duration in ms (default: 300) */
  transitionDuration?: number;
  /** Also move specular highlight (default: true) */
  trackSpecular?: boolean;
}

interface RippleOptions {
  /** Ripple color (default: from CSS variable) */
  color?: string;
  /** Duration in ms (default: 600) */
  duration?: number;
}

// ============================================================================
// TILT EFFECT
// ============================================================================

/**
 * Enable 3D tilt effect on an element.
 * The element tilts based on cursor position, creating depth illusion.
 */
export function enableTilt(
  element: HTMLElement,
  options: TiltOptions = {}
): () => void {
  const {
    maxAngle = 5,
    perspective = 1000,
    transitionDuration = 300,
    trackSpecular = true,
  } = options;

  // Set perspective on parent for 3D effect
  element.style.transformStyle = 'preserve-3d';
  element.style.perspective = `${perspective}px`;
  element.style.transition = `transform ${transitionDuration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;

  const handleMouseMove = (e: MouseEvent) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate distance from center (normalized -1 to 1)
    const deltaX = (e.clientX - centerX) / (rect.width / 2);
    const deltaY = (e.clientY - centerY) / (rect.height / 2);

    // Convert to rotation angles (inverted for natural feel)
    const rotateX = -deltaY * maxAngle;
    const rotateY = deltaX * maxAngle;

    element.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

    // Move specular highlight to follow cursor
    if (trackSpecular) {
      const specularX = ((e.clientX - rect.left) / rect.width) * 100;
      const specularY = ((e.clientY - rect.top) / rect.height) * 100;
      element.style.setProperty('--specular-x', `${specularX}%`);
      element.style.setProperty('--specular-y', `${specularY}%`);
    }
  };

  const handleMouseLeave = () => {
    element.style.transform = 'rotateX(0deg) rotateY(0deg)';
    if (trackSpecular) {
      element.style.setProperty('--specular-x', '30%');
      element.style.setProperty('--specular-y', '30%');
    }
  };

  element.addEventListener('mousemove', handleMouseMove);
  element.addEventListener('mouseleave', handleMouseLeave);

  // Return cleanup function
  return () => {
    element.removeEventListener('mousemove', handleMouseMove);
    element.removeEventListener('mouseleave', handleMouseLeave);
    element.style.transform = '';
    element.style.transformStyle = '';
    element.style.perspective = '';
  };
}

// ============================================================================
// RIPPLE EFFECT
// ============================================================================

/**
 * Enable material-style ripple effect on element clicks.
 * Creates expanding circle from click point.
 */
export function enableRipple(
  element: HTMLElement,
  options: RippleOptions = {}
): () => void {
  const {
    color = 'var(--glass-ripple-color, rgba(255, 255, 255, 0.15))',
    duration = 600,
  } = options;

  element.style.position = 'relative';
  element.style.overflow = 'hidden';

  const handleClick = (e: MouseEvent) => {
    const rect = element.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate ripple size (should cover entire element)
    const size = Math.max(rect.width, rect.height) * 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `
      position: absolute;
      left: ${x - size / 2}px;
      top: ${y - size / 2}px;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      transform: scale(0);
      animation: glassRipple ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      pointer-events: none;
    `;

    element.appendChild(ripple);

    // Remove after animation
    setTimeout(() => {
      ripple.remove();
    }, duration);
  };

  element.addEventListener('click', handleClick);

  return () => {
    element.removeEventListener('click', handleClick);
  };
}

// ============================================================================
// SPECULAR HIGHLIGHT TRACKING
// ============================================================================

/**
 * Enable specular highlight that follows cursor.
 * Creates realistic light reflection effect.
 */
export function enableSpecularTracking(element: HTMLElement): () => void {
  const handleMouseMove = (e: MouseEvent) => {
    const rect = element.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    element.style.setProperty('--specular-x', `${x}%`);
    element.style.setProperty('--specular-y', `${y}%`);
  };

  const handleMouseLeave = () => {
    // Return to default position
    element.style.setProperty('--specular-x', '30%');
    element.style.setProperty('--specular-y', '30%');
  };

  element.addEventListener('mousemove', handleMouseMove);
  element.addEventListener('mouseleave', handleMouseLeave);

  return () => {
    element.removeEventListener('mousemove', handleMouseMove);
    element.removeEventListener('mouseleave', handleMouseLeave);
  };
}

// ============================================================================
// DYNAMIC VIBRANCY
// ============================================================================

/**
 * Adjust vibrancy based on content behind the glass.
 * Analyzes average brightness and adjusts saturation accordingly.
 */
export function enableDynamicVibrancy(element: HTMLElement): () => void {
  // Use IntersectionObserver to detect when element is visible
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Calculate ambient brightness and adjust vibrancy
          // This is a simplified version - in production you'd sample the background
          const isDark = document.documentElement.getAttribute('data-theme') === 'midnight';
          const vibrancy = isDark ? 'var(--glass-vibrancy-high)' : 'var(--glass-vibrancy-medium)';
          element.style.setProperty('--dynamic-vibrancy', vibrancy);
        }
      });
    },
    { threshold: 0.1 }
  );

  observer.observe(element);

  return () => {
    observer.disconnect();
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

const cleanupFunctions: Map<HTMLElement, (() => void)[]> = new Map();

/**
 * Initialize Liquid Glass effects on all matching elements.
 * Call once on app startup.
 */
export function initLiquidGlass(): void {
  // Clean up previous instances (HMR safety)
  cleanupFunctions.forEach((cleanups) => {
    cleanups.forEach((cleanup) => cleanup());
  });
  cleanupFunctions.clear();

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    log.debug('Reduced motion preferred, skipping Liquid Glass animations');
    return;
  }

  // Initialize tilt elements
  document.querySelectorAll<HTMLElement>('.glass-liquid-tilt').forEach((el) => {
    const cleanup = enableTilt(el);
    if (!cleanupFunctions.has(el)) {
      cleanupFunctions.set(el, []);
    }
    cleanupFunctions.get(el)?.push(cleanup);
  });

  // Initialize ripple elements
  document.querySelectorAll<HTMLElement>('.glass-liquid-ripple').forEach((el) => {
    const cleanup = enableRipple(el);
    if (!cleanupFunctions.has(el)) {
      cleanupFunctions.set(el, []);
    }
    cleanupFunctions.get(el)?.push(cleanup);
  });

  // Initialize specular tracking on all glass-liquid elements
  document.querySelectorAll<HTMLElement>('.glass-liquid').forEach((el) => {
    const cleanup = enableSpecularTracking(el);
    if (!cleanupFunctions.has(el)) {
      cleanupFunctions.set(el, []);
    }
    cleanupFunctions.get(el)?.push(cleanup);
  });

  log.debug('Liquid Glass effects initialized');
}

/**
 * Cleanup all Liquid Glass effects.
 * Call when unmounting or before re-init.
 */
export function destroyLiquidGlass(): void {
  cleanupFunctions.forEach((cleanups) => {
    cleanups.forEach((cleanup) => cleanup());
  });
  cleanupFunctions.clear();
  log.debug('Liquid Glass effects destroyed');
}

/**
 * Apply Liquid Glass effect to a specific element dynamically.
 * Useful for elements created after init.
 */
export function applyLiquidGlass(
  element: HTMLElement,
  options: {
    tilt?: boolean | TiltOptions;
    ripple?: boolean | RippleOptions;
    specular?: boolean;
    vibrancy?: boolean;
  } = {}
): () => void {
  const cleanups: (() => void)[] = [];

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    return () => {};
  }

  if (options.tilt) {
    const tiltOpts = typeof options.tilt === 'object' ? options.tilt : {};
    cleanups.push(enableTilt(element, tiltOpts));
  }

  if (options.ripple) {
    const rippleOpts = typeof options.ripple === 'object' ? options.ripple : {};
    cleanups.push(enableRipple(element, rippleOpts));
  }

  if (options.specular !== false) {
    cleanups.push(enableSpecularTracking(element));
  }

  if (options.vibrancy) {
    cleanups.push(enableDynamicVibrancy(element));
  }

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  init: initLiquidGlass,
  destroy: destroyLiquidGlass,
  apply: applyLiquidGlass,
  enableTilt,
  enableRipple,
  enableSpecularTracking,
  enableDynamicVibrancy,
};

