/**
 * Contextual Spacing Engine
 *
 * "Space is not emptiness. Space is the relationship between elements.
 * A heading needs to breathe differently than list items."
 * - Inspired by Ellen Lupton, Thinking with Type
 *
 * This system provides context-aware spacing that understands:
 * - Semantic relationships (heading → body vs item → item)
 * - Visual hierarchy (primary content vs supporting details)
 * - Emotional context (celebration needs air, crisis needs closeness)
 * - Device context (touch targets need more space)
 *
 * The magic: Spacing that "just feels right" without manual adjustment.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semantic relationship between elements
 */
export type SpacingRelationship =
  | 'none'              // No relationship (0 spacing)
  | 'tight'             // Closely related (same concept)
  | 'related'           // Related but distinct
  | 'section'           // Different sections
  | 'group'             // Group boundary
  | 'dramatic';         // Maximum separation for emphasis

/**
 * Content types for semantic spacing
 */
export type ContentType =
  | 'heading'
  | 'subheading'
  | 'body'
  | 'caption'
  | 'label'
  | 'button'
  | 'input'
  | 'list-item'
  | 'card'
  | 'divider'
  | 'icon'
  | 'avatar'
  | 'media';

/**
 * Emotional context affects spacing
 */
export type EmotionalContext =
  | 'neutral'           // Standard spacing
  | 'celebration'       // Expansive, breathing room
  | 'focus'             // Tighter, concentrated
  | 'calm'              // Generous, peaceful
  | 'urgent'            // Compact, immediate
  | 'intimate'          // Close, warm
  | 'contemplative';    // Extra breathing room

/**
 * Device context for touch targets
 */
export type DeviceContext =
  | 'desktop'           // Mouse precision
  | 'tablet'            // Touch with precision
  | 'mobile'            // Touch with thumb
  | 'watch';            // Minimal space

/**
 * Spacing configuration
 */
export interface SpacingConfig {
  /** Base unit in pixels (default: 8 - Material Design base) */
  baseUnit: number;
  /** Scale factor for emotional context */
  emotionalScale: number;
  /** Device context */
  device: DeviceContext;
  /** Current emotional context */
  emotion: EmotionalContext;
}

/**
 * Computed spacing result
 */
