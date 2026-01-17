/**
 * Persona Typography Voice System
 *
 * Each AI persona has a distinct typographic voice that reflects their personality.
 * This creates visual differentiation beyond just color.
 *
 * Design Philosophy:
 * - Ferni: Warm, approachable - rounded, moderate weight
 * - Maya: Energetic, clear - crisp, slightly heavier
 * - Peter: Precise, analytical - structured, tabular numerals
 * - Jordan: Organized, optimistic - balanced, clean
 * - Alex: Professional, efficient - clean, compact
 * - Nayan: Deep, contemplative - spacious, light weight
 *
 * @module typography/persona-voice-type
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Persona identifiers.
 */
export type PersonaId = 'ferni' | 'maya' | 'peter' | 'jordan' | 'alex' | 'nayan';

/**
 * Typography profile for a persona.
 */
export interface PersonaTypography {
  /** Heading font weight */
  headingWeight: number;
  /** Body font weight */
  bodyWeight: number;
  /** Letter spacing multiplier (1.0 = normal) */
  letterSpacingMultiplier: number;
  /** Line height multiplier (1.0 = normal) */
  lineHeightMultiplier: number;
  /** Word spacing adjustment */
  wordSpacing: number;
  /** Font feature settings */
  fontFeatures: string;
  /** Typography style description */
  style: string;
  /** When this persona "speaks", how should text feel? */
  voiceDescription: string;
}

/**
 * Complete persona type configuration.
 */
export interface PersonaTypeConfig {
  id: PersonaId;
  name: string;
  typography: PersonaTypography;
  /** CSS class to apply */
  className: string;
  /** Transition duration when switching to this persona */
  transitionDuration: number;
}

// ============================================================================
// CONSTANTS (from typography-emotional.json and personas.json tokens)
// ============================================================================

/**
 * Base typography values.
 * All persona values are relative to these.
 */
const BASE_TYPOGRAPHY = {
  headingWeight: 450,
  bodyWeight: 380,
  letterSpacing: 0,
  lineHeight: 1.6,
  wordSpacing: 0,
};

/**
 * Typography profiles for each persona.
 */
export const PERSONA_TYPOGRAPHY: Record<PersonaId, PersonaTypography> = {
  ferni: {
    headingWeight: 450,
    bodyWeight: 360,
    letterSpacingMultiplier: 1.05,
    lineHeightMultiplier: 1.1,
    wordSpacing: 0.5,
    fontFeatures: '"calt" on, "liga" on',
    style: 'Rounded',
    voiceDescription: 'Warm and approachable, like a close friend speaking gently',
  },
  maya: {
    headingWeight: 550,
    bodyWeight: 400,
    letterSpacingMultiplier: 0.95,
    lineHeightMultiplier: 1.05,
    wordSpacing: 0,
    fontFeatures: '"calt" on, "ss01" on',
    style: 'Crisp',
    voiceDescription: 'Energetic and motivating, like a supportive coach',
  },
  peter: {
    headingWeight: 500,
    bodyWeight: 400,
    letterSpacingMultiplier: 0.98,
    lineHeightMultiplier: 1.0,
    wordSpacing: -0.2,
    fontFeatures: '"tnum" on, "calt" on',
    style: 'Structured',
    voiceDescription: 'Precise and analytical, like a thoughtful researcher',
  },
  jordan: {
    headingWeight: 500,
    bodyWeight: 380,
    letterSpacingMultiplier: 1.0,
    lineHeightMultiplier: 1.05,
    wordSpacing: 0.2,
    fontFeatures: '"calt" on, "liga" on',
    style: 'Balanced',
    voiceDescription: 'Organized and optimistic, like a reliable planner',
  },
  alex: {
    headingWeight: 500,
    bodyWeight: 400,
    letterSpacingMultiplier: 0.97,
    lineHeightMultiplier: 1.0,
    wordSpacing: -0.1,
    fontFeatures: '"calt" on',
    style: 'Clean',
    voiceDescription: 'Professional and efficient, like a capable assistant',
  },
  nayan: {
    headingWeight: 400,
    bodyWeight: 350,
    letterSpacingMultiplier: 1.1,
    lineHeightMultiplier: 1.15,
    wordSpacing: 1.0,
    fontFeatures: '"calt" on, "liga" on, "onum" on',
    style: 'Spacious',
    voiceDescription: 'Deep and contemplative, like a wise mentor',
  },
};

/**
 * Full persona type configurations.
 */
