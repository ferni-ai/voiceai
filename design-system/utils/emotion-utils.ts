/**
 * Emotion Utilities
 * 
 * Functions for mood-aware UI adaptation based on emotional state.
 */

// =============================================================================
// Types
// =============================================================================

export type EmotionState = 
  | 'calm' | 'joyful' | 'anxious' | 'tired' 
  | 'focused' | 'reflective' | 'stressed' | 'energized' | 'peaceful';

export type IntensityLevel = 'subtle' | 'moderate' | 'intense';

export interface EmotionConfig {
  color: {
    hueShift: number;
    saturationMultiplier: number;
    lightnessShift: number;
  };
  motion: {
    speedMultiplier: number;
    easingPreference: 'gentle' | 'standard' | 'spring';
    breathingRate: number;
  };
  sound: {
    volumeMultiplier: number;
    pitchShift: number;
  };
  typography: {
    weightShift: number;
    letterSpacingShift: number;
  };
}

export interface EmotionTransition {
  from: EmotionState;
  to: EmotionState;
  duration: number;
  easing: string;
}

// =============================================================================
// Emotion Configurations
// =============================================================================

const EMOTIONS: Record<EmotionState, EmotionConfig> = {
  calm: {
    color: { hueShift: 0, saturationMultiplier: 0.9, lightnessShift: 0 },
    motion: { speedMultiplier: 0.85, easingPreference: 'gentle', breathingRate: 4000 },
    sound: { volumeMultiplier: 0.8, pitchShift: 0 },
    typography: { weightShift: 0, letterSpacingShift: 0.01 },
  },
  joyful: {
    color: { hueShift: 10, saturationMultiplier: 1.15, lightnessShift: 5 },
    motion: { speedMultiplier: 1.1, easingPreference: 'spring', breathingRate: 3000 },
    sound: { volumeMultiplier: 1.0, pitchShift: 2 },
    typography: { weightShift: 0, letterSpacingShift: 0 },
  },
  anxious: {
    color: { hueShift: -15, saturationMultiplier: 0.7, lightnessShift: -5 },
    motion: { speedMultiplier: 0.7, easingPreference: 'gentle', breathingRate: 5000 },
    sound: { volumeMultiplier: 0.7, pitchShift: -1 },
    typography: { weightShift: -50, letterSpacingShift: 0.02 },
  },
  tired: {
    color: { hueShift: -5, saturationMultiplier: 0.6, lightnessShift: -10 },
    motion: { speedMultiplier: 0.6, easingPreference: 'gentle', breathingRate: 6000 },
    sound: { volumeMultiplier: 0.6, pitchShift: -2 },
    typography: { weightShift: -100, letterSpacingShift: 0.01 },
  },
  focused: {
    color: { hueShift: 0, saturationMultiplier: 1.0, lightnessShift: 0 },
    motion: { speedMultiplier: 0.9, easingPreference: 'standard', breathingRate: 4500 },
    sound: { volumeMultiplier: 0.85, pitchShift: 0 },
    typography: { weightShift: 50, letterSpacingShift: -0.01 },
  },
  reflective: {
    color: { hueShift: -10, saturationMultiplier: 0.75, lightnessShift: -3 },
    motion: { speedMultiplier: 0.7, easingPreference: 'gentle', breathingRate: 5500 },
    sound: { volumeMultiplier: 0.65, pitchShift: -1 },
    typography: { weightShift: -50, letterSpacingShift: 0.015 },
  },
  stressed: {
    color: { hueShift: -20, saturationMultiplier: 0.65, lightnessShift: -8 },
    motion: { speedMultiplier: 0.65, easingPreference: 'gentle', breathingRate: 5500 },
    sound: { volumeMultiplier: 0.6, pitchShift: -2 },
    typography: { weightShift: -50, letterSpacingShift: 0.02 },
  },
  energized: {
    color: { hueShift: 15, saturationMultiplier: 1.2, lightnessShift: 8 },
    motion: { speedMultiplier: 1.2, easingPreference: 'spring', breathingRate: 2800 },
    sound: { volumeMultiplier: 1.1, pitchShift: 3 },
    typography: { weightShift: 50, letterSpacingShift: -0.01 },
  },
  peaceful: {
    color: { hueShift: 5, saturationMultiplier: 0.85, lightnessShift: 3 },
    motion: { speedMultiplier: 0.75, easingPreference: 'gentle', breathingRate: 4500 },
    sound: { volumeMultiplier: 0.7, pitchShift: 1 },
    typography: { weightShift: -50, letterSpacingShift: 0.015 },
  },
};