export interface SpacingResult {
  /** Spacing in pixels */
  px: number;
  /** Spacing in rem */
  rem: string;
  /** CSS custom property value */
  cssVar: string;
  /** Human-readable description */
  semantic: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base spacing scale (8px base unit, Fibonacci-influenced)
 */
const SPACING_SCALE = {
  0: 0,
  1: 4,      // 0.5 base - hairline
  2: 8,      // 1 base - tight
  3: 12,     // 1.5 base - compact
  4: 16,     // 2 base - standard
  5: 24,     // 3 base - comfortable
  6: 32,     // 4 base - spacious
  7: 48,     // 6 base - generous
  8: 64,     // 8 base - section
  9: 96,     // 12 base - dramatic
  10: 128,   // 16 base - maximum
} as const;

/**
 * Relationship to scale level mapping
 */
const RELATIONSHIP_LEVELS: Record<SpacingRelationship, keyof typeof SPACING_SCALE> = {
  none: 0,
  tight: 2,
  related: 4,
  section: 6,
  group: 7,
  dramatic: 9,
};

/**
 * Semantic spacing matrix: [from][to] = relationship
 * This encodes design knowledge about element relationships
 */
const SEMANTIC_MATRIX: Partial<Record<ContentType, Partial<Record<ContentType, SpacingRelationship>>>> = {
  heading: {
    subheading: 'tight',
    body: 'related',
    caption: 'tight',
    button: 'section',
    input: 'related',
    'list-item': 'related',
    card: 'section',
    divider: 'section',
  },
  subheading: {
    body: 'tight',
    caption: 'tight',
    button: 'related',
    'list-item': 'tight',
  },
  body: {
    body: 'tight',
    caption: 'tight',
    button: 'section',
    input: 'related',
    'list-item': 'related',
    heading: 'group',
  },
  button: {
    button: 'tight',
    body: 'related',
    input: 'tight',
  },
  input: {
    input: 'related',
    label: 'tight',
    button: 'related',
    caption: 'tight',
  },
  'list-item': {
    'list-item': 'tight',
  },
  card: {
    card: 'related',
    heading: 'section',
    body: 'section',
  },
  label: {
    input: 'tight',
    caption: 'none',
  },
};

/**
 * Emotional context multipliers
 */
const EMOTIONAL_MULTIPLIERS: Record<EmotionalContext, number> = {
  neutral: 1.0,
  celebration: 1.3,      // 30% more space for breathing
  focus: 0.85,           // 15% tighter for concentration
  calm: 1.2,             // 20% more for peace
  urgent: 0.75,          // 25% tighter for immediacy
  intimate: 0.9,         // 10% closer for warmth
  contemplative: 1.4,    // 40% more for reflection
};

/**
 * Device context adjustments
 */
const DEVICE_ADJUSTMENTS: Record<DeviceContext, { minTouchTarget: number; scale: number }> = {
  desktop: { minTouchTarget: 24, scale: 1.0 },
  tablet: { minTouchTarget: 44, scale: 1.1 },
  mobile: { minTouchTarget: 48, scale: 1.15 },
  watch: { minTouchTarget: 38, scale: 0.85 },
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let currentConfig: SpacingConfig = {
  baseUnit: 8,
  emotionalScale: 1.0,
  device: 'desktop',
  emotion: 'neutral',
};

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update spacing configuration
 */
export function setSpacingConfig(config: Partial<SpacingConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  applySpacingToRoot();
}

/**
 * Set emotional context
 */
export function setEmotionalContext(emotion: EmotionalContext): void {
  currentConfig.emotion = emotion;
  currentConfig.emotionalScale = EMOTIONAL_MULTIPLIERS[emotion];
  applySpacingToRoot();
}

/**
 * Set device context (usually auto-detected)
 */
export function setDeviceContext(device: DeviceContext): void {
  currentConfig.device = device;
  applySpacingToRoot();
}

/**
 * Get spacing between two content types
 */
export function getSpacingBetween(
  from: ContentType,
  to: ContentType
): SpacingResult {
  // Look up semantic relationship
  const relationship = SEMANTIC_MATRIX[from]?.[to] || 'related';
  const level = RELATIONSHIP_LEVELS[relationship];
  const basePixels = SPACING_SCALE[level];

  // Apply emotional and device modifiers
  const emotionalMultiplier = EMOTIONAL_MULTIPLIERS[currentConfig.emotion];
  const deviceScale = DEVICE_ADJUSTMENTS[currentConfig.device].scale;

  const finalPixels = Math.round(basePixels * emotionalMultiplier * deviceScale);

  return {
    px: finalPixels,
    rem: `${finalPixels / 16}rem`,
    cssVar: `var(--space-${level})`,
    semantic: `${from} → ${to}: ${relationship}`,
  };
}

/**
 * Get spacing for a relationship type
 */
export function getSpacingForRelationship(
  relationship: SpacingRelationship
): SpacingResult {
  const level = RELATIONSHIP_LEVELS[relationship];
  const basePixels = SPACING_SCALE[level];

  const emotionalMultiplier = EMOTIONAL_MULTIPLIERS[currentConfig.emotion];
  const deviceScale = DEVICE_ADJUSTMENTS[currentConfig.device].scale;

  const finalPixels = Math.round(basePixels * emotionalMultiplier * deviceScale);

  return {
    px: finalPixels,
    rem: `${finalPixels / 16}rem`,
    cssVar: `var(--space-${level})`,
    semantic: relationship,
  };
}

/**
 * Get minimum touch target size for current device
 */
export function getMinTouchTarget(): number {
  return DEVICE_ADJUSTMENTS[currentConfig.device].minTouchTarget;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Custom Properties
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply spacing to document root as CSS custom properties
 */
export function applySpacingToRoot(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const emotionalMultiplier = EMOTIONAL_MULTIPLIERS[currentConfig.emotion];
  const deviceScale = DEVICE_ADJUSTMENTS[currentConfig.device].scale;

  // Apply scaled spacing values
  Object.entries(SPACING_SCALE).forEach(([level, baseValue]) => {
    const scaledValue = Math.round(baseValue * emotionalMultiplier * deviceScale);
    root.style.setProperty(`--space-${level}`, `${scaledValue}px`);
    root.style.setProperty(`--space-${level}-rem`, `${scaledValue / 16}rem`);
  });

  // Apply context indicators
  root.style.setProperty('--spacing-emotion', currentConfig.emotion);
  root.style.setProperty('--spacing-device', currentConfig.device);
  root.style.setProperty('--spacing-scale', String(emotionalMultiplier * deviceScale));
  root.style.setProperty('--min-touch-target', `${getMinTouchTarget()}px`);
}

/**
 * Generate CSS for contextual spacing utility classes
 */
export function generateSpacingCSS(): string {
  const classes: string[] = [];

  // Relationship-based spacing
  Object.entries(RELATIONSHIP_LEVELS).forEach(([relationship, level]) => {
    classes.push(`
.space-${relationship} { margin-bottom: var(--space-${level}); }
.space-${relationship}-top { margin-top: var(--space-${level}); }
.gap-${relationship} { gap: var(--space-${level}); }
.p-${relationship} { padding: var(--space-${level}); }
    `);
  });

  // Content type spacing (auto-applies to next sibling)
  Object.keys(SEMANTIC_MATRIX).forEach((fromType) => {
    classes.push(`
.content-${fromType} + * { margin-top: var(--space-from-${fromType}, var(--space-4)); }
    `);
  });

  // Emotional modifiers
  Object.keys(EMOTIONAL_MULTIPLIERS).forEach((emotion) => {
    classes.push(`
.emotion-${emotion} { --spacing-scale: ${EMOTIONAL_MULTIPLIERS[emotion as EmotionalContext]}; }
    `);
  });

  return classes.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-detect device context from viewport
 */
export function detectDeviceContext(): DeviceContext {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  const hasTouch = 'ontouchstart' in window;

  if (width < 200) return 'watch';
  if (width < 768 && hasTouch) return 'mobile';
  if (width < 1024 && hasTouch) return 'tablet';
  return 'desktop';
}

/**
 * Initialize spacing system with auto-detection
 */
export function initContextualSpacing(): void {
  const device = detectDeviceContext();
  setDeviceContext(device);

  // Listen for viewport changes
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      const newDevice = detectDeviceContext();
      if (newDevice !== currentConfig.device) {
        setDeviceContext(newDevice);
      }
    });
  }
}

/**
 * Destroy spacing system
 */
export function destroyContextualSpacing(): void {
  // Reset to defaults
  currentConfig = {
    baseUnit: 8,
    emotionalScale: 1.0,
    device: 'desktop',
    emotion: 'neutral',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quick spacing lookup
 */
export const spacing = {
  between: getSpacingBetween,
  for: getSpacingForRelationship,
  touchTarget: getMinTouchTarget,
  setEmotion: setEmotionalContext,
  setDevice: setDeviceContext,
} as const;