export const PERSONA_CONFIGS: Record<PersonaId, PersonaTypeConfig> = {
  ferni: {
    id: 'ferni',
    name: 'Ferni',
    typography: PERSONA_TYPOGRAPHY.ferni,
    className: 'persona-type-ferni',
    transitionDuration: 400,
  },
  maya: {
    id: 'maya',
    name: 'Maya',
    typography: PERSONA_TYPOGRAPHY.maya,
    className: 'persona-type-maya',
    transitionDuration: 350,
  },
  peter: {
    id: 'peter',
    name: 'Peter',
    typography: PERSONA_TYPOGRAPHY.peter,
    className: 'persona-type-peter',
    transitionDuration: 400,
  },
  jordan: {
    id: 'jordan',
    name: 'Jordan',
    typography: PERSONA_TYPOGRAPHY.jordan,
    className: 'persona-type-jordan',
    transitionDuration: 380,
  },
  alex: {
    id: 'alex',
    name: 'Alex',
    typography: PERSONA_TYPOGRAPHY.alex,
    className: 'persona-type-alex',
    transitionDuration: 350,
  },
  nayan: {
    id: 'nayan',
    name: 'Nayan',
    typography: PERSONA_TYPOGRAPHY.nayan,
    className: 'persona-type-nayan',
    transitionDuration: 500,
  },
};

/**
 * Persona transition duration matrix (ms).
 * Some transitions feel better slower/faster.
 */
