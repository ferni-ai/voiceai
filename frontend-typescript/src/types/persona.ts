/**
 * Persona Type Definitions
 * 
 * Defines the structure for AI personas used in the Voice AI application.
 * Follows the backend PersonaConfig schema for consistency.
 */

// ============================================================================
// PERSONA ID
// ============================================================================

/**
 * Valid persona identifiers.
 * Must match backend persona registry.
 */
export type PersonaId = 
  | 'jack-b' 
  | 'jack-bogle' 
  | 'peter-lynch'
  | 'comm-specialist'
  | 'spend-save'
  | 'event-planner';

/**
 * List of all known persona IDs for validation
 */
const KNOWN_PERSONA_IDS: readonly string[] = [
  'jack-b',
  'jack-bogle', 
  'peter-lynch',
  'comm-specialist',
  'spend-save',
  'event-planner',
] as const;

/**
 * Type guard to check if a value is a valid PersonaId
 */
export function isValidPersonaId(value: unknown): value is PersonaId {
  return (
    typeof value === 'string' &&
    KNOWN_PERSONA_IDS.includes(value)
  );
}

// ============================================================================
// PERSONA ROLE
// ============================================================================

/**
 * Role classification for personas.
 * - coach: Main AI assistant (Ferni)
 * - team: Specialist advisors (Jack Bogle, Peter Lynch)
 */
export type PersonaRole = 'coach' | 'team';

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
  /** Unique identifier */
  readonly id: PersonaId;

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
export const DEFAULT_PERSONA_ID: PersonaId = 'jack-b';

/**
 * All available persona IDs for iteration.
 */
export const ALL_PERSONA_IDS: readonly PersonaId[] = [
  'jack-b',
  'jack-bogle',
  'peter-lynch',
  'comm-specialist',
  'spend-save',
  'event-planner',
] as const;

