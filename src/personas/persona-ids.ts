/**
 * Persona IDs - Canonical ID definitions and validation
 *
 * NOTE: For new code, prefer the central module: personas/index.js
 *   which re-exports getCanonicalPersonaId and toCanonical.
 *
 * This module provides:
 * - CANONICAL_IDS: The canonical persona identifiers
 * - ID validation and conversion functions
 * - Legacy alias resolution (for backwards compatibility)
 *
 * ID SYSTEMS:
 * 1. CANONICAL: ferni, alex-chen, maya-santos, jordan-taylor, peter-john, nayan-patel
 * 2. LEGACY ALIASES: jack-b, comm-specialist, spend-save, event-planner (mapped to canonical)
 *
 * This creates a mapping confusion where handoffs break because:
 * - Frontend sends "comm-specialist" but backend expects "alex-chen"
 * - Voice manager uses "jack-b" but handoff tracker uses "ferni"
 * - Tests pass but runtime fails due to ID mismatch
 *
 * SOLUTION: Use this module EVERYWHERE for persona ID handling.
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// CANONICAL IDS - The ONLY IDs that should be used internally
// ============================================================================

/**
 * Canonical persona IDs.
 * These are the ONLY valid internal IDs.
 *
 * 🔑 SINGLE SOURCE OF TRUTH
 * This file (persona-ids.ts) is the authoritative source for:
 * - Canonical persona IDs
 * - Alias mappings (all variations → canonical)
 * - Display names
 *
 * Other modules (voice-registry.ts, id-mapping.ts) should import from here
 * rather than defining their own mappings.
 */
export const CANONICAL_IDS = {
  COACH: 'ferni',
  RESEARCHER: 'peter-john',
  COMMUNICATOR: 'alex-chen',
  BUDGETER: 'maya-santos',
  PLANNER: 'jordan-taylor',
  SAGE: 'nayan-patel',
} as const;

export type CanonicalPersonaId = (typeof CANONICAL_IDS)[keyof typeof CANONICAL_IDS];

/**
 * All canonical IDs as an array (for validation)
 */
export const ALL_CANONICAL_IDS: readonly CanonicalPersonaId[] = Object.values(CANONICAL_IDS);

export type FrontendPersonaId = CanonicalPersonaId;

// ============================================================================
// ID MAPPING - Now identity mappings (after standardization)
// ============================================================================

/**
 * Map canonical ID → frontend ID
 * After standardization, this is an identity mapping.
 */
export const CANONICAL_TO_FRONTEND: Record<CanonicalPersonaId, CanonicalPersonaId> = {
  ferni: 'ferni',
  'peter-john': 'peter-john',
  'alex-chen': 'alex-chen',
  'maya-santos': 'maya-santos',
  'jordan-taylor': 'jordan-taylor',
  'nayan-patel': 'nayan-patel',
};

/**
 * Map frontend ID → canonical ID
 * After standardization, this is an identity mapping.
 * Legacy IDs are still supported via ALIAS_TO_CANONICAL.
 */
export const FRONTEND_TO_CANONICAL: Record<CanonicalPersonaId, CanonicalPersonaId> = {
  ferni: 'ferni',
  'peter-john': 'peter-john',
  'alex-chen': 'alex-chen',
  'maya-santos': 'maya-santos',
  'jordan-taylor': 'jordan-taylor',
  'nayan-patel': 'nayan-patel',
};

/**
 * ALL known aliases → canonical ID
 *
 * 🔑 SINGLE SOURCE OF TRUTH for alias resolution.
 * ALL other modules should use toCanonical() from this file
 * rather than maintaining separate alias maps.
 */
