/**
 * Persona Color Harmony System
 *
 * Implements Josef Albers' "Interaction of Color" principles for smooth
 * transitions between personas. Colors influence each other when adjacent,
 * requiring harmonic bridge colors for smooth handoffs.
 *
 * "In visual perception a color is almost never seen as it really is.
 * Color deceives continually." - Josef Albers
 *
 * @module color/persona-harmony
 */

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId = 'ferni' | 'maya' | 'peter' | 'jordan' | 'alex' | 'nayan';

/**
 * HSL color representation for precise color manipulation.
 */
export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/**
 * A single step in a color transition sequence.
 */
export interface TransitionStep {
  /** Color at this step (hex) */
  color: string;
  /** HSL values */
  hsl: HSLColor;
  /** Progress through transition (0-1) */
  progress: number;
  /** Optional label for this step */
  label?: string;
}

/**
 * Complete transition data between two personas.
 */
export interface PersonaTransition {
  /** Source persona */
  from: PersonaId;
  /** Target persona */
  to: PersonaId;
  /** Primary color transition steps */
  colorSteps: TransitionStep[];
  /** The harmonic bridge color (middle ground) */
  bridgeColor: string;
  /** Recommended transition duration (ms) based on color distance */
  duration: number;
  /** Color distance metric (0-1, higher = more different) */
  colorDistance: number;
  /** CSS keyframes string for animation */
  cssKeyframes: string;
  /** CSS variables for the transition */
  cssVariables: Record<string, string>;
}

/**
 * Configuration for transition calculation.
 */
