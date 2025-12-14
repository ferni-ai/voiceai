/**
 * RTL (Right-to-Left) Layout Utilities
 *
 * Provides utilities for supporting RTL languages (Arabic, Hebrew).
 * Uses CSS logical properties as recommended in design-system/tokens/i18n.json.
 *
 * NOTE: This module can run in both browser and Node.js environments.
 * Browser-specific code is guarded with typeof checks.
 */

// Declare browser globals for TypeScript (not available in Node.js)
declare const document:
  | {
      documentElement: {
        dir: string;
        lang: string;
        classList: {
          add: (className: string) => void;
          remove: (className: string) => void;
        };
        style: {
          setProperty: (property: string, value: string) => void;
        };
      };
    }
  | undefined;

// Minimal HTMLElement interface for Node.js compatibility
interface HTMLElementLike {
  style: {
    setProperty: (property: string, value: string) => void;
  };
}

import { type SupportedLocale, type TextDirection, RTL_LOCALES } from './types.js';

// ============================================================================
// RTL DETECTION
// ============================================================================

/**
 * Check if a locale is RTL
 */
export function isRTLLocale(locale: SupportedLocale): boolean {
  const baseLocale = locale.split('-')[0] as SupportedLocale;
  return RTL_LOCALES.includes(baseLocale) || RTL_LOCALES.includes(locale);
}

/**
 * Get text direction for a locale
 */
export function getTextDirection(locale: SupportedLocale): TextDirection {
  return isRTLLocale(locale) ? 'rtl' : 'ltr';
}

// ============================================================================
// DOM UTILITIES
// ============================================================================

/**
 * Apply RTL direction to the document
 */
export function applyDocumentDirection(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return;

  const dir = getTextDirection(locale);
  document.documentElement.dir = dir;
  document.documentElement.lang = locale;

  // Add RTL class for CSS targeting
  if (dir === 'rtl') {
    document.documentElement.classList.add('rtl');
    document.documentElement.classList.remove('ltr');
  } else {
    document.documentElement.classList.add('ltr');
    document.documentElement.classList.remove('rtl');
  }
}

/**
 * Get the current document direction
 */
export function getDocumentDirection(): TextDirection {
  if (typeof document === 'undefined') return 'ltr';
  return (document.documentElement.dir as TextDirection) || 'ltr';
}

// ============================================================================
// CSS LOGICAL PROPERTIES
// ============================================================================

/**
 * Map of physical to logical CSS properties
 * Use logical properties for RTL-aware layouts
 */
export const CSS_LOGICAL_PROPERTIES: Record<string, string> = {
  // Margins
  'margin-left': 'margin-inline-start',
  'margin-right': 'margin-inline-end',

  // Padding
  'padding-left': 'padding-inline-start',
  'padding-right': 'padding-inline-end',

  // Position
  left: 'inset-inline-start',
  right: 'inset-inline-end',

  // Text alignment
  'text-align: left': 'text-align: start',
  'text-align: right': 'text-align: end',

  // Borders
  'border-left': 'border-inline-start',
  'border-right': 'border-inline-end',
  'border-left-width': 'border-inline-start-width',
  'border-right-width': 'border-inline-end-width',
  'border-left-color': 'border-inline-start-color',
  'border-right-color': 'border-inline-end-color',

  // Border radius
  'border-top-left-radius': 'border-start-start-radius',
  'border-top-right-radius': 'border-start-end-radius',
  'border-bottom-left-radius': 'border-end-start-radius',
  'border-bottom-right-radius': 'border-end-end-radius',
};

// ============================================================================
// ELEMENT HELPERS
// ============================================================================

/**
 * Elements that should be mirrored in RTL
 * (from design-system/tokens/i18n.json)
 */
export const MIRROR_ELEMENTS = [
  'chevron-left',
  'chevron-right',
  'arrow-left',
  'arrow-right',
  'progress-bar',
  'slider-track',
  'carousel-prev',
  'carousel-next',
] as const;

/**
 * Elements that should NOT be mirrored in RTL
 */
export const PRESERVE_ELEMENTS = [
  'clock',
  'checkmark',
  'avatar',
  'logo',
  'video-player',
  'music-player',
  'phone-icon',
] as const;

