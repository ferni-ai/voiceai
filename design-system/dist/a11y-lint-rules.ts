/**
 * Accessibility Lint Rules for Ferni Design System
 * Auto-generated - do not edit directly
 * 
 * These patterns indicate accessibility violations.
 */

export const A11Y_ANTIPATTERNS = {
  // NEVER use persona colors as text colors
  personaAsTextColor: {
    pattern: /color:\s*var\(--persona-primary/g,
    message: 'Do not use --persona-primary for text color. Use --color-text-* or --color-accent-text instead.',
    severity: 'error',
    fix: 'Replace with var(--color-accent-text) for accent text or var(--color-text-primary) for normal text'
  },
  
  // Hardcoded green colors as text (Ferni green)
  hardcodedGreenText: {
    pattern: /color:\s*['"]?#4a6741|color:\s*['"]?#3d5a35|color:\s*['"]?#2d5a3d/gi,
    message: 'Hardcoded green color used as text. Use CSS variables for theme support.',
    severity: 'error',
    fix: 'Replace with var(--color-accent-text)'
  },
  
  // Light theme fallbacks in text color declarations
  lightThemeFallbacksInText: {
    pattern: /color:.*#5[cC]544[aA]|color:.*#756[aA]5[eE]|color:.*#5a5048/g,
    message: 'Light theme color used as fallback. These fail on dark backgrounds.',
    severity: 'warning',
    fix: 'Remove fallback or use theme-appropriate values'
  }
};

// WCAG 2.1 AA Minimum Contrast Ratios
export const WCAG_REQUIREMENTS = {
  normalText: 4.5,    // < 18pt or < 14pt bold
  largeText: 3.0,     // >= 18pt or >= 14pt bold  
  uiComponents: 3.0,  // Borders, icons, focus indicators
};

// Safe text color tokens for dark theme (Cedar Night)
export const DARK_THEME_TEXT_TOKENS = {
  primary: { token: '--color-text-primary', color: '#faf6f0', contrast: 5.56 },
  secondary: { token: '--color-text-secondary', color: '#f0ebe4', contrast: 5.05 },
  muted: { token: '--color-text-muted', color: '#e8e2da', contrast: 4.65 },
  dimmed: { token: '--color-text-dimmed', color: '#ddd6cc', contrast: 4.15, largeOnly: true },
  accent: { token: '--color-accent-text', color: '#e8c870', contrast: 3.68, largeOnly: true },
};

// Prohibited patterns - these WILL fail accessibility
export const PROHIBITED_TEXT_COLORS = [
  { color: '#4a6741', name: 'Ferni Green', reason: '1.06:1 contrast on dark bg' },
  { color: '#3d5a35', name: 'Ferni Secondary', reason: '0.85:1 contrast on dark bg' },
  { color: '#9a7b5a', name: 'Jack Brown', reason: '1.53:1 contrast on dark bg' },
  { color: '#3a6b73', name: 'Peter Teal', reason: '1.01:1 contrast on dark bg' },
];
