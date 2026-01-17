/**
 * Color Utilities for Agent Page Generator
 *
 * Functions for parsing, transforming, and deriving colors
 * used in persona theming.
 */

import type { DerivedBrandColors } from './types.js';

/**
 * Parse a hex color string into RGB components
 */
export function parseHex(hex: string): { r: number; g: number; b: number } {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Handle 3-digit hex
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex;

  const r = parseInt(fullHex.slice(0, 2), 16);
  const g = parseInt(fullHex.slice(2, 4), 16);
  const b = parseInt(fullHex.slice(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return { r, g, b };
}

/**
 * Convert hex color to rgba() string
 */
export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

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

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  h /= 360;
  s /= 100;
  l /= 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Convert RGB to hex string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Lighten a hex color by a percentage
 */
export function lightenColor(hex: string, percent: number): string {
  const { r, g, b } = parseHex(hex);
  const { h, s, l } = rgbToHsl(r, g, b);

  // Increase lightness
  const newL = Math.min(100, l + percent);
  const { r: newR, g: newG, b: newB } = hslToRgb(h, s, newL);

  return rgbToHex(newR, newG, newB);
}

/**
 * Darken a hex color by a percentage
 */
export function darkenColor(hex: string, percent: number): string {
  const { r, g, b } = parseHex(hex);
  const { h, s, l } = rgbToHsl(r, g, b);

  // Decrease lightness
  const newL = Math.max(0, l - percent);
  const { r: newR, g: newG, b: newB } = hslToRgb(h, s, newL);

  return rgbToHex(newR, newG, newB);
}

/**
 * Derive secondary color from primary
 * Creates a lighter variant for gradients
 */
export function deriveSecondaryColor(primary: string): string {
  return lightenColor(primary, 15);
}

/**
 * Derive all brand colors from a primary color
 */
export function deriveBrandColors(
  primary: string,
  secondary?: string
): DerivedBrandColors {
  const derivedSecondary = secondary || deriveSecondaryColor(primary);

  return {
    primary,
    secondary: derivedSecondary,
    glow: hexToRgba(primary, 0.35),
    tint: hexToRgba(primary, 0.06),
    gradientOrb: `linear-gradient(145deg, ${derivedSecondary} 0%, ${primary} 100%)`,
  };
}

/**
 * Generate persona CSS block from brand colors
 */
export function generatePersonaCss(
  personaId: string,
  colors: DerivedBrandColors
): string {
  return `
    /* ${personaId} persona theme */
    [data-persona="${personaId}"] {
      --persona-primary: ${colors.primary};
      --persona-secondary: ${colors.secondary};
      --persona-glow: ${colors.glow};
      --persona-bg-tint: ${colors.tint};
      --gradient-orb: ${colors.gradientOrb};
    }

    /* ${personaId} avatar styling - always use brand color */
    [data-persona="${personaId}"] #coachAvatar,
    [data-theme="zen"][data-persona="${personaId}"] #coachAvatar {
      background: ${colors.gradientOrb} !important;
    }

    [data-persona="${personaId}"] #avatarText,
    [data-theme="zen"][data-persona="${personaId}"] #avatarText {
      color: #FFFFFF !important;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }

    [data-theme="zen"][data-persona="${personaId}"] #avatarRing {
      border-color: ${hexToRgba(colors.primary, 0.2)};
      border-width: 2.5px;
      opacity: 0.8;
    }

    /* Keep brand color ring when connected */
    [data-persona="${personaId}"] #coach.is-connected #avatarRing {
      border-color: ${colors.primary} !important;
      opacity: 0.9;
    }

    /* Pulse ring animation when speaking */
    [data-persona="${personaId}"] #coach.is-speaking #avatarRing {
      animation: ${personaId}SpeakingRing 1.2s ease-in-out infinite;
    }

    @keyframes ${personaId}SpeakingRing {
      0%, 100% {
        transform: translate(var(--eye-x, 0), var(--eye-y, 0)) scale(1);
        opacity: 0.6;
        box-shadow: 0 0 0 transparent;
        border-width: 2.5px;
      }
      50% {
        transform: translate(var(--eye-x, 0), var(--eye-y, 0)) scale(1.02);
        opacity: 0.9;
        box-shadow: 0 0 15px ${colors.glow};
        border-width: 3px;
      }
    }

    /* Listening state */
    [data-persona="${personaId}"] #coach.is-listening #avatarRing {
      animation: ${personaId}ListeningRing 2s ease-in-out infinite;
    }

    @keyframes ${personaId}ListeningRing {
      0%, 100% {
        transform: translate(var(--eye-x, 0), var(--eye-y, 0)) scale(1);
        opacity: 0.5;
        box-shadow: 0 0 8px ${hexToRgba(colors.primary, 0.2)};
      }
      50% {
        transform: translate(var(--eye-x, 0), var(--eye-y, 0)) scale(1.01);
        opacity: 0.7;
        box-shadow: 0 0 12px ${hexToRgba(colors.primary, 0.25)};
      }
    }

    /* Zen theme button styling */
    [data-theme="zen"][data-persona="${personaId}"] .btn-primary {
      background: ${colors.gradientOrb};
    }
  `.trim();
}

/**
 * Check if a color has sufficient contrast for text
 * Returns true if the color is dark enough for white text
 */
export function isDarkColor(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

/**
 * Get appropriate text color for a background
 */
export function getContrastTextColor(backgroundHex: string): string {
  return isDarkColor(backgroundHex) ? '#FFFFFF' : '#000000';
}
