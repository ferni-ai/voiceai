import { useMemo, useEffect, useState } from 'react';
import { duration, easing } from '../tokens';

/**
 * Export duration constants for direct use
 */
export const DURATION = duration;

/**
 * Export easing constants for direct use
 */
export const EASING = easing;

/**
 * Duration token names
 */
export type DurationToken = keyof typeof duration;

/**
 * Easing token names
 */
export type EasingToken = keyof typeof easing;

/**
 * Animation configuration
 */
export interface AnimationConfig {
  /** Duration in milliseconds */
  duration: number;
  /** CSS easing function */
  easing: string;
  /** Whether animations are allowed (respects prefers-reduced-motion) */
  animate: boolean;
}

/**
 * Animation presets for common patterns
 */
const PRESETS = {
  buttonPress: { duration: 'fast' as const, easing: 'spring' as const },
  buttonHover: { duration: 'normal' as const, easing: 'out' as const },
  modalEnter: { duration: 'slow' as const, easing: 'out' as const },
  modalExit: { duration: 'fast' as const, easing: 'standard' as const },
  toast: { duration: 'normal' as const, easing: 'spring' as const },
  celebration: { duration: 'dramatic' as const, easing: 'spring' as const },
  fadeIn: { duration: 'normal' as const, easing: 'out' as const },
  slideUp: { duration: 'slow' as const, easing: 'springGentle' as const },
} as const;

export type AnimationPreset = keyof typeof PRESETS;

/**
 * Hook for reduced motion preference
 */
function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

/**
 * Get animation values with reduced motion support
 * 
 * @example
 * ```tsx
 * const { duration, easing, animate } = useAnimation('normal', 'spring');
 * 
 * element.animate(keyframes, {
 *   duration: animate ? duration : 0,
 *   easing,
 * });
 * ```
 */
export function useAnimation(
  durationToken: DurationToken = 'normal',
  easingToken: EasingToken = 'standard'
): AnimationConfig {
  const prefersReduced = usePrefersReducedMotion();

  return useMemo(
    () => ({
      duration: duration[durationToken],
      easing: easing[easingToken],
      animate: !prefersReduced,
    }),
    [durationToken, easingToken, prefersReduced]
  );
}

/**
 * Get animation preset configuration
 * 
 * @example
 * ```tsx
 * const { duration, easing, animate } = useAnimationPreset('celebration');
 * ```
 */
export function useAnimationPreset(preset: AnimationPreset): AnimationConfig {
  const { duration: durationToken, easing: easingToken } = PRESETS[preset];
  return useAnimation(durationToken, easingToken);
}
