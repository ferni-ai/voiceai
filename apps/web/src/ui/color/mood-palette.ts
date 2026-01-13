/**
 * Mood-Responsive Color Palette System
 *
 * Colors that shift subtly based on emotional state.
 * Inspired by Josef Albers' "Interaction of Color" - colors don't exist
 * in isolation; they change based on context and neighbors.
 *
 * Design Principles:
 * - Subtle shifts (±5-15° hue, ±10-20% saturation) not dramatic changes
 * - Warm colors for comfort, cool for calm, muted for fatigue
 * - Maintain accessibility contrast ratios through all transformations
 * - Smooth transitions between mood states
 *
 * @module color/mood-palette
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Mood states that affect color.
 */
export type MoodState =
  | 'calm'
  | 'joyful'
  | 'anxious'
  | 'tired'
  | 'focused'
  | 'reflective'
  | 'stressed'
  | 'energized'
  | 'peaceful';

/**
 * Color adjustment parameters for a mood.
 */
export interface MoodColorAdjustment {
  /** Hue shift in degrees (-180 to 180) */
  hueShift: number;
  /** Saturation multiplier (0.5 = 50%, 1.5 = 150%) */
  saturationMultiplier: number;
  /** Lightness adjustment (-50 to 50) */
  lightnessAdjustment: number;
  /** Optional: shift toward warm (positive) or cool (negative) */
  temperatureShift?: number;
  /** Mood character description */
  character: string;
}

/**
 * HSL color representation.
 */
export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/**
 * Complete mood palette.
 */
export interface MoodPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
}

/**
 * Persona base palette (source colors before mood adjustment).
 */
export interface PersonaPalette {
  primary: string;
  accent: string;
  background: string;
}

// ============================================================================
// CONSTANTS (from color-emotional.json tokens)
// ============================================================================

/**
 * Mood color adjustments.
 * These values are tuned for subliminal effect.
 */
export const MOOD_ADJUSTMENTS: Record<MoodState, MoodColorAdjustment> = {
  calm: {
    hueShift: -5,
    saturationMultiplier: 0.85,
    lightnessAdjustment: 3,
    temperatureShift: -5,
    character: 'Cool, soft',
  },
  joyful: {
    hueShift: 10,
    saturationMultiplier: 1.15,
    lightnessAdjustment: 5,
    temperatureShift: 10,
    character: 'Warm, bright',
  },
  anxious: {
    hueShift: 15,
    saturationMultiplier: 0.9,
    lightnessAdjustment: -5,
    temperatureShift: 5,
    character: 'Tense, muted',
  },
  tired: {
    hueShift: 0,
    saturationMultiplier: 0.7,
    lightnessAdjustment: -10,
    character: 'Desaturated',
  },
  focused: {
    hueShift: -10,
    saturationMultiplier: 1.1,
    lightnessAdjustment: 0,
    temperatureShift: -10,
    character: 'Cool, clear',
  },
  reflective: {
    hueShift: -15,
    saturationMultiplier: 0.8,
    lightnessAdjustment: 5,
    temperatureShift: -15,
    character: 'Twilight, soft',
  },
  stressed: {
    hueShift: 5,
    saturationMultiplier: 0.75,
    lightnessAdjustment: -8,
    character: 'Muted, dim',
  },
  energized: {
    hueShift: 5,
    saturationMultiplier: 1.2,
    lightnessAdjustment: 8,
    temperatureShift: 15,
    character: 'Vibrant',
  },
  peaceful: {
    hueShift: -20,
    saturationMultiplier: 0.75,
    lightnessAdjustment: 10,
    temperatureShift: -20,
    character: 'Serene',
  },
};

/**
 * Persona base palettes.
 * These are the source-of-truth colors before mood adjustment.
 */
export const PERSONA_BASE_PALETTES: Record<string, PersonaPalette> = {
  ferni: {
    primary: '#4a6741',
    accent: '#3D5A45',
    background: '#F5F2EE',
  },
  maya: {
    primary: '#a67a6a',
    accent: '#8B5A4A',
    background: '#FBF8F5',
  },
  peter: {
    primary: '#3a6b73',
    accent: '#2A5B63',
    background: '#F5F8F9',
  },
  jordan: {
    primary: '#c4856a',
    accent: '#A4654A',
    background: '#FFFAF5',
  },
  alex: {
    primary: '#5a6b8a',
    accent: '#4A5B7A',
    background: '#F5F7FA',
  },
  nayan: {
    primary: '#b8956a',
    accent: '#98754A',
    background: '#FAF8F5',
  },
};

// ============================================================================
// COLOR CONVERSION UTILITIES
// ============================================================================

/**
 * Convert hex color to HSL.
 */