const INTENSITY_MULTIPLIERS: Record<IntensityLevel, number> = {
  subtle: 0.5,
  moderate: 1.0,
  intense: 1.5,
};

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Get emotion configuration
 */
export function getEmotionConfig(emotion: EmotionState): EmotionConfig {
  return EMOTIONS[emotion] || EMOTIONS.calm;
}

/**
 * Get emotion configuration with intensity applied
 */
export function getEmotionWithIntensity(
  emotion: EmotionState, 
  intensity: IntensityLevel = 'moderate'
): EmotionConfig {
  const config = EMOTIONS[emotion];
  const multiplier = INTENSITY_MULTIPLIERS[intensity];

  return {
    color: {
      hueShift: config.color.hueShift * multiplier,
      saturationMultiplier: 1 + (config.color.saturationMultiplier - 1) * multiplier,
      lightnessShift: config.color.lightnessShift * multiplier,
    },
    motion: {
      speedMultiplier: 1 + (config.motion.speedMultiplier - 1) * multiplier,
      easingPreference: config.motion.easingPreference,
      breathingRate: config.motion.breathingRate,
    },
    sound: {
      volumeMultiplier: 1 + (config.sound.volumeMultiplier - 1) * multiplier,
      pitchShift: config.sound.pitchShift * multiplier,
    },
    typography: {
      weightShift: config.typography.weightShift * multiplier,
      letterSpacingShift: config.typography.letterSpacingShift * multiplier,
    },
  };
}

// =============================================================================
// Color Adaptation
// =============================================================================

/**
 * Adjust a hex color based on emotion
 */
export function adjustColorForEmotion(
  hexColor: string,
  emotion: EmotionState,
  intensity: IntensityLevel = 'moderate'
): string {
  const config = getEmotionWithIntensity(emotion, intensity);
  
  // Parse hex to HSL
  const hsl = hexToHSL(hexColor);
  
  // Apply emotion adjustments
  let h = (hsl.h + config.color.hueShift + 360) % 360;
  let s = Math.max(0, Math.min(100, hsl.s * config.color.saturationMultiplier));
  let l = Math.max(0, Math.min(100, hsl.l + config.color.lightnessShift));

  return hslToHex(h, s, l);
}

/**
 * Convert hex to HSL
 */
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

/**
 * Convert HSL to hex
 */
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
// Motion Adaptation
// =============================================================================

/**
 * Get animation duration adjusted for emotion
 */
export function getEmotionDuration(baseDuration: number, emotion: EmotionState): number {
  const config = getEmotionConfig(emotion);
  return Math.round(baseDuration / config.motion.speedMultiplier);
}

/**
 * Get easing function for emotion
 */
export function getEmotionEasing(emotion: EmotionState): string {
  const config = getEmotionConfig(emotion);
  const easings = {
    gentle: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  };
  return easings[config.motion.easingPreference];
}

/**
 * Get breathing animation rate for emotion
 */
export function getBreathingRate(emotion: EmotionState): number {
  return getEmotionConfig(emotion).motion.breathingRate;
}

// =============================================================================
// Typography Adaptation
// =============================================================================

/**
 * Get font weight adjusted for emotion
 */
