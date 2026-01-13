/**
 * Mood-Weight Typography Mapping
 *
 * Maps emotional states to typographic properties - font weight, letter spacing,
 * line height. This creates subliminal emotional resonance in text.
 *
 * Design Principles:
 * - Heavier weights for energized/stressed states
 * - Lighter weights for calm/peaceful states
 * - Increased letter spacing for contemplative moods
 * - Tighter spacing for focused/urgent states
 * - All values are subtle - typography should whisper, not shout
 *
 * @module typography/mood-weight
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Mood states that affect typography.
 */
export type TypographyMood =
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
 * Typography properties for a mood.
 */
export interface MoodTypography {
  /** Heading font weight (variable font: 100-900) */
  headingWeight: number;
  /** Body font weight (variable font: 100-900) */
  bodyWeight: number;
  /** Letter spacing adjustment in pixels */
  letterSpacing: number;
  /** Line height multiplier */
  lineHeight: number;
  /** Word spacing adjustment in pixels */
  wordSpacing: number;
  /** Font feature settings (OpenType features) */
  fontFeatures?: string;
}

/**
 * Typography transition configuration.
 */
export interface MoodTransitionConfig {
  /** Duration of transition in ms */
  duration: number;
  /** Easing function */
  easing: string;
  /** Properties to transition */
  properties: (keyof MoodTypography)[];
}

/**
 * Element with mood typography applied.
 */
export interface MoodTypographyElement {
  element: HTMLElement;
  currentMood: TypographyMood;
  originalStyles: Partial<CSSStyleDeclaration>;
}

// ============================================================================
// CONSTANTS (from typography-emotional.json tokens)
// ============================================================================

/**
 * Typography mappings for each mood.
 *
 * These values are carefully tuned:
 * - Weight changes are subtle (±50 from base 400)
 * - Letter spacing: positive = spacious, negative = tight
 * - Line height: higher = more breathing room
 */
export const MOOD_TYPOGRAPHY: Record<TypographyMood, MoodTypography> = {
  calm: {
    headingWeight: 450,
    bodyWeight: 350,
    letterSpacing: 0.3,
    lineHeight: 1.65,
    wordSpacing: 0.5,
    fontFeatures: '"calt" on, "liga" on',
  },
  joyful: {
    headingWeight: 550,
    bodyWeight: 400,
    letterSpacing: 0.2,
    lineHeight: 1.6,
    wordSpacing: 0.3,
    fontFeatures: '"calt" on, "liga" on, "ss01" on',
  },
  anxious: {
    headingWeight: 420,
    bodyWeight: 380,
    letterSpacing: 0,
    lineHeight: 1.55,
    wordSpacing: 0,
  },
  tired: {
    headingWeight: 380,
    bodyWeight: 350,
    letterSpacing: 0.4,
    lineHeight: 1.7,
    wordSpacing: 0.8,
  },
  focused: {
    headingWeight: 500,
    bodyWeight: 400,
    letterSpacing: -0.2,
    lineHeight: 1.5,
    wordSpacing: -0.2,
    fontFeatures: '"tnum" on, "calt" on',
  },
  reflective: {
    headingWeight: 420,
    bodyWeight: 360,
    letterSpacing: 0.5,
    lineHeight: 1.75,
    wordSpacing: 1.0,
    fontFeatures: '"calt" on, "liga" on, "onum" on',
  },
  stressed: {
    headingWeight: 480,
    bodyWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.5,
    wordSpacing: 0,
  },
  energized: {
    headingWeight: 600,
    bodyWeight: 420,
    letterSpacing: -0.3,
    lineHeight: 1.45,
    wordSpacing: -0.3,
    fontFeatures: '"calt" on, "ss01" on',
  },
  peaceful: {
    headingWeight: 380,
    bodyWeight: 340,
    letterSpacing: 0.6,
    lineHeight: 1.8,
    wordSpacing: 1.2,
    fontFeatures: '"calt" on, "liga" on',
  },
};

/**
 * Default transition configuration.
 */
const DEFAULT_TRANSITION: MoodTransitionConfig = {
  duration: 400,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)', // Material ease-in-out
  properties: ['headingWeight', 'bodyWeight', 'letterSpacing', 'lineHeight', 'wordSpacing'],
};

/**
 * Mood-to-mood transition durations (ms).
 * Transitions between similar moods are faster.
 */
