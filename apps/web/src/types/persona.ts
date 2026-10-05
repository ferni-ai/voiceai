/**
 * Persona Type Definitions
 *
 * Defines the structure for AI personas used in the Voice AI application.
 * Uses canonical IDs that match backend PersonaConfig schema.
 *
 * REFACTOR TODO #100: Create a shared package (e.g., @voiceai/persona-types) that
 * exports PersonaId, KNOWN_PERSONA_IDS and the alias map for use by
 * both frontend and backend. This would eliminate the need to keep them in sync
 * manually and ensure type consistency across the codebase.
 */

// ============================================================================
// PERSONA ID
// ============================================================================

/**
 * Valid persona identifiers - canonical IDs used everywhere.
 */
export type PersonaId =
  'ferni' | 'alex-chen' | 'maya-santos' | 'jordan-taylor' | 'peter-john' | 'nayan-patel';

/**
 * The Financial Legends (Peter Lynch, John Bogle, Joel Dickson): marketplace
 * advisors the voice agent can hand a call to. They are not on Ferni's team
 * (no team grid, no unlock), but while one is speaking the web shows THAT
 * person. Mirrors FINANCIAL_LEGENDS in src/personas/persona-ids.ts.
 */
export type LegendId = 'peter-lynch' | 'john-bogle' | 'joel-dickson';

export const LEGEND_IDS: readonly LegendId[] = [
  'peter-lynch',
  'john-bogle',
  'joel-dickson',
] as const;

/** Anyone who can be speaking on a call: Ferni's team or a Legend. */
export type SpeakerId = PersonaId | LegendId;

export function isLegendId(value: unknown): value is LegendId {
  return typeof value === 'string' && (LEGEND_IDS as readonly string[]).includes(value);
}

/**
 * List of all known persona IDs for validation
 */
const KNOWN_PERSONA_IDS: readonly string[] = [
  'ferni',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
  'peter-john',
  'nayan-patel',
] as const;

/**
 * Type guard to check if a value is a valid PersonaId
 */
export function isValidPersonaId(value: unknown): value is PersonaId {
  return typeof value === 'string' && KNOWN_PERSONA_IDS.includes(value);
}

// ============================================================================
// PERSONA ROLE
// ============================================================================

/**
 * Role classification for personas.
 * - coach: Main AI assistant (Ferni)
 * - team: Ferni's specialist team (Peter John, Maya Santos, etc.)
 * - standalone: Not on the team: marketplace agents and the Financial Legends
 */
export type PersonaRole = 'coach' | 'team' | 'standalone';

// ============================================================================
// PERSONA CONFIG
// ============================================================================

/**
 * Persona theme colors for visual identity.
 */
export interface PersonaColors {
  /** Primary brand color (hex) */
  readonly primary: string;
  /** Secondary/accent color (hex) */
  readonly secondary: string;
  /** Glow/shadow color with alpha */
  readonly glow: string;
  /** Gradient for avatar background */
  readonly gradient: string;
}

/**
 * Persona skill/capability for display.
 */
export interface PersonaSkill {
  /** Skill icon (emoji or icon name) */
  readonly icon: string;
  /** Short skill name */
  readonly name: string;
}

/**
 * Complete persona configuration for UI rendering.
 */
export interface PersonaConfig {
  /** Unique identifier (canonical). A Legend only while one is speaking. */
  readonly id: SpeakerId;

  /** Display name */
  readonly name: string;

  /** Avatar initials (1-2 characters) */
  readonly initials: string;

  /** Short description/title */
  readonly subtitle: string;

  /** Role in the coach/team system */
  readonly role: PersonaRole;

  /** Inspirational quotes for display */
  readonly quotes: readonly string[];

  /** Helper text shown when ready to connect */
  readonly helperText: string;

  /** CSS class name for theming (optional) */
  readonly themeClass?: string;

  /** Unique color scheme for this persona */
  readonly colors: PersonaColors;

  /** Key skills/capabilities this persona offers */
  readonly skills: readonly PersonaSkill[];

  /** Entrance phrase when taking over */
  readonly entrancePhrase: string;

  /** Sound effect ID for handoff to this persona */
  readonly handoffSound?: string;
}

// ============================================================================
// PERSONA REGISTRY
// ============================================================================

/**
 * Readonly map of all available personas.
 */
export type PersonaRegistry = Readonly<Record<PersonaId, PersonaConfig>>;

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * The default/coach persona ID.
 */
export const DEFAULT_PERSONA_ID: PersonaId = 'ferni';

/**
 * Core team persona IDs (built-in, not from marketplace).
 * Jack Bogle and Joel Dickson are available through the Agent Marketplace.
 */
export const ALL_PERSONA_IDS: readonly PersonaId[] = [
  'ferni',
  'peter-john',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
  'nayan-patel',
] as const;