/**
 * Check if an element should be mirrored
 */
export function shouldMirror(elementType: string): boolean {
  return MIRROR_ELEMENTS.some(
    (mirror) => elementType.includes(mirror) || mirror.includes(elementType)
  );
}

/**
 * Check if an element should be preserved (not mirrored)
 */
export function shouldPreserve(elementType: string): boolean {
  return PRESERVE_ELEMENTS.some(
    (preserve) => elementType.includes(preserve) || preserve.includes(elementType)
  );
}

// ============================================================================
// TRANSFORM UTILITIES
// ============================================================================

/**
 * Get the CSS transform for mirroring in RTL
 */
export function getMirrorTransform(isRTL: boolean): string {
  return isRTL ? 'scaleX(-1)' : 'none';
}

/**
 * Get inline style object for RTL mirroring
 */
export function getRTLMirrorStyle(
  isRTL: boolean,
  shouldMirrorElement = true
): Record<string, string> {
  if (!isRTL || !shouldMirrorElement) {
    return {};
  }

  return {
    transform: 'scaleX(-1)',
  };
}

// ============================================================================
// TEXT UTILITIES
// ============================================================================

/**
 * Wrap text with directional marks for mixed content
 * Useful when embedding LTR content in RTL or vice versa
 */
export function wrapWithDirectionMarks(text: string, direction: TextDirection): string {
  if (direction === 'rtl') {
    // Right-to-Left Embedding (RLE) and Pop Directional Formatting (PDF)
    return `\u202B${text}\u202C`;
  } else {
    // Left-to-Right Embedding (LRE) and Pop Directional Formatting (PDF)
    return `\u202A${text}\u202C`;
  }
}

/**
 * Wrap numbers and other neutral content to preserve direction
 */
export function preserveNumberDirection(text: string): string {
  // Use Left-to-Right Mark (LRM) around numbers
  return text.replace(/(\d+)/g, '\u200E$1\u200E');
}

/**
 * Get the start/end values based on direction
 */
export function getLogicalValues(isRTL: boolean): {
  start: 'left' | 'right';
  end: 'left' | 'right';
} {
  return isRTL ? { start: 'right', end: 'left' } : { start: 'left', end: 'right' };
}

// ============================================================================
// CSS CUSTOM PROPERTIES
// ============================================================================

/**
 * CSS custom properties for RTL
 * These can be applied to :root for consistent RTL handling
 */
export const RTL_CSS_PROPERTIES = {
  ltr: {
    '--direction': 'ltr',
    '--text-align-start': 'left',
    '--text-align-end': 'right',
    '--float-start': 'left',
    '--float-end': 'right',
    '--translate-start': '-100%',
    '--translate-end': '100%',
    '--rotate-chevron-start': '0deg',
    '--rotate-chevron-end': '180deg',
  },
  rtl: {
    '--direction': 'rtl',
    '--text-align-start': 'right',
    '--text-align-end': 'left',
    '--float-start': 'right',
    '--float-end': 'left',
    '--translate-start': '100%',
    '--translate-end': '-100%',
    '--rotate-chevron-start': '180deg',
    '--rotate-chevron-end': '0deg',
  },
} as const;

/**
 * Apply RTL CSS properties to an element
 */
export function applyRTLProperties(element: HTMLElementLike, direction: TextDirection): void {
  const properties = RTL_CSS_PROPERTIES[direction];

  for (const [property, value] of Object.entries(properties)) {
    element.style.setProperty(property, value);
  }
}

// ============================================================================
// ANIMATION HELPERS
// ============================================================================

/**
 * Get animation direction for slide animations
 */
export function getSlideDirection(
  baseDirection: 'left' | 'right',
  isRTL: boolean
): 'left' | 'right' {
  if (isRTL) {
    return baseDirection === 'left' ? 'right' : 'left';
  }
  return baseDirection;
}

/**
 * Get transform origin for RTL-aware animations
 */
export function getTransformOrigin(
  base: 'left' | 'right' | 'center',
  isRTL: boolean
): 'left' | 'right' | 'center' {
  if (base === 'center' || !isRTL) {
    return base;
  }
  return base === 'left' ? 'right' : 'left';
}