const MOOD_TRANSITION_DURATIONS: Partial<Record<TypographyMood, Partial<Record<TypographyMood, number>>>> = {
  calm: {
    peaceful: 300,
    reflective: 350,
    focused: 400,
    anxious: 600,
    stressed: 700,
  },
  energized: {
    joyful: 300,
    focused: 350,
    tired: 800,
    peaceful: 900,
  },
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/** Tracked elements with mood typography */
const trackedElements = new Map<HTMLElement, MoodTypographyElement>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get typography properties for a mood.
 *
 * @param mood - The mood state
 * @returns Typography properties
 *
 * @example
 * ```typescript
 * const { headingWeight, letterSpacing } = getMoodTypography('calm');
 * // headingWeight: 450, letterSpacing: 0.3
 * ```
 */
export function getMoodTypography(mood: TypographyMood): MoodTypography {
  return MOOD_TYPOGRAPHY[mood];
}

/**
 * Apply mood typography to an element.
 *
 * @param element - Target element
 * @param mood - Mood to apply
 * @param options - Optional configuration
 * @returns Cleanup function
 *
 * @example
 * ```typescript
 * const cleanup = applyMoodTypography(
 *   document.querySelector('.hero-text'),
 *   'calm',
 *   { type: 'heading' }
 * );
 * ```
 */
export function applyMoodTypography(
  element: HTMLElement,
  mood: TypographyMood,
  options: {
    type?: 'heading' | 'body';
    transition?: boolean;
    transitionConfig?: Partial<MoodTransitionConfig>;
  } = {}
): () => void {
  const { type = 'body', transition = true, transitionConfig } = options;
  const typography = MOOD_TYPOGRAPHY[mood];

  // Store original styles for cleanup
  const originalStyles: Partial<CSSStyleDeclaration> = {
    fontWeight: element.style.fontWeight,
    letterSpacing: element.style.letterSpacing,
    lineHeight: element.style.lineHeight,
    wordSpacing: element.style.wordSpacing,
    fontFeatureSettings: element.style.fontFeatureSettings,
    transition: element.style.transition,
  };

  // Track element
  trackedElements.set(element, {
    element,
    currentMood: mood,
    originalStyles,
  });

  // Apply transition if enabled
  if (transition) {
    const config = { ...DEFAULT_TRANSITION, ...transitionConfig };
    element.style.transition = `
      font-weight ${config.duration}ms ${config.easing},
      letter-spacing ${config.duration}ms ${config.easing},
      line-height ${config.duration}ms ${config.easing},
      word-spacing ${config.duration}ms ${config.easing}
    `.replace(/\s+/g, ' ').trim();
  }

  // Apply typography
  const weight = type === 'heading' ? typography.headingWeight : typography.bodyWeight;
  element.style.fontWeight = String(weight);
  element.style.letterSpacing = `${typography.letterSpacing}px`;
  element.style.lineHeight = String(typography.lineHeight);
  element.style.wordSpacing = `${typography.wordSpacing}px`;

  if (typography.fontFeatures) {
    element.style.fontFeatureSettings = typography.fontFeatures;
  }

  // Return cleanup function
  return () => removeMoodTypography(element);
}

/**
 * Remove mood typography from an element.
 */
export function removeMoodTypography(element: HTMLElement): void {
  const tracked = trackedElements.get(element);
  if (!tracked) return;

  // Restore original styles
  const { originalStyles } = tracked;
  element.style.fontWeight = originalStyles.fontWeight || '';
  element.style.letterSpacing = originalStyles.letterSpacing || '';
  element.style.lineHeight = originalStyles.lineHeight || '';
  element.style.wordSpacing = originalStyles.wordSpacing || '';
  element.style.fontFeatureSettings = originalStyles.fontFeatureSettings || '';
  element.style.transition = originalStyles.transition || '';

  trackedElements.delete(element);
}

/**
 * Transition element to a new mood.
 *
 * @param element - Target element
 * @param newMood - New mood to transition to
 * @param options - Transition options
 */
export function transitionMoodTypography(
  element: HTMLElement,
  newMood: TypographyMood,
  options: {
    type?: 'heading' | 'body';
    duration?: number;
  } = {}
): void {
  const tracked = trackedElements.get(element);
  const currentMood = tracked?.currentMood ?? 'calm';

  // Calculate appropriate transition duration
  const baseDuration = options.duration ??
    MOOD_TRANSITION_DURATIONS[currentMood]?.[newMood] ??
    DEFAULT_TRANSITION.duration;

  // Re-apply with new mood
  applyMoodTypography(element, newMood, {
    type: options.type,
    transition: true,
    transitionConfig: { duration: baseDuration },
  });
}

// ============================================================================
// CSS GENERATION
// ============================================================================

/**
 * Generate CSS custom properties for a mood.
 */
export function generateMoodTypographyVars(mood: TypographyMood): string {
  const typography = MOOD_TYPOGRAPHY[mood];

  return `
  --mood-heading-weight: ${typography.headingWeight};
  --mood-body-weight: ${typography.bodyWeight};
  --mood-letter-spacing: ${typography.letterSpacing}px;
  --mood-line-height: ${typography.lineHeight};
  --mood-word-spacing: ${typography.wordSpacing}px;
  ${typography.fontFeatures ? `--mood-font-features: ${typography.fontFeatures};` : ''}
`.trim();
}

/**
 * Generate full CSS for mood typography system.
 */
export function generateMoodTypographyCSS(): string {
  const moods = Object.keys(MOOD_TYPOGRAPHY) as TypographyMood[];

  const moodClasses = moods.map(mood => {
    const typography = MOOD_TYPOGRAPHY[mood];
    return `
.mood-typography--${mood} {
  ${generateMoodTypographyVars(mood)}
}

.mood-typography--${mood} h1,
.mood-typography--${mood} h2,
.mood-typography--${mood} h3 {
  font-weight: var(--mood-heading-weight, ${typography.headingWeight});
  letter-spacing: var(--mood-letter-spacing, ${typography.letterSpacing}px);
  line-height: var(--mood-line-height, ${typography.lineHeight});
}

.mood-typography--${mood} p,
.mood-typography--${mood} span,
.mood-typography--${mood} .body-text {
  font-weight: var(--mood-body-weight, ${typography.bodyWeight});
  letter-spacing: var(--mood-letter-spacing, ${typography.letterSpacing}px);
  line-height: var(--mood-line-height, ${typography.lineHeight});
  word-spacing: var(--mood-word-spacing, ${typography.wordSpacing}px);
}
`.trim();
  }).join('\n\n');

  return `
/* Mood Typography System - Generated */
/* "Better Than Human" - Typography that responds to emotion */

:root {
  --mood-transition-duration: ${DEFAULT_TRANSITION.duration}ms;
  --mood-transition-easing: ${DEFAULT_TRANSITION.easing};
}

.mood-typography {
  transition:
    font-weight var(--mood-transition-duration) var(--mood-transition-easing),
    letter-spacing var(--mood-transition-duration) var(--mood-transition-easing),
    line-height var(--mood-transition-duration) var(--mood-transition-easing),
    word-spacing var(--mood-transition-duration) var(--mood-transition-easing);
}

${moodClasses}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .mood-typography {
    transition: none;
  }
}
`.trim();
}

/**
 * Inject mood typography CSS into document.
 */
export function injectMoodTypographyStyles(): HTMLStyleElement {
  const styleId = 'mood-typography-styles';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  style.textContent = generateMoodTypographyCSS();
  return style;
}

// ============================================================================
// INTERPOLATION
// ============================================================================

/**
 * Interpolate between two mood typographies.
 * Useful for smooth transitions or blended states.
 *
 * @param from - Starting mood
 * @param to - Target mood
 * @param progress - Interpolation progress (0-1)
 * @returns Interpolated typography
 */
export function interpolateMoodTypography(
  from: TypographyMood,
  to: TypographyMood,
  progress: number
): MoodTypography {
  const fromTypo = MOOD_TYPOGRAPHY[from];
  const toTypo = MOOD_TYPOGRAPHY[to];

  const lerp = (a: number, b: number) => a + (b - a) * progress;

  return {
    headingWeight: Math.round(lerp(fromTypo.headingWeight, toTypo.headingWeight)),
    bodyWeight: Math.round(lerp(fromTypo.bodyWeight, toTypo.bodyWeight)),
    letterSpacing: lerp(fromTypo.letterSpacing, toTypo.letterSpacing),
    lineHeight: lerp(fromTypo.lineHeight, toTypo.lineHeight),
    wordSpacing: lerp(fromTypo.wordSpacing, toTypo.wordSpacing),
    fontFeatures: progress < 0.5 ? fromTypo.fontFeatures : toTypo.fontFeatures,
  };
}

/**
 * Apply interpolated typography directly to an element.
 */
export function applyInterpolatedTypography(
  element: HTMLElement,
  from: TypographyMood,
  to: TypographyMood,
  progress: number,
  type: 'heading' | 'body' = 'body'
): void {
  const typography = interpolateMoodTypography(from, to, progress);
  const weight = type === 'heading' ? typography.headingWeight : typography.bodyWeight;

  element.style.fontWeight = String(weight);
  element.style.letterSpacing = `${typography.letterSpacing}px`;
  element.style.lineHeight = String(typography.lineHeight);
  element.style.wordSpacing = `${typography.wordSpacing}px`;

  if (typography.fontFeatures) {
    element.style.fontFeatureSettings = typography.fontFeatures;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get current mood typography for an element.
 */
export function getCurrentMoodTypography(element: HTMLElement): TypographyMood | null {
  const tracked = trackedElements.get(element);
  return tracked?.currentMood ?? null;
}

/**
 * Check if element has mood typography applied.
 */
export function hasMoodTypography(element: HTMLElement): boolean {
  return trackedElements.has(element);
}

/**
 * Get all tracked elements.
 */
export function getTrackedElements(): HTMLElement[] {
  return Array.from(trackedElements.keys());
}