export function hexToHSL(hex: string): HSLColor {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Parse RGB
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL to hex color.
 */
export function hslToHex(hsl: HSLColor): string {
  const { h, s, l } = hsl;
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Format HSL as CSS hsl() string.
 */
export function hslToCSS(hsl: HSLColor): string {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

// ============================================================================
// MOOD PALETTE GENERATION
// ============================================================================

/**
 * Apply mood adjustment to a single color.
 *
 * @param color - Hex color to adjust
 * @param mood - Mood state
 * @param intensity - How strongly to apply (0-1)
 * @returns Adjusted hex color
 */
export function adjustColorForMood(
  color: string,
  mood: MoodState,
  intensity: number = 1
): string {
  const hsl = hexToHSL(color);
  const adjustment = MOOD_ADJUSTMENTS[mood];

  // Apply adjustments with intensity
  const adjustedHSL: HSLColor = {
    h: (hsl.h + adjustment.hueShift * intensity + 360) % 360,
    s: Math.max(0, Math.min(100, hsl.s * (1 + (adjustment.saturationMultiplier - 1) * intensity))),
    l: Math.max(0, Math.min(100, hsl.l + adjustment.lightnessAdjustment * intensity)),
  };

  return hslToHex(adjustedHSL);
}

/**
 * Generate a complete mood palette from a base persona palette.
 *
 * @param basePalette - Persona's base colors
 * @param mood - Current mood state
 * @param intensity - How strongly to apply mood (0-1)
 * @returns Complete mood-adjusted palette
 */
export function getMoodPalette(
  basePalette: PersonaPalette,
  mood: MoodState,
  intensity: number = 0.7
): MoodPalette {
  const primary = adjustColorForMood(basePalette.primary, mood, intensity);
  const accent = adjustColorForMood(basePalette.accent, mood, intensity);
  const background = adjustColorForMood(basePalette.background, mood, intensity * 0.3); // Subtle BG shift

  // Derive secondary colors
  const primaryHSL = hexToHSL(primary);
  const secondary = hslToHex({
    h: (primaryHSL.h + 30) % 360, // Analogous color
    s: primaryHSL.s * 0.8,
    l: Math.min(100, primaryHSL.l + 15),
  });

  // Surface color (slightly off background)
  const bgHSL = hexToHSL(background);
  const surface = hslToHex({
    h: bgHSL.h,
    s: Math.max(0, bgHSL.s - 5),
    l: Math.max(0, bgHSL.l - 3),
  });

  // Text colors (ensure contrast)
  const textHSL = hexToHSL(primary);
  const text = hslToHex({
    h: textHSL.h,
    s: Math.max(10, textHSL.s * 0.3),
    l: 15, // Dark for readability
  });

  const textSecondary = hslToHex({
    h: textHSL.h,
    s: Math.max(5, textHSL.s * 0.2),
    l: 45,
  });

  // Border color
  const border = hslToHex({
    h: primaryHSL.h,
    s: Math.max(5, primaryHSL.s * 0.15),
    l: 85,
  });

  return {
    primary,
    secondary,
    accent,
    background,
    surface,
    text,
    textSecondary,
    border,
  };
}

/**
 * Get mood palette for a specific persona.
 *
 * @param personaId - Persona identifier
 * @param mood - Current mood state
 * @param intensity - Mood intensity (0-1)
 * @returns Complete mood palette
 */
export function getPersonaMoodPalette(
  personaId: string,
  mood: MoodState,
  intensity: number = 0.7
): MoodPalette {
  const basePalette = PERSONA_BASE_PALETTES[personaId] ?? PERSONA_BASE_PALETTES.ferni;
  if (!basePalette) throw new Error(`No palette for persona: ${personaId}`);
  return getMoodPalette(basePalette, mood, intensity);
}

// ============================================================================
// CSS GENERATION
// ============================================================================

/**
 * Generate CSS custom properties for a mood palette.
 */
export function generateMoodPaletteCSS(
  palette: MoodPalette,
  prefix: string = 'mood'
): string {
  return `
  --${prefix}-primary: ${palette.primary};
  --${prefix}-secondary: ${palette.secondary};
  --${prefix}-accent: ${palette.accent};
  --${prefix}-background: ${palette.background};
  --${prefix}-surface: ${palette.surface};
  --${prefix}-text: ${palette.text};
  --${prefix}-text-secondary: ${palette.textSecondary};
  --${prefix}-border: ${palette.border};
`.trim();
}

/**
 * Apply mood palette to document root.
 *
 * @param palette - Mood palette to apply
 * @param transition - Whether to transition smoothly
 * @param duration - Transition duration in ms
 */
export function applyMoodPaletteToRoot(
  palette: MoodPalette,
  transition: boolean = true,
  duration: number = 400
): void {
  const root = document.documentElement;

  if (transition) {
    root.style.setProperty('--mood-transition', `${duration}ms ease-out`);
  }

  root.style.setProperty('--mood-primary', palette.primary);
  root.style.setProperty('--mood-secondary', palette.secondary);
  root.style.setProperty('--mood-accent', palette.accent);
  root.style.setProperty('--mood-background', palette.background);
  root.style.setProperty('--mood-surface', palette.surface);
  root.style.setProperty('--mood-text', palette.text);
  root.style.setProperty('--mood-text-secondary', palette.textSecondary);
  root.style.setProperty('--mood-border', palette.border);
}

/**
 * Generate complete CSS for all moods.
 */
export function generateAllMoodPalettesCSS(personaId: string): string {
  const moods = Object.keys(MOOD_ADJUSTMENTS) as MoodState[];

  const moodStyles = moods.map(mood => {
    const palette = getPersonaMoodPalette(personaId, mood);
    return `
.mood-${mood} {
  ${generateMoodPaletteCSS(palette)}
}
`.trim();
  }).join('\n\n');

  return `
/* Mood Palette System - ${personaId} */
/* Colors that respond to emotional state */

:root {
  --mood-transition: 400ms ease-out;
}

.mood-palette-container {
  background: var(--mood-background);
  color: var(--mood-text);
  transition:
    background var(--mood-transition),
    color var(--mood-transition);
}

.mood-palette-container .accent {
  color: var(--mood-accent);
}

.mood-palette-container .primary {
  color: var(--mood-primary);
}

.mood-palette-container .surface {
  background: var(--mood-surface);
}

.mood-palette-container .border {
  border-color: var(--mood-border);
}

${moodStyles}
`.trim();
}

// ============================================================================
// INTERPOLATION
// ============================================================================

/**
 * Interpolate between two mood palettes.
 * Useful for smooth transitions.
 *
 * @param from - Starting palette
 * @param to - Target palette
 * @param progress - Interpolation progress (0-1)
 * @returns Interpolated palette
 */
export function interpolatePalettes(
  from: MoodPalette,
  to: MoodPalette,
  progress: number
): MoodPalette {
  const interpolateColor = (c1: string, c2: string) => {
    const hsl1 = hexToHSL(c1);
    const hsl2 = hexToHSL(c2);

    // Handle hue interpolation across 0/360 boundary
    let hDiff = hsl2.h - hsl1.h;
    if (Math.abs(hDiff) > 180) {
      hDiff = hDiff > 0 ? hDiff - 360 : hDiff + 360;
    }

    return hslToHex({
      h: (hsl1.h + hDiff * progress + 360) % 360,
      s: hsl1.s + (hsl2.s - hsl1.s) * progress,
      l: hsl1.l + (hsl2.l - hsl1.l) * progress,
    });
  };

  return {
    primary: interpolateColor(from.primary, to.primary),
    secondary: interpolateColor(from.secondary, to.secondary),
    accent: interpolateColor(from.accent, to.accent),
    background: interpolateColor(from.background, to.background),
    surface: interpolateColor(from.surface, to.surface),
    text: interpolateColor(from.text, to.text),
    textSecondary: interpolateColor(from.textSecondary, to.textSecondary),
    border: interpolateColor(from.border, to.border),
  };
}

// ============================================================================
// CONTRAST CHECKING
// ============================================================================

/**
 * Calculate relative luminance of a color.
 */
function getLuminance(hex: string): number {
  const rgb = hex.replace('#', '').match(/.{2}/g)?.map(x => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) ?? [0, 0, 0];

  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}

/**
 * Calculate contrast ratio between two colors.
 * WCAG requires 4.5:1 for normal text, 3:1 for large text.
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if palette meets WCAG accessibility standards.
 */
export function isPaletteAccessible(palette: MoodPalette): {
  textOnBackground: boolean;
  textOnSurface: boolean;
  accentOnBackground: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  const textOnBg = getContrastRatio(palette.text, palette.background);
  const textOnSurface = getContrastRatio(palette.text, palette.surface);
  const accentOnBg = getContrastRatio(palette.accent, palette.background);

  if (textOnBg < 4.5) {
    issues.push(`Text on background: ${textOnBg.toFixed(2)}:1 (needs 4.5:1)`);
  }
  if (textOnSurface < 4.5) {
    issues.push(`Text on surface: ${textOnSurface.toFixed(2)}:1 (needs 4.5:1)`);
  }
  if (accentOnBg < 3) {
    issues.push(`Accent on background: ${accentOnBg.toFixed(2)}:1 (needs 3:1)`);
  }

  return {
    textOnBackground: textOnBg >= 4.5,
    textOnSurface: textOnSurface >= 4.5,
    accentOnBackground: accentOnBg >= 3,
    issues,
  };
}

// Note: All functions and constants are exported inline above
