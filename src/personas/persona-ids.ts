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
  // Standalone personas (not part of Ferni team)
  JOEL_DICKSON: 'joel-dickson',
  // Financial Legends team
  PETER_LYNCH: 'peter-lynch',
  JOHN_BOGLE: 'john-bogle',
} as const;

/**
 * Financial Legends roster - restricted handoff group
 * These three personas can hand off to each other but not to the main Ferni team.
 */
export const FINANCIAL_LEGENDS = ['peter-lynch', 'john-bogle', 'joel-dickson'] as const;

export type FinancialLegendsId = (typeof FINANCIAL_LEGENDS)[number];

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
  'joel-dickson': 'joel-dickson',
  'peter-lynch': 'peter-lynch',
  'john-bogle': 'john-bogle',
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
  'joel-dickson': 'joel-dickson',
  'peter-lynch': 'peter-lynch',
  'john-bogle': 'john-bogle',
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
  fern: 'ferni', // Short alias
  'jack-b': 'ferni', // Legacy alias
  coach: 'ferni',
  'life-coach': 'ferni',
  jackie: 'ferni', // Legacy alias

  // Peter John (Researcher)
  'peter-john': 'peter-john',
  peter: 'peter-john',
  john: 'peter-john', // Last name alias
  lynch: 'peter-john', // Inspired by Peter Lynch
  researcher: 'peter-john',
  'stock-storyteller': 'peter-john',

  // Alex Chen (Communicator)
  'alex-chen': 'alex-chen',
  alex: 'alex-chen',
  chen: 'alex-chen', // Last name alias
  'comm-specialist': 'alex-chen',
  comm: 'alex-chen',
  communications: 'alex-chen',
  communicator: 'alex-chen',
  'generic-advisor': 'alex-chen',

  // Maya Santos (Habits Coach)
  'maya-santos': 'maya-santos',
  maya: 'maya-santos',
  santos: 'maya-santos', // Last name alias
  'spend-save': 'maya-santos',
  spend: 'maya-santos',
  save: 'maya-santos',
  budget: 'maya-santos',
  'habits-coach': 'maya-santos',
  habits: 'maya-santos',
  routines: 'maya-santos',
  wellness: 'maya-santos',
  'self-care': 'maya-santos',
  'debt-counselor': 'maya-santos',
  debt: 'maya-santos',

  // Jordan Taylor (Planner)
  'jordan-taylor': 'jordan-taylor',
  jordan: 'jordan-taylor',
  taylor: 'jordan-taylor', // Last name alias
  'event-planner': 'jordan-taylor',
  event: 'jordan-taylor',
  planner: 'jordan-taylor',
  events: 'jordan-taylor',
  'retirement-specialist': 'jordan-taylor',
  retirement: 'jordan-taylor',
  milestones: 'jordan-taylor',

  // Nayan Patel (Sage / Lifetime Advisor)
  'nayan-patel': 'nayan-patel',
  nayan: 'nayan-patel',
  patel: 'nayan-patel',
  sage: 'nayan-patel',
  'sage-mentor': 'nayan-patel', // Legacy role ID
  guru: 'nayan-patel',
  mystic: 'nayan-patel',
  wisdom: 'nayan-patel',
  'lifetime-advisor': 'nayan-patel',
  'spiritual-guide': 'nayan-patel',

  // Joel Dickson (Life Mentor - Financial Legends)
  'joel-dickson': 'joel-dickson',
  joel: 'joel-dickson',
  dickson: 'joel-dickson',
  'dr-dickson': 'joel-dickson',
  'vanguard-mentor': 'joel-dickson',
  'life-mentor': 'joel-dickson',

  // Peter Lynch (Stock Picker - Financial Legends)
  'peter-lynch': 'peter-lynch',
  'stock-picker': 'peter-lynch',
  magellan: 'peter-lynch',
  'fidelity-legend': 'peter-lynch',

  // John Bogle (Index Pioneer - Financial Legends)
  'john-bogle': 'john-bogle',
  bogle: 'john-bogle',
  'jack-bogle': 'john-bogle',
  jack: 'john-bogle',
  'vanguard-founder': 'john-bogle',
  'index-pioneer': 'john-bogle',
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
  'joel-dickson': 'Joel',
  'peter-lynch': 'Peter Lynch',
  'john-bogle': 'John Bogle',
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
 *
 * NOTE: For marketplace agents not in ALIAS_TO_CANONICAL, this compares IDs directly.
 * For core team members, it resolves aliases before comparison.
 */
export function isSamePersona(id1: string, id2: string): boolean {
  const normalized1 = id1.toLowerCase().trim();
  const normalized2 = id2.toLowerCase().trim();

  // First try direct comparison (handles marketplace agents)
  if (normalized1 === normalized2) {
    return true;
  }

  // For core team, resolve aliases and compare
  const canonical1 = ALIAS_TO_CANONICAL[normalized1];
  const canonical2 = ALIAS_TO_CANONICAL[normalized2];

  // If both are in alias map, compare canonical forms
  if (canonical1 && canonical2) {
    return canonical1 === canonical2;
  }

  // If one is in alias map, compare against normalized form
  if (canonical1) {
    return canonical1 === normalized2;
  }
  if (canonical2) {
    return canonical2 === normalized1;
  }

  // Neither in alias map - already compared normalized forms above
  return false;
}

// Ferni (coach) aliases for direct matching - avoids toCanonical warnings for marketplace agents
const FERNI_ALIASES = new Set(['ferni', 'fern', 'jack-b', 'coach', 'life-coach', 'jackie']);

/**
 * Check if an ID refers to the coach (Ferni).
 *
 * NOTE: This directly checks against known Ferni aliases instead of using toCanonical()
 * to avoid warning spam when marketplace agent IDs are passed through.
 * Marketplace agents are NOT the coach, so we return false for unknown IDs.
 */
export function isCoach(id: string): boolean {
  const normalized = id.toLowerCase().trim();
  return FERNI_ALIASES.has(normalized);
}

/**
 * Check if an ID refers to a core team member (not coach, not marketplace agent).
 *
 * NOTE: Returns false for marketplace agents since they're not part of the core Ferni team.
 * To check if something is a valid agent at all, use AgentRegistry.hasAgent() instead.
 */
export function isTeamMember(id: string): boolean {
  const normalized = id.toLowerCase().trim();
  const canonical = ALIAS_TO_CANONICAL[normalized];

  // Must be in alias map and not ferni to be a core team member
  return canonical !== undefined && canonical !== 'ferni' && ALL_CANONICAL_IDS.includes(canonical);
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
