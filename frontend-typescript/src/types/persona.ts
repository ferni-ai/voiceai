/**
 * Persona Type Definitions
 * 
 * Defines the structure for AI personas used in the Voice AI application.
 * Uses canonical IDs that match backend PersonaConfig schema.
 * 
 * REFACTOR TODO #100: Create a shared package (e.g., @voiceai/persona-types) that
 * exports PersonaId, KNOWN_PERSONA_IDS, and LEGACY_TO_CANONICAL_MAP for use by
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
  | 'ferni'
  | 'alex-chen'
  | 'maya-santos'
  | 'jordan-taylor'
  | 'peter-john'
  | 'nayan-patel';

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
 * Legacy ID to canonical ID mapping for backward compatibility.
 * Maps old IDs to canonical IDs.
 * 
 * FIX BUG #30: This should stay in sync with:
 * - Backend: src/tools/handoff/state.ts (toCanonicalId mapping)
 * - Backend: src/personas/voice-registry.ts
 */
export const LEGACY_TO_CANONICAL_MAP: Record<string, PersonaId> = {
  // Ferni legacy aliases
  'jack-b': 'ferni',
  'coach': 'ferni',
  'life-coach': 'ferni',
  // Alex legacy aliases
  'comm-specialist': 'alex-chen',
  'comm': 'alex-chen',
  'alex': 'alex-chen',
  // Maya legacy aliases
  'spend-save': 'maya-santos',
  'maya': 'maya-santos',
  'debt-counselor': 'maya-santos',
  // Jordan legacy aliases
  'event-planner': 'jordan-taylor',
  'jordan': 'jordan-taylor',
  'retirement-specialist': 'jordan-taylor',
  // Peter John aliases
  'peter': 'peter-john',
  'peter-lynch': 'peter-john', // Legacy alias
  'lynch': 'peter-john',
  'john': 'peter-john',
  // Nayan Patel aliases
  'nayan': 'nayan-patel',
  'patel': 'nayan-patel',
  'guru': 'nayan-patel',
  'mystic': 'nayan-patel',
  'lifetime-advisor': 'nayan-patel',
  'sage': 'nayan-patel',
  'wisdom': 'nayan-patel',
  // Legacy alias for backward compatibility
  'jaggi': 'nayan-patel',
  'jaggi-vasudev': 'nayan-patel',
};

/**
 * Convert a legacy persona ID to canonical format
 */
export function normalizePersonaId(id: string): PersonaId {
  if (isValidPersonaId(id)) return id;
  return LEGACY_TO_CANONICAL_MAP[id] || 'ferni';
}

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
 * - team: Specialist advisors (Jack Bogle, Peter Lynch, etc.)
 * - standalone: Single-persona experiences (Joel Dickson, etc.)
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
  /** Unique identifier (canonical) */
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