export const ALIAS_TO_CANONICAL: Record<string, CanonicalPersonaId> = {
  // Ferni (Coach)
  ferni: 'ferni',
  'jack-b': 'ferni',
  coach: 'ferni',
  'life-coach': 'ferni',
  jackie: 'ferni',

  // Peter John (Researcher)
  'peter-john': 'peter-john',
  peter: 'peter-john',
  lynch: 'peter-john',
  researcher: 'peter-john',
  'stock-storyteller': 'peter-john',

  // Alex Chen (Communicator)
  'alex-chen': 'alex-chen',
  alex: 'alex-chen',
  'comm-specialist': 'alex-chen',
  comm: 'alex-chen',
  communications: 'alex-chen',
  communicator: 'alex-chen',
  'generic-advisor': 'alex-chen',

  // Maya Santos (Budgeter)
  'maya-santos': 'maya-santos',
  maya: 'maya-santos',
  'spend-save': 'maya-santos',
  spend: 'maya-santos',
  save: 'maya-santos',
  budget: 'maya-santos',
  'habits-coach': 'maya-santos',
  'debt-counselor': 'maya-santos',

  // Jordan Taylor (Planner)
  'jordan-taylor': 'jordan-taylor',
  jordan: 'jordan-taylor',
  'event-planner': 'jordan-taylor',
  event: 'jordan-taylor',
  planner: 'jordan-taylor',
  events: 'jordan-taylor',
  'retirement-specialist': 'jordan-taylor',

  // Nayan Patel (Sage)
  'nayan-patel': 'nayan-patel',
  nayan: 'nayan-patel',
  patel: 'nayan-patel',
  sage: 'nayan-patel',
  'sage-mentor': 'nayan-patel',
  guru: 'nayan-patel',
  mystic: 'nayan-patel',
  'lifetime-advisor': 'nayan-patel',
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Check if a string is a canonical persona ID.
 */
export function isCanonicalId(id: string): id is CanonicalPersonaId {
  return ALL_CANONICAL_IDS.includes(id as CanonicalPersonaId);
}

/**
 * Check if a string is a known persona ID or alias.
 */
export function isKnownId(id: string): boolean {
  return id.toLowerCase() in ALIAS_TO_CANONICAL;
}

/**
 * Convert ANY persona ID/alias to canonical form.
 * This is the ONLY function that should be used to normalize IDs.
 *
 * @param id - Any persona ID, alias, or variant
 * @returns Canonical ID
 * @throws Error if ID is completely unknown (strict mode)
 */
export function toCanonical(id: string, strict = false): CanonicalPersonaId {
  const normalized = id.toLowerCase().trim();
  const canonical = ALIAS_TO_CANONICAL[normalized];

  if (!canonical) {
    if (strict) {
      throw new Error(`Unknown persona ID: ${id}`);
    }
    log.warn({ unknownId: id }, 'Unknown persona ID, defaulting to ferni');
    return 'ferni';
  }

  return canonical;
}

/**
 * Convert ANY persona ID to frontend form.
 * After standardization, this just returns the canonical ID.
 */
export function toFrontend(id: string): CanonicalPersonaId {
  return toCanonical(id);
}

/**
 * Convert frontend ID to canonical form.
 * After standardization, this just returns the canonical ID.
 * Legacy IDs are handled via toCanonical.
 */
export function fromFrontend(frontendId: string): CanonicalPersonaId {
  return toCanonical(frontendId);
}

// ============================================================================
// DISPLAY NAMES
// ============================================================================

export const DISPLAY_NAMES: Record<CanonicalPersonaId, string> = {
  ferni: 'Ferni',
  'peter-john': 'Peter',
  'alex-chen': 'Alex',
  'maya-santos': 'Maya',
  'jordan-taylor': 'Jordan',
  'nayan-patel': 'Nayan',
};

export function getDisplayName(id: string): string {
  const canonical = toCanonical(id);
  return DISPLAY_NAMES[canonical];
}

// ============================================================================
// RUNTIME VALIDATION HELPERS
// ============================================================================

/**
 * Assert that an ID is canonical. Use this in critical paths.
 */
export function assertCanonical(id: string, context?: string): asserts id is CanonicalPersonaId {
  if (!isCanonicalId(id)) {
    const canonical = toCanonical(id);
    const msg = `Expected canonical ID but got "${id}" (canonical: ${canonical})${context ? ` in ${context}` : ''}`;
    log.error({ id, canonical, context }, msg);
    // Don't throw in production, just log
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(msg);
    }
  }
}

/**
 * Validate and log ID conversion (for debugging).
 */
export function validateAndLog(id: string, context: string): CanonicalPersonaId {
  const canonical = toCanonical(id);
  if (id !== canonical) {
    log.debug({ context, originalId: id, canonical }, 'ID converted');
  }
  return canonical;
}

// ============================================================================
// COMPARISON HELPERS
// ============================================================================

/**
 * Check if two IDs refer to the same persona (handles all formats).
 */
export function isSamePersona(id1: string, id2: string): boolean {
  return toCanonical(id1) === toCanonical(id2);
}

/**
 * Check if an ID refers to the coach (Ferni).
 */
export function isCoach(id: string): boolean {
  return toCanonical(id) === 'ferni';
}

/**
 * Check if an ID refers to a team member (not coach).
 */
export function isTeamMember(id: string): boolean {
  const canonical = toCanonical(id);
  return canonical !== 'ferni' && ALL_CANONICAL_IDS.includes(canonical);
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  CANONICAL_IDS,
  ALL_CANONICAL_IDS,
  toCanonical,
  toFrontend,
  fromFrontend,
  isCanonicalId,
  isKnownId,
  isSamePersona,
  isCoach,
  isTeamMember,
  getDisplayName,
  assertCanonical,
  validateAndLog,
};
