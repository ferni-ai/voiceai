import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

export type EmotionState = 
  | 'calm' | 'joyful' | 'anxious' | 'tired' 
  | 'focused' | 'reflective' | 'stressed' | 'energized' | 'peaceful';

export type IntensityLevel = 'subtle' | 'moderate' | 'intense';

export interface EmotionConfig {
  hueShift: number;
  saturationMultiplier: number;
  lightnessShift: number;
  speedMultiplier: number;
  breathingRate: number;
  easing: string;
  fontWeightShift: number;
  letterSpacing: string;
}

export interface UseEmotionOptions {
  /** Initial emotion state */
  initialEmotion?: EmotionState;
  /** Intensity level */
  intensity?: IntensityLevel;
  /** Auto-transition duration */
  transitionDuration?: number;
}

export interface UseEmotionReturn {
  /** Current emotion state */
  emotion: EmotionState;
  /** Previous emotion state */
  previousEmotion: EmotionState;
  /** Set new emotion */
  setEmotion: (emotion: EmotionState) => void;
  /** Transition to emotion with animation */
  transitionTo: (emotion: EmotionState, duration?: number) => void;
  /** Current emotion config values */
  config: EmotionConfig;
  /** Is transitioning between emotions */
  isTransitioning: boolean;
  /** CSS variables for current emotion */
  cssVariables: Record<string, string>;
  /** Adjust color for current emotion */
  adjustColor: (hexColor: string) => string;
  /** Get duration adjusted for emotion */
  getDuration: (baseDuration: number) => number;
}

// =============================================================================
// Constants
// =============================================================================

const EMOTIONS: Record<EmotionState, Omit<EmotionConfig, 'easing'> & { easingPreference: string }> = {
  calm: {
    hueShift: 0,
    saturationMultiplier: 0.9,
    lightnessShift: 0,
    speedMultiplier: 0.85,
    breathingRate: 4000,
    easingPreference: 'gentle',
    fontWeightShift: 0,
    letterSpacing: '0.01em',
  },
  joyful: {
    hueShift: 10,
    saturationMultiplier: 1.15,
    lightnessShift: 5,
    speedMultiplier: 1.1,
    breathingRate: 3000,
    easingPreference: 'spring',
    fontWeightShift: 0,
    letterSpacing: '0em',
  },
  anxious: {
    hueShift: -15,
    saturationMultiplier: 0.7,
    lightnessShift: -5,
    speedMultiplier: 0.7,
    breathingRate: 5000,
    easingPreference: 'gentle',
    fontWeightShift: -50,
    letterSpacing: '0.02em',
  },
  tired: {
    hueShift: -5,
    saturationMultiplier: 0.6,
    lightnessShift: -10,
    speedMultiplier: 0.6,
    breathingRate: 6000,
    easingPreference: 'gentle',
    fontWeightShift: -100,
    letterSpacing: '0.01em',
  },
  focused: {
    hueShift: 0,
    saturationMultiplier: 1.0,
    lightnessShift: 0,
    speedMultiplier: 0.9,
    breathingRate: 4500,
    easingPreference: 'standard',
    fontWeightShift: 50,
    letterSpacing: '-0.01em',
  },
  reflective: {
    hueShift: -10,
    saturationMultiplier: 0.75,
    lightnessShift: -3,
    speedMultiplier: 0.7,
    breathingRate: 5500,
    easingPreference: 'gentle',
    fontWeightShift: -50,
    letterSpacing: '0.015em',
  },
  stressed: {
    hueShift: -20,
    saturationMultiplier: 0.65,
    lightnessShift: -8,
    speedMultiplier: 0.65,
    breathingRate: 5500,
    easingPreference: 'gentle',
    fontWeightShift: -50,
    letterSpacing: '0.02em',
  },
  energized: {
    hueShift: 15,
    saturationMultiplier: 1.2,
    lightnessShift: 8,
    speedMultiplier: 1.2,
    breathingRate: 2800,
    easingPreference: 'spring',
    fontWeightShift: 50,
    letterSpacing: '-0.01em',
  },
  peaceful: {
    hueShift: 5,
    saturationMultiplier: 0.85,
    lightnessShift: 3,
    speedMultiplier: 0.75,
    breathingRate: 4500,
    easingPreference: 'gentle',
    fontWeightShift: -50,
    letterSpacing: '0.015em',
  },
};

