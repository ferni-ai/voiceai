/**
 * Ferni Design Tokens for React
 * 
 * These tokens are derived from the design-system source of truth.
 * When the design system is built, these should be imported from:
 * - design-system/dist/tokens.css (CSS variables)
 * - design-system/tokens/*.json (raw token values)
 * 
 * For now, we inline the canonical values to enable standalone use.
 * Keep in sync with: design-system/tokens/colors.json, personas.json, animation.json
 */

// =============================================================================
// PERSONA COLORS
// Source: design-system/tokens/personas.json
// =============================================================================

export const personas = {
  ferni: {
    id: 'ferni' as const,
    name: 'Ferni',
    role: 'Life Coach',
    colors: {
      primary: '#4a6741',
      secondary: '#3d5a35',
      glow: 'rgba(74, 103, 65, 0.3)',
      tint: 'rgba(74, 103, 65, 0.1)',
    },
    animation: {
      timingMultiplier: 1.0,
      easingPreference: 'gentle' as const,
    },
  },
  peter: {
    id: 'peter' as const,
    name: 'Peter',
    role: 'Researcher',
    colors: {
      primary: '#3a6b73',
      secondary: '#2d5359',
      glow: 'rgba(58, 107, 115, 0.3)',
      tint: 'rgba(58, 107, 115, 0.1)',
    },
    animation: {
      timingMultiplier: 0.85,
      easingPreference: 'snappy' as const,
    },
  },
  alex: {
    id: 'alex' as const,
    name: 'Alex',
    role: 'Communicator',
    colors: {
      primary: '#5a6b8a',
      secondary: '#4a5a73',
      glow: 'rgba(90, 107, 138, 0.3)',
      tint: 'rgba(90, 107, 138, 0.1)',
    },
    animation: {
      timingMultiplier: 1.0,
      easingPreference: 'standard' as const,
    },
  },
  maya: {
    id: 'maya' as const,
    name: 'Maya',
    role: 'Habit Architect',
    colors: {
      primary: '#a67a6a',
      secondary: '#8a635a',
      glow: 'rgba(166, 122, 106, 0.3)',
      tint: 'rgba(166, 122, 106, 0.1)',
    },
    animation: {
      timingMultiplier: 0.95,
      easingPreference: 'gentle' as const,
    },
  },
  jordan: {
    id: 'jordan' as const,
    name: 'Jordan',
    role: 'Celebration Catalyst',
    colors: {
      primary: '#c4856a',
      secondary: '#a86d55',
      glow: 'rgba(196, 133, 106, 0.3)',
      tint: 'rgba(196, 133, 106, 0.1)',
    },
    animation: {
      timingMultiplier: 0.8,
      easingPreference: 'spring' as const,
    },
  },
  nayan: {
    id: 'nayan' as const,
    name: 'Nayan',
    role: 'Wisdom Guide',
    colors: {
      primary: '#b8956a',
      secondary: '#9a7a52',
      glow: 'rgba(184, 149, 106, 0.3)',
      tint: 'rgba(184, 149, 106, 0.1)',
    },
    animation: {
      timingMultiplier: 1.1,
      easingPreference: 'gentle' as const,
    },
  },
} as const;

export type PersonaId = keyof typeof personas;

// =============================================================================
// SEMANTIC COLORS
// Source: design-system/tokens/colors.json
// =============================================================================

export const colors = {
  // Persona primaries (shortcuts)
  ferni: '#4a6741',
  peter: '#3a6b73',
  alex: '#5a6b8a',
  maya: '#a67a6a',
  jordan: '#c4856a',
  nayan: '#b8956a',

  // Text
  textPrimary: '#2C2520',
  textSecondary: '#5C544A',
  textMuted: '#8A847A',

  // Backgrounds
  background: '#FFFCF8',
  backgroundElevated: '#FFFFFF',
  backgroundSubtle: '#F5F1E8',

  // Status
  success: '#4a6741',
  warning: '#a08054',
  error: '#a05454',
  info: '#546080',

  // Borders
  border: 'rgba(44, 37, 32, 0.1)',
  borderMedium: 'rgba(44, 37, 32, 0.15)',
} as const;

// =============================================================================
// SPACING
// Source: design-system/tokens/spacing.json
// =============================================================================

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

// =============================================================================
// DURATION
// Source: design-system/tokens/animation.json
// =============================================================================

export const duration = {
  instant: 50,
  faster: 100,
  fast: 150,
  normal: 250,
  slow: 400,
  slower: 500,
  deliberate: 600,
  dramatic: 800,
  celebration: 1000,
  glacial: 1500,
} as const;

// =============================================================================
// EASING
// Source: design-system/tokens/animation.json
// =============================================================================

export const easing = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  springGentle: 'cubic-bezier(0.34, 1.2, 0.64, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
  gentle: 'cubic-bezier(0.4, 0, 0.6, 1)',
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  anticipate: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

// =============================================================================
// TYPOGRAPHY
// Source: design-system/tokens/typography.json
// =============================================================================

export const typography = {
  fontFamily: {
    body: "'Inter', system-ui, -apple-system, sans-serif",
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.1,
    snug: 1.25,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
} as const;

// =============================================================================
// SHADOWS
// Source: design-system/tokens/effects.json
// =============================================================================

export const shadow = {
  sm: '0 1px 2px rgba(44, 37, 32, 0.05)',
  md: '0 4px 6px rgba(44, 37, 32, 0.07)',
  lg: '0 10px 15px rgba(44, 37, 32, 0.1)',
  xl: '0 20px 25px rgba(44, 37, 32, 0.1)',
  '2xl': '0 25px 50px rgba(44, 37, 32, 0.15)',
  glow: '0 0 20px rgba(74, 103, 65, 0.3)',
  glowStrong: '0 0 40px rgba(74, 103, 65, 0.4)',
} as const;

// =============================================================================
// RADIUS
// Source: design-system/tokens/shape.json
// =============================================================================

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  full: '9999px',
} as const;

// =============================================================================
// Z-INDEX
// =============================================================================

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 300,
  popover: 400,
  toast: 500,
  tooltip: 600,
} as const;

// =============================================================================
// MICRO-EXPRESSIONS (Ferni EQ)
// Source: design-system/tokens/expressions.json
// =============================================================================

export const microExpressions = {
  recognition: { duration: 80, intensity: 0.4 },
  concernFlash: { duration: 60, intensity: 0.3 },
  delightFlash: { duration: 100, intensity: 0.5 },
  warmthPulse: { duration: 120, intensity: 0.3 },
  interestFlash: { duration: 70, intensity: 0.4 },
} as const;

// =============================================================================
// ACTIVE LISTENING (Ferni EQ)
// Source: design-system/tokens/expressions.json
// =============================================================================

export const activeListening = {
  microNod: { y: 1.5, duration: 180 },
  subtleNod: { y: 2.5, duration: 220 },
  visibleNod: { y: 4, duration: 280 },
} as const;

// =============================================================================
// CELEBRATION COLORS
// Source: design-system/tokens/colors.json
// =============================================================================

export const celebrationColors = {
  smallWin: ['#4a6741', '#6b8a5f', '#8ba97d'],
  bigWin: ['#4a6741', '#c4856a', '#FFD700', '#FF69B4'],
  milestone: ['#FFD700', '#FFA500', '#FF6347', '#4a6741'],
  streak: ['#4a6741', '#3a6b73', '#5a6b8a'],
  teamUnlock: ['#4a6741', '#3a6b73', '#5a6b8a', '#a67a6a', '#c4856a', '#b8956a'],
} as const;