export function getEmotionFontWeight(baseWeight: number, emotion: EmotionState): number {
  const config = getEmotionConfig(emotion);
  return Math.max(100, Math.min(900, baseWeight + config.typography.weightShift));
}

/**
 * Get letter spacing adjusted for emotion
 */
export function getEmotionLetterSpacing(emotion: EmotionState): string {
  const config = getEmotionConfig(emotion);
  return `${config.typography.letterSpacingShift}em`;
}

// =============================================================================
// Transition Helpers
// =============================================================================

/**
 * Calculate transition duration between emotions
 */
export function getEmotionTransitionDuration(from: EmotionState, to: EmotionState): number {
  // Calming transitions take longer
  const calmingEmotions: EmotionState[] = ['calm', 'peaceful', 'reflective'];
  const highEnergyEmotions: EmotionState[] = ['anxious', 'stressed', 'energized'];
  
  if (highEnergyEmotions.includes(from) && calmingEmotions.includes(to)) {
    return 1500; // Longer for calming down
  }
  if (calmingEmotions.includes(from) && highEnergyEmotions.includes(to)) {
    return 400; // Quicker for alerting
  }
  return 600; // Default
}

/**
 * Interpolate between two emotion configs
 */
export function interpolateEmotions(
  from: EmotionState,
  to: EmotionState,
  progress: number // 0 to 1
): EmotionConfig {
  const fromConfig = getEmotionConfig(from);
  const toConfig = getEmotionConfig(to);
  
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  
  return {
    color: {
      hueShift: lerp(fromConfig.color.hueShift, toConfig.color.hueShift),
      saturationMultiplier: lerp(fromConfig.color.saturationMultiplier, toConfig.color.saturationMultiplier),
      lightnessShift: lerp(fromConfig.color.lightnessShift, toConfig.color.lightnessShift),
    },
    motion: {
      speedMultiplier: lerp(fromConfig.motion.speedMultiplier, toConfig.motion.speedMultiplier),
      easingPreference: progress < 0.5 ? fromConfig.motion.easingPreference : toConfig.motion.easingPreference,
      breathingRate: lerp(fromConfig.motion.breathingRate, toConfig.motion.breathingRate),
    },
    sound: {
      volumeMultiplier: lerp(fromConfig.sound.volumeMultiplier, toConfig.sound.volumeMultiplier),
      pitchShift: lerp(fromConfig.sound.pitchShift, toConfig.sound.pitchShift),
    },
    typography: {
      weightShift: lerp(fromConfig.typography.weightShift, toConfig.typography.weightShift),
      letterSpacingShift: lerp(fromConfig.typography.letterSpacingShift, toConfig.typography.letterSpacingShift),
    },
  };
}

// =============================================================================
// CSS Variable Generation
// =============================================================================

/**
 * Generate CSS variables for an emotion state
 */
export function generateEmotionCSSVariables(emotion: EmotionState): Record<string, string> {
  const config = getEmotionConfig(emotion);
  
  return {
    '--emotion-hue-shift': `${config.color.hueShift}deg`,
    '--emotion-saturation': `${config.color.saturationMultiplier}`,
    '--emotion-lightness-shift': `${config.color.lightnessShift}%`,
    '--emotion-speed': `${config.motion.speedMultiplier}`,
    '--emotion-breathing-rate': `${config.motion.breathingRate}ms`,
    '--emotion-easing': getEmotionEasing(emotion),
    '--emotion-font-weight-shift': `${config.typography.weightShift}`,
    '--emotion-letter-spacing': `${config.typography.letterSpacingShift}em`,
  };
}

/**
 * Apply emotion CSS variables to an element
 */
export function applyEmotionToElement(element: HTMLElement, emotion: EmotionState): void {
  const vars = generateEmotionCSSVariables(emotion);
  Object.entries(vars).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
  element.dataset.emotion = emotion;
}