const EASINGS = {
  gentle: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

const INTENSITY_MULTIPLIERS: Record<IntensityLevel, number> = {
  subtle: 0.5,
  moderate: 1.0,
  intense: 1.5,
};

// =============================================================================
// Helper Functions
// =============================================================================

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for mood-aware UI adaptation
 * 
 * @example
 * ```tsx
 * const { emotion, setEmotion, config, adjustColor } = useEmotion({
 *   initialEmotion: 'calm',
 *   intensity: 'moderate'
 * });
 * 
 * // Adjust colors based on emotion
 * const bgColor = adjustColor('#4a6741');
 * 
 * // Get emotion-adjusted duration
 * const duration = getDuration(300);
 * ```
 */
export function useEmotion(options: UseEmotionOptions = {}): UseEmotionReturn {
  const { 
    initialEmotion = 'calm', 
    intensity = 'moderate',
    transitionDuration = 600 
  } = options;

  const [emotion, setEmotionState] = useState<EmotionState>(initialEmotion);
  const [previousEmotion, setPreviousEmotion] = useState<EmotionState>(initialEmotion);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const multiplier = INTENSITY_MULTIPLIERS[intensity];

  // Get current config with intensity applied
  const config = useMemo((): EmotionConfig => {
    const base = EMOTIONS[emotion];
    return {
      hueShift: base.hueShift * multiplier,
      saturationMultiplier: 1 + (base.saturationMultiplier - 1) * multiplier,
      lightnessShift: base.lightnessShift * multiplier,
      speedMultiplier: 1 + (base.speedMultiplier - 1) * multiplier,
      breathingRate: base.breathingRate,
      easing: EASINGS[base.easingPreference as keyof typeof EASINGS],
      fontWeightShift: base.fontWeightShift * multiplier,
      letterSpacing: base.letterSpacing,
    };
  }, [emotion, multiplier]);

  // Generate CSS variables
  const cssVariables = useMemo((): Record<string, string> => ({
    '--emotion-hue-shift': `${config.hueShift}deg`,
    '--emotion-saturation': `${config.saturationMultiplier}`,
    '--emotion-lightness-shift': `${config.lightnessShift}%`,
    '--emotion-speed': `${config.speedMultiplier}`,
    '--emotion-breathing-rate': `${config.breathingRate}ms`,
    '--emotion-easing': config.easing,
    '--emotion-font-weight-shift': `${config.fontWeightShift}`,
    '--emotion-letter-spacing': config.letterSpacing,
  }), [config]);

  // Set emotion immediately
  const setEmotion = useCallback((newEmotion: EmotionState) => {
    setPreviousEmotion(emotion);
    setEmotionState(newEmotion);
  }, [emotion]);

  // Transition to emotion with animation
  const transitionTo = useCallback((newEmotion: EmotionState, duration = transitionDuration) => {
    setPreviousEmotion(emotion);
    setIsTransitioning(true);
    setEmotionState(newEmotion);

    setTimeout(() => {
      setIsTransitioning(false);
    }, duration);
  }, [emotion, transitionDuration]);

  // Adjust color for current emotion
  const adjustColor = useCallback((hexColor: string): string => {
    const hsl = hexToHSL(hexColor);
    const h = (hsl.h + config.hueShift + 360) % 360;
    const s = Math.max(0, Math.min(100, hsl.s * config.saturationMultiplier));
    const l = Math.max(0, Math.min(100, hsl.l + config.lightnessShift));
    return hslToHex(h, s, l);
  }, [config]);

  // Get duration adjusted for emotion
  const getDuration = useCallback((baseDuration: number): number => {
    return Math.round(baseDuration / config.speedMultiplier);
  }, [config.speedMultiplier]);

  return {
    emotion,
    previousEmotion,
    setEmotion,
    transitionTo,
    config,
    isTransitioning,
    cssVariables,
    adjustColor,
    getDuration,
  };
}

/**
 * Get all emotion states
 */
export const emotionStates: EmotionState[] = [
  'calm', 'joyful', 'anxious', 'tired', 
  'focused', 'reflective', 'stressed', 'energized', 'peaceful'
];
