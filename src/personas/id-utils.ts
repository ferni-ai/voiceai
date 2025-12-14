/**
 * Persona ID Utilities - Centralized ID Normalization
 *
 * This module provides consistent persona ID handling across the codebase.
 * Use these utilities instead of inline normalization to ensure consistency.
 *
 * Common aliases resolved:
 * - peter → peter-john
 * - alex → alex-chen
 * - maya → maya-santos
 * - jordan → jordan-taylor
 * - nayan → nayan-patel
 * - jack-b, coach → ferni
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Canonical persona IDs (the official format)
 */
export type CanonicalPersonaId =
  | 'ferni'
  | 'peter-john'
  | 'alex-chen'
  | 'maya-santos'
  | 'jordan-taylor'
  | 'nayan-patel';

/**
 * All known aliases that can be resolved to canonical IDs
 */
export type PersonaAlias =
  | CanonicalPersonaId
  | 'peter'
  | 'alex'
  | 'maya'
  | 'jordan'
  | 'nayan'
  | 'jack-b'
  | 'jackie'
  | 'coach'
  | 'life-coach';

// ============================================================================
// ALIAS MAPPING
// ============================================================================

/**
 * Maps aliases to canonical persona IDs
 */
const PERSONA_ALIASES: Record<string, CanonicalPersonaId> = {
  // Ferni (life coach)
  ferni: 'ferni',
  'jack-b': 'ferni',
  jackie: 'ferni',
  coach: 'ferni',
  'life-coach': 'ferni',

  // Peter John (research)
  'peter-john': 'peter-john',
  peter: 'peter-john',
  john: 'peter-john',

  // Alex Chen (communication)
  'alex-chen': 'alex-chen',
  alex: 'alex-chen',

  // Maya Santos (habits)
  'maya-santos': 'maya-santos',
  maya: 'maya-santos',

  // Jordan Taylor (planning)
  'jordan-taylor': 'jordan-taylor',
  jordan: 'jordan-taylor',

  // Nayan Patel (wisdom)
  'nayan-patel': 'nayan-patel',
  nayan: 'nayan-patel',
  patel: 'nayan-patel',
};

/**
 * List of all canonical persona IDs
 */
export const CANONICAL_PERSONA_IDS: readonly CanonicalPersonaId[] = [
  'ferni',
  'peter-john',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
  'nayan-patel',
];

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Normalize a persona ID to lowercase with hyphens.
 * This is the standard format used throughout the codebase.
 *
 * @example
 * normalizePersonaId('Peter_John') // 'peter-john'
 * normalizePersonaId('FERNI') // 'ferni'
 * normalizePersonaId('alex-chen') // 'alex-chen'
 */
export function normalizePersonaId(personaId: string): string {
  return personaId.toLowerCase().replace(/_/g, '-').trim();
}

/**
 * Resolve a persona ID (including aliases) to its canonical form.
 * Returns the canonical ID if found, otherwise returns the normalized input.
 *
 * @example
 * resolvePersonaId('peter') // 'peter-john'
 * resolvePersonaId('jack-b') // 'ferni'
 * resolvePersonaId('unknown') // 'unknown' (unchanged)
 */
export function resolvePersonaId(personaId: string): string {
  const normalized = normalizePersonaId(personaId);
  return PERSONA_ALIASES[normalized] || normalized;
}

/**
 * Check if a persona ID (after normalization) is a known canonical ID.
 *
 * @example
 * isCanonicalPersonaId('ferni') // true
 * isCanonicalPersonaId('peter-john') // true
 * isCanonicalPersonaId('peter') // false (it's an alias)
 * isCanonicalPersonaId('unknown') // false
 */
export function isCanonicalPersonaId(personaId: string): personaId is CanonicalPersonaId {
  const normalized = normalizePersonaId(personaId);
  return CANONICAL_PERSONA_IDS.includes(normalized as CanonicalPersonaId);
}

/**
 * Check if a persona ID (including aliases) resolves to a known persona.
 *
 * @example
 * isKnownPersonaId('ferni') // true
 * isKnownPersonaId('peter') // true (alias for peter-john)
 * isKnownPersonaId('unknown') // false
 */
export function isKnownPersonaId(personaId: string): boolean {
  const normalized = normalizePersonaId(personaId);
  return normalized in PERSONA_ALIASES;
}

/**
 * Get the canonical ID for a persona, or null if not found.
 *
 * @example
 * getCanonicalId('peter') // 'peter-john'
 * getCanonicalId('unknown') // null
 */
export function getCanonicalId(personaId: string): CanonicalPersonaId | null {
  const normalized = normalizePersonaId(personaId);
  return PERSONA_ALIASES[normalized] || null;
}

/**
 * Get the canonical ID for a persona, with a fallback to 'ferni'.
 *
 * @example
 * getCanonicalIdOrFerni('peter') // 'peter-john'
 * getCanonicalIdOrFerni('unknown') // 'ferni'
 */
export function getCanonicalIdOrFerni(personaId: string): CanonicalPersonaId {
  return getCanonicalId(personaId) || 'ferni';
}

// ============================================================================
// COMPARISON FUNCTIONS
// ============================================================================

/**
 * Check if two persona IDs refer to the same persona (handles aliases).
 *
 * @example
 * isSamePersona('peter', 'peter-john') // true
 * isSamePersona('jack-b', 'ferni') // true
 * isSamePersona('peter', 'alex') // false
 */
export function isSamePersona(id1: string, id2: string): boolean {
  return resolvePersonaId(id1) === resolvePersonaId(id2);
}

/**
 * Check if a persona ID refers to the coach (Ferni).
 *
 * @example
 * isCoachPersona('ferni') // true
 * isCoachPersona('jack-b') // true
 * isCoachPersona('peter') // false
 */
export function isCoachPersona(personaId: string): boolean {
  return resolvePersonaId(personaId) === 'ferni';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  normalizePersonaId,
  resolvePersonaId,
  isCanonicalPersonaId,
  isKnownPersonaId,
  getCanonicalId,
  getCanonicalIdOrFerni,
  isSamePersona,
  isCoachPersona,
  CANONICAL_PERSONA_IDS,
};