export interface TransitionConfig {
  /** Number of intermediate steps (more = smoother) */
  steps?: number;
  /** Base duration in ms (scaled by color distance) */
  baseDuration?: number;
  /** Minimum duration in ms */
  minDuration?: number;
  /** Maximum duration in ms */
  maxDuration?: number;
  /** Easing function name */
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/**
 * Simultaneous contrast effect parameters.
 */
export interface ContrastEffect {
  /** The perceived color shift */
  perceivedShift: HSLColor;
  /** Magnitude of the effect (0-1) */
  magnitude: number;
  /** Description of the effect */
  description: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Base persona colors (source of truth from design tokens).
 * These are the canonical colors for each persona.
 */
export const PERSONA_COLORS: Record<PersonaId, string> = {
  ferni: '#4a6741', // Sage green - grounding, natural
  maya: '#a67a6a', // Warm terracotta - energetic, motivating
  peter: '#3a6b73', // Teal - analytical, precise
  jordan: '#c4856a', // Coral - celebratory, warm
  alex: '#5a6b8a', // Slate blue - professional, clear
  nayan: '#b8956a', // Golden bronze - wise, warm
};

/**
 * Persona color in HSL for calculations.
 */
export const PERSONA_HSL: Record<PersonaId, HSLColor> = {
  ferni: { h: 107, s: 23, l: 33 },
  maya: { h: 16, s: 28, l: 53 },
  peter: { h: 189, s: 33, l: 34 },
  jordan: { h: 19, s: 47, l: 59 },
  alex: { h: 220, s: 22, l: 45 },
  nayan: { h: 37, s: 37, l: 57 },
};

/**
 * Pre-calculated harmonic bridge colors for common transitions.
 * These are manually tuned for the most aesthetically pleasing handoffs.
 */
const BRIDGE_COLOR_OVERRIDES: Partial<Record<string, string>> = {
  'ferni-maya': '#8a7a5a', // Warm olive (blend of green and terracotta)
  'maya-ferni': '#8a7a5a',
  'ferni-peter': '#4a6a5a', // Teal-sage blend
  'peter-ferni': '#4a6a5a',
  'ferni-nayan': '#7a8a5a', // Golden sage
  'nayan-ferni': '#7a8a5a',
  'maya-jordan': '#b87a6a', // Warm coral
  'jordan-maya': '#b87a6a',
  'peter-alex': '#4a6a7a', // Cool professional blue
  'alex-peter': '#4a6a7a',
  'alex-nayan': '#8a8a7a', // Neutral warm gray
  'nayan-alex': '#8a8a7a',
};

/**
 * Default transition configuration.
 */
const DEFAULT_CONFIG: Required<TransitionConfig> = {
  steps: 5,
  baseDuration: 400,
  minDuration: 200,
  maxDuration: 800,
  easing: 'ease-in-out',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert hex color to HSL.
 */
function hexToHSL(hex: string): HSLColor {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

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
function hslToHex(hsl: HSLColor): string {
  const { h, s, l } = hsl;
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
  } else if (h >= 120 && h < 180) {
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (n: number): string => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Calculate the perceptual distance between two colors.
 * Uses a weighted formula that accounts for human color perception.
 */
function calculateColorDistance(hsl1: HSLColor, hsl2: HSLColor): number {
  // Hue distance (circular, so handle wrap-around)
  let hueDiff = Math.abs(hsl1.h - hsl2.h);
  if (hueDiff > 180) hueDiff = 360 - hueDiff;

  // Normalize hue diff to 0-1 range (180 degrees = max difference)
  const hueDistance = hueDiff / 180;

  // Saturation and lightness differences (already 0-100)
  const satDistance = Math.abs(hsl1.s - hsl2.s) / 100;
  const lightDistance = Math.abs(hsl1.l - hsl2.l) / 100;

  // Weighted combination (hue has most visual impact, then lightness, then saturation)
  const distance = Math.sqrt(
    Math.pow(hueDistance * 0.5, 2) + Math.pow(lightDistance * 0.35, 2) + Math.pow(satDistance * 0.15, 2)
  );

  // Normalize to 0-1
  return Math.min(distance, 1);
}

/**
 * Interpolate between two HSL colors with proper hue handling.
 */
function interpolateHSL(hsl1: HSLColor, hsl2: HSLColor, t: number): HSLColor {
  // Handle hue interpolation (shortest path around color wheel)
  let hueDiff = hsl2.h - hsl1.h;
  if (hueDiff > 180) hueDiff -= 360;
  if (hueDiff < -180) hueDiff += 360;

  return {
    h: Math.round((hsl1.h + hueDiff * t + 360) % 360),
    s: Math.round(hsl1.s + (hsl2.s - hsl1.s) * t),
    l: Math.round(hsl1.l + (hsl2.l - hsl1.l) * t),
  };
}

/**
 * Calculate the harmonic bridge color between two personas.
 * This is the visual "middle ground" that feels natural to both.
 */
function calculateBridgeColor(from: PersonaId, to: PersonaId): string {
  // Check for pre-calculated override
  const key = `${from}-${to}`;
  if (BRIDGE_COLOR_OVERRIDES[key]) {
    return BRIDGE_COLOR_OVERRIDES[key];
  }

  // Calculate midpoint with slight adjustments for visual harmony
  const hsl1 = PERSONA_HSL[from];
  const hsl2 = PERSONA_HSL[to];

  // Find the color at 50% but with slightly reduced saturation
  // (Albers: neutral colors bridge chromatic ones better)
  const midpoint = interpolateHSL(hsl1, hsl2, 0.5);

  // Reduce saturation by 15% for a more neutral bridge
  midpoint.s = Math.max(0, midpoint.s - 15);

  // Slightly increase lightness for a "lifted" feel during transition
  midpoint.l = Math.min(100, midpoint.l + 5);

  return hslToHex(midpoint);
}

/**
 * Apply easing function to progress value.
 */
function applyEasing(t: number, easing: TransitionConfig['easing']): number {
  switch (easing) {
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - Math.pow(1 - t, 2);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'linear':
    default:
      return t;
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Calculate a complete transition between two personas.
 * Returns all the data needed for smooth color handoffs.
 */
export function getPersonaTransition(
  from: PersonaId,
  to: PersonaId,
  config: TransitionConfig = {}
): PersonaTransition {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const fromHSL = PERSONA_HSL[from];
  const toHSL = PERSONA_HSL[to];
  const fromHex = PERSONA_COLORS[from];
  const toHex = PERSONA_COLORS[to];

  // Calculate color distance for duration scaling
  const colorDistance = calculateColorDistance(fromHSL, toHSL);

  // Calculate bridge color
  const bridgeColor = calculateBridgeColor(from, to);
  const bridgeHSL = hexToHSL(bridgeColor);

  // Calculate duration based on color distance
  const durationScale = 0.5 + colorDistance * 0.5; // 0.5 to 1.0
  const duration = Math.round(
    Math.min(cfg.maxDuration, Math.max(cfg.minDuration, cfg.baseDuration * durationScale))
  );

  // Generate transition steps
  const colorSteps: TransitionStep[] = [];

  for (let i = 0; i <= cfg.steps; i++) {
    const progress = i / cfg.steps;

    let stepHSL: HSLColor;
    let label: string | undefined;

    if (progress <= 0.5) {
      // First half: from → bridge
      const t = progress * 2; // 0 to 1
      stepHSL = interpolateHSL(fromHSL, bridgeHSL, applyEasing(t, cfg.easing));
      if (progress === 0) label = `${from} (start)`;
      if (progress === 0.5) label = 'Bridge (harmony)';
    } else {
      // Second half: bridge → to
      const t = (progress - 0.5) * 2; // 0 to 1
      stepHSL = interpolateHSL(bridgeHSL, toHSL, applyEasing(t, cfg.easing));
      if (progress === 1) label = `${to} (end)`;
    }

    colorSteps.push({
      color: hslToHex(stepHSL),
      hsl: stepHSL,
      progress,
      label,
    });
  }

  // Generate CSS keyframes
  const keyframeSteps = colorSteps
    .map((step) => `  ${Math.round(step.progress * 100)}% { --persona-color: ${step.color}; }`)
    .join('\n');

  const cssKeyframes = `@keyframes persona-transition-${from}-${to} {\n${keyframeSteps}\n}`;

  // Generate CSS variables
  const cssVariables: Record<string, string> = {
    '--persona-from': fromHex,
    '--persona-to': toHex,
    '--persona-bridge': bridgeColor,
    '--persona-transition-duration': `${duration}ms`,
    '--persona-transition-easing': cfg.easing === 'linear' ? 'linear' : `cubic-bezier(0.4, 0, 0.2, 1)`,
  };

  return {
    from,
    to,
    colorSteps,
    bridgeColor,
    duration,
    colorDistance,
    cssKeyframes,
    cssVariables,
  };
}

/**
 * Get all personas sorted by color similarity to a given persona.
 * Useful for suggesting "nearby" personas for natural handoffs.
 */
export function getPersonasBySimilarity(fromPersona: PersonaId): PersonaId[] {
  const fromHSL = PERSONA_HSL[fromPersona];
  const personas = Object.keys(PERSONA_HSL) as PersonaId[];

  return personas
    .filter((p) => p !== fromPersona)
    .map((p) => ({
      persona: p,
      distance: calculateColorDistance(fromHSL, PERSONA_HSL[p]),
    }))
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.persona);
}

/**
 * Calculate simultaneous contrast effect.
 * When persona A is adjacent to persona B, how does A appear to shift?
 */
export function calculateSimultaneousContrast(
  targetPersona: PersonaId,
  adjacentPersona: PersonaId
): ContrastEffect {
  const targetHSL = PERSONA_HSL[targetPersona];
  const adjacentHSL = PERSONA_HSL[adjacentPersona];

  // Albers' principle: colors shift away from their neighbors
  // If adjacent is warm, target appears cooler, etc.

  // Calculate the "push" direction (opposite of adjacent)
  const huePush = -((adjacentHSL.h - targetHSL.h) * 0.1); // Slight opposite hue shift
  const satPush = -(adjacentHSL.s - targetHSL.s) * 0.05; // Counter-saturation
  const lightPush = -(adjacentHSL.l - targetHSL.l) * 0.08; // Counter-lightness

  const perceivedShift: HSLColor = {
    h: Math.round(huePush),
    s: Math.round(satPush),
    l: Math.round(lightPush),
  };

  const magnitude = Math.abs(huePush / 36) + Math.abs(satPush / 10) + Math.abs(lightPush / 10);

  // Generate description
  let description = `${targetPersona}'s color appears `;
  const effects: string[] = [];

  if (Math.abs(huePush) > 2) {
    effects.push(huePush > 0 ? 'warmer' : 'cooler');
  }
  if (Math.abs(satPush) > 2) {
    effects.push(satPush > 0 ? 'more saturated' : 'more muted');
  }
  if (Math.abs(lightPush) > 2) {
    effects.push(lightPush > 0 ? 'lighter' : 'darker');
  }

  description += effects.length > 0 ? effects.join(' and ') : 'unchanged';
  description += ` when adjacent to ${adjacentPersona}`;

  return {
    perceivedShift,
    magnitude: Math.min(magnitude, 1),
    description,
  };
}

/**
 * Apply persona transition to an element with animation.
 */
export function applyPersonaTransition(
  element: HTMLElement,
  from: PersonaId,
  to: PersonaId,
  config?: TransitionConfig
): Promise<void> {
  return new Promise((resolve) => {
    const transition = getPersonaTransition(from, to, config);

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Skip animation, apply final state immediately
      element.style.setProperty('--persona-color', PERSONA_COLORS[to]);
      resolve();
      return;
    }

    // Apply CSS variables
    Object.entries(transition.cssVariables).forEach(([key, value]) => {
      element.style.setProperty(key, value);
    });

    // Animate through steps
    let currentStep = 0;
    const stepDuration = transition.duration / transition.colorSteps.length;

    function animateStep() {
      if (currentStep >= transition.colorSteps.length) {
        resolve();
        return;
      }

      const step = transition.colorSteps[currentStep];
      if (step) {
        element.style.setProperty('--persona-color', step.color);
      }

      currentStep++;
      setTimeout(animateStep, stepDuration);
    }

    animateStep();
  });
}

/**
 * Generate CSS stylesheet for persona transitions.
 */
export function generatePersonaTransitionCSS(): string {
  const personas = Object.keys(PERSONA_COLORS) as PersonaId[];
  const rules: string[] = [];

  // Base rule
  rules.push(`
/* Persona Color Harmony System
 * Based on Josef Albers' Interaction of Color
 * Auto-generated - do not edit directly
 */

:root {
  --persona-transition-duration: 400ms;
  --persona-transition-easing: cubic-bezier(0.4, 0, 0.2, 1);
}

.persona-color {
  transition: color var(--persona-transition-duration) var(--persona-transition-easing),
              background-color var(--persona-transition-duration) var(--persona-transition-easing);
}
`);

  // Generate keyframes for all persona pairs
  personas.forEach((from) => {
    personas.forEach((to) => {
      if (from !== to) {
        const transition = getPersonaTransition(from, to);
        rules.push(transition.cssKeyframes);
      }
    });
  });

  // Generate utility classes
  personas.forEach((persona) => {
    rules.push(`
.persona-${persona} {
  --persona-color: ${PERSONA_COLORS[persona]};
}
`);
  });

  return rules.join('\n');
}

/**
 * Inject persona transition styles into the document.
 */
export function injectPersonaHarmonyStyles(): void {
  const styleId = 'ferni-persona-harmony-styles';

  // Remove existing
  const existing = document.getElementById(styleId);
  if (existing) {
    existing.remove();
  }

  // Inject new
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = generatePersonaTransitionCSS();
  document.head.appendChild(style);
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Get the full color harmony analysis for a persona pair.
 * Useful for debugging and design documentation.
 */
export function analyzePersonaHarmony(
  persona1: PersonaId,
  persona2: PersonaId
): {
  transition: PersonaTransition;
  contrast1: ContrastEffect;
  contrast2: ContrastEffect;
  recommendation: string;
} {
  const transition = getPersonaTransition(persona1, persona2);
  const contrast1 = calculateSimultaneousContrast(persona1, persona2);
  const contrast2 = calculateSimultaneousContrast(persona2, persona1);

  // Generate recommendation
  let recommendation: string;
  if (transition.colorDistance < 0.3) {
    recommendation = `${persona1} and ${persona2} are closely related colors. Transitions will be subtle and quick.`;
  } else if (transition.colorDistance < 0.6) {
    recommendation = `${persona1} and ${persona2} have moderate contrast. Use the bridge color (${transition.bridgeColor}) for smooth handoffs.`;
  } else {
    recommendation = `${persona1} and ${persona2} are highly contrasting. Allow extra time (${transition.duration}ms) and use the bridge color to prevent jarring transitions.`;
  }

  return {
    transition,
    contrast1,
    contrast2,
    recommendation,
  };
}

/**
 * Generate a color harmony matrix showing all persona relationships.
 */
export function generateHarmonyMatrix(): Record<PersonaId, Record<PersonaId, number>> {
  const personas = Object.keys(PERSONA_COLORS) as PersonaId[];
  const matrix: Record<PersonaId, Record<PersonaId, number>> = {} as any;

  personas.forEach((from) => {
    matrix[from] = {} as Record<PersonaId, number>;
    personas.forEach((to) => {
      if (from === to) {
        matrix[from][to] = 0;
      } else {
        matrix[from][to] = calculateColorDistance(PERSONA_HSL[from], PERSONA_HSL[to]);
      }
    });
  });

  return matrix;
}

/**
 * Get the most harmonious persona pairs (smallest color distance).
 */
export function getMostHarmoniousPairs(): Array<{ pair: [PersonaId, PersonaId]; distance: number }> {
  const personas = Object.keys(PERSONA_COLORS) as PersonaId[];
  const pairs: Array<{ pair: [PersonaId, PersonaId]; distance: number }> = [];

  for (let i = 0; i < personas.length; i++) {
    for (let j = i + 1; j < personas.length; j++) {
      const persona1 = personas[i]!;
      const persona2 = personas[j]!;
      pairs.push({
        pair: [persona1, persona2],
        distance: calculateColorDistance(PERSONA_HSL[persona1], PERSONA_HSL[persona2]),
      });
    }
  }

  return pairs.sort((a, b) => a.distance - b.distance);
}

/**
 * Get the most contrasting persona pairs (largest color distance).
 */
export function getMostContrastingPairs(): Array<{ pair: [PersonaId, PersonaId]; distance: number }> {
  return getMostHarmoniousPairs().reverse();
}