const PERSONA_TRANSITIONS: Partial<Record<PersonaId, Partial<Record<PersonaId, number>>>> = {
  ferni: {
    maya: 400,
    nayan: 600,
  },
  maya: {
    nayan: 700,
    peter: 400,
  },
  nayan: {
    maya: 700,
    alex: 600,
  },
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/** Current active persona */
let currentPersona: PersonaId = 'ferni';

/** Elements with persona typography */
const personaElements = new Map<HTMLElement, PersonaId>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get typography profile for a persona.
 *
 * @param persona - Persona identifier
 * @returns Typography profile
 */
export function getPersonaTypography(persona: PersonaId): PersonaTypography {
  return PERSONA_TYPOGRAPHY[persona];
}

/**
 * Get full configuration for a persona.
 *
 * @param persona - Persona identifier
 * @returns Full configuration
 */
export function getPersonaConfig(persona: PersonaId): PersonaTypeConfig {
  return PERSONA_CONFIGS[persona];
}

/**
 * Apply persona typography to an element.
 *
 * @param element - Target element
 * @param persona - Persona to apply
 * @param options - Optional configuration
 * @returns Cleanup function
 */
export function applyPersonaTypography(
  element: HTMLElement,
  persona: PersonaId,
  options: {
    type?: 'heading' | 'body';
    transition?: boolean;
    duration?: number;
  } = {}
): () => void {
  const { type = 'body', transition = true, duration } = options;
  const typography = PERSONA_TYPOGRAPHY[persona];
  const config = PERSONA_CONFIGS[persona];

  // Track element
  personaElements.set(element, persona);

  // Calculate actual values
  const baseLetterSpacing = BASE_TYPOGRAPHY.letterSpacing;
  const baseLineHeight = BASE_TYPOGRAPHY.lineHeight;

  const letterSpacing = baseLetterSpacing * typography.letterSpacingMultiplier;
  const lineHeight = baseLineHeight * typography.lineHeightMultiplier;
  const weight = type === 'heading' ? typography.headingWeight : typography.bodyWeight;

  // Apply transition if enabled
  if (transition) {
    const transitionDuration = duration ?? config.transitionDuration;
    element.style.transition = `
      font-weight ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1),
      letter-spacing ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1),
      line-height ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1),
      word-spacing ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)
    `.replace(/\s+/g, ' ').trim();
  }

  // Apply typography
  element.style.fontWeight = String(weight);
  element.style.letterSpacing = `${letterSpacing}em`;
  element.style.lineHeight = String(lineHeight);
  element.style.wordSpacing = `${typography.wordSpacing}px`;
  element.style.fontFeatureSettings = typography.fontFeatures;

  // Add class for additional styling
  element.classList.add(config.className);

  // Return cleanup function
  return () => removePersonaTypography(element);
}

/**
 * Remove persona typography from an element.
 */
export function removePersonaTypography(element: HTMLElement): void {
  const persona = personaElements.get(element);
  if (!persona) return;

  const config = PERSONA_CONFIGS[persona];

  // Remove styles
  element.style.fontWeight = '';
  element.style.letterSpacing = '';
  element.style.lineHeight = '';
  element.style.wordSpacing = '';
  element.style.fontFeatureSettings = '';
  element.style.transition = '';

  // Remove class
  element.classList.remove(config.className);

  personaElements.delete(element);
}

/**
 * Transition element to a new persona.
 *
 * @param element - Target element
 * @param newPersona - New persona to transition to
 * @param options - Transition options
 */
export function transitionPersonaTypography(
  element: HTMLElement,
  newPersona: PersonaId,
  options: {
    type?: 'heading' | 'body';
  } = {}
): void {
  const currentPersona = personaElements.get(element) ?? 'ferni';

  // Get appropriate transition duration
  const duration =
    PERSONA_TRANSITIONS[currentPersona]?.[newPersona] ??
    PERSONA_TRANSITIONS[newPersona]?.[currentPersona] ??
    PERSONA_CONFIGS[newPersona].transitionDuration;

  // Remove old class before adding new one
  const oldConfig = PERSONA_CONFIGS[currentPersona];
  element.classList.remove(oldConfig.className);

  // Apply new persona
  applyPersonaTypography(element, newPersona, {
    type: options.type,
    transition: true,
    duration,
  });
}

// ============================================================================
// GLOBAL PERSONA SWITCHING
// ============================================================================

/**
 * Set the active persona globally.
 * Updates CSS custom properties on :root.
 */
export function setActivePersona(persona: PersonaId): void {
  currentPersona = persona;
  const typography = PERSONA_TYPOGRAPHY[persona];

  // Update CSS custom properties on root
  const root = document.documentElement;

  root.style.setProperty('--persona-heading-weight', String(typography.headingWeight));
  root.style.setProperty('--persona-body-weight', String(typography.bodyWeight));
  root.style.setProperty('--persona-letter-spacing-mult', String(typography.letterSpacingMultiplier));
  root.style.setProperty('--persona-line-height-mult', String(typography.lineHeightMultiplier));
  root.style.setProperty('--persona-word-spacing', `${typography.wordSpacing}px`);
  root.style.setProperty('--persona-font-features', typography.fontFeatures);

  // Update body class
  const personas = Object.keys(PERSONA_CONFIGS) as PersonaId[];
  personas.forEach(p => {
    document.body.classList.remove(`persona-${p}-active`);
  });
  document.body.classList.add(`persona-${persona}-active`);

  // Dispatch event for listeners
  window.dispatchEvent(new CustomEvent('personachange', {
    detail: { persona, typography },
  }));
}

/**
 * Get the currently active persona.
 */
export function getActivePersona(): PersonaId {
  return currentPersona;
}

// ============================================================================
// CSS GENERATION
// ============================================================================

/**
 * Generate CSS for all persona typography.
 */
export function generatePersonaTypographyCSS(): string {
  const personas = Object.entries(PERSONA_CONFIGS) as [PersonaId, PersonaTypeConfig][];

  const personaStyles = personas.map(([id, config]) => {
    const typo = config.typography;
    return `
/* ${config.name} - ${typo.style}: ${typo.voiceDescription} */
.${config.className},
.persona-${id}-active .persona-typography {
  --persona-heading-weight: ${typo.headingWeight};
  --persona-body-weight: ${typo.bodyWeight};
  --persona-letter-spacing: ${(BASE_TYPOGRAPHY.letterSpacing * typo.letterSpacingMultiplier).toFixed(3)}em;
  --persona-line-height: ${(BASE_TYPOGRAPHY.lineHeight * typo.lineHeightMultiplier).toFixed(2)};
  --persona-word-spacing: ${typo.wordSpacing}px;
  --persona-font-features: ${typo.fontFeatures};
}

.${config.className} h1,
.${config.className} h2,
.${config.className} h3,
.${config.className} .heading {
  font-weight: var(--persona-heading-weight, ${typo.headingWeight});
  letter-spacing: var(--persona-letter-spacing);
  line-height: var(--persona-line-height);
  font-feature-settings: var(--persona-font-features);
}

.${config.className} p,
.${config.className} span,
.${config.className} .body {
  font-weight: var(--persona-body-weight, ${typo.bodyWeight});
  letter-spacing: var(--persona-letter-spacing);
  line-height: var(--persona-line-height);
  word-spacing: var(--persona-word-spacing);
  font-feature-settings: var(--persona-font-features);
}
`.trim();
  }).join('\n\n');

  return `
/* Persona Typography System - Generated */
/* Each AI persona has a distinct typographic voice */

:root {
  --persona-transition-duration: 400ms;
  --persona-transition-easing: cubic-bezier(0.4, 0, 0.2, 1);
}

.persona-typography {
  transition:
    font-weight var(--persona-transition-duration) var(--persona-transition-easing),
    letter-spacing var(--persona-transition-duration) var(--persona-transition-easing),
    line-height var(--persona-transition-duration) var(--persona-transition-easing),
    word-spacing var(--persona-transition-duration) var(--persona-transition-easing);
}

${personaStyles}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .persona-typography {
    transition: none;
  }
}
`.trim();
}

/**
 * Inject persona typography CSS into document.
 */
export function injectPersonaTypographyStyles(): HTMLStyleElement {
  const styleId = 'persona-typography-styles';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  style.textContent = generatePersonaTypographyCSS();
  return style;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get persona for an element.
 */
export function getElementPersona(element: HTMLElement): PersonaId | null {
  return personaElements.get(element) ?? null;
}

/**
 * Check if element has persona typography.
 */
export function hasPersonaTypography(element: HTMLElement): boolean {
  return personaElements.has(element);
}

/**
 * Get all available personas.
 */
export function getAvailablePersonas(): PersonaId[] {
  return Object.keys(PERSONA_CONFIGS) as PersonaId[];
}

/**
 * Get typography description for a persona.
 * Useful for UI display.
 */
export function getPersonaDescription(persona: PersonaId): {
  name: string;
  style: string;
  voiceDescription: string;
} {
  const config = PERSONA_CONFIGS[persona];
  return {
    name: config.name,
    style: config.typography.style,
    voiceDescription: config.typography.voiceDescription,
  };
}
