/**
 * Color Type Definitions
 *
 * Shared color types to avoid circular imports between
 * color-generator.ts and persona-colors.ts.
 */

/**
 * Configuration for a persona's color scheme.
 * Used for theming the UI based on the active agent.
 */
export interface PersonaColorConfig {
  /** Primary color - main avatar/button color */
  primary: string;
  /** Secondary color - gradient endpoint, darker shade */
  secondary: string;
  /** Text color on persona backgrounds */
  text: string;
  /** Glow/shadow color with alpha */
  glow: string;
  /** Subtle tint for backgrounds */
  tint: string;
  /** CSS gradient for buttons */
  gradient: string;
  /** Short description of the color meaning */
  description: string;
}

/**
 * API color data (subset of PersonaColorConfig)
 */
export interface ApiColorData {
  primary?: string;
  secondary?: string;
  gradient?: string;
  glow?: string;
}

/**
 * Personality traits used for color generation
 */
export interface PersonalityForColors {
  warmth?: number;
  energy?: number;
  directness?: number;
}

