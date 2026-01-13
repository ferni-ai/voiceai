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
export declare const CANONICAL_IDS: {
    readonly COACH: "ferni";
    readonly RESEARCHER: "peter-john";
    readonly COMMUNICATOR: "alex-chen";
    readonly BUDGETER: "maya-santos";
    readonly PLANNER: "jordan-taylor";
    readonly SAGE: "nayan-patel";
    readonly JOEL_DICKSON: "joel-dickson";
};
export type CanonicalPersonaId = (typeof CANONICAL_IDS)[keyof typeof CANONICAL_IDS];
/**
 * All canonical IDs as an array (for validation)
 */
export declare const ALL_CANONICAL_IDS: readonly CanonicalPersonaId[];
export type FrontendPersonaId = CanonicalPersonaId;
/**
 * Map canonical ID → frontend ID
 * After standardization, this is an identity mapping.
 */
export declare const CANONICAL_TO_FRONTEND: Record<CanonicalPersonaId, CanonicalPersonaId>;
/**
 * Map frontend ID → canonical ID
 * After standardization, this is an identity mapping.
 * Legacy IDs are still supported via ALIAS_TO_CANONICAL.
 */
export declare const FRONTEND_TO_CANONICAL: Record<CanonicalPersonaId, CanonicalPersonaId>;
/**
 * ALL known aliases → canonical ID
 *
 * 🔑 SINGLE SOURCE OF TRUTH for alias resolution.
 * ALL other modules should use toCanonical() from this file
 * rather than maintaining separate alias maps.
 */
export declare const ALIAS_TO_CANONICAL: Record<string, CanonicalPersonaId>;
/**
 * Check if a string is a canonical persona ID.
 */
export declare function isCanonicalId(id: string): id is CanonicalPersonaId;
/**
 * Check if a string is a known persona ID or alias.
 */
export declare function isKnownId(id: string): boolean;
/**
 * Convert ANY persona ID/alias to canonical form.
 * This is the ONLY function that should be used to normalize IDs.
 *
 * @param id - Any persona ID, alias, or variant
 * @returns Canonical ID
 * @throws Error if ID is completely unknown (strict mode)
 */
export declare function toCanonical(id: string, strict?: boolean): CanonicalPersonaId;
/**
 * Convert ANY persona ID to frontend form.
 * After standardization, this just returns the canonical ID.
 */
export declare function toFrontend(id: string): CanonicalPersonaId;
/**
 * Convert frontend ID to canonical form.
 * After standardization, this just returns the canonical ID.
 * Legacy IDs are handled via toCanonical.
 */
export declare function fromFrontend(frontendId: string): CanonicalPersonaId;
export declare const DISPLAY_NAMES: Record<CanonicalPersonaId, string>;
export declare function getDisplayName(id: string): string;
/**
 * Assert that an ID is canonical. Use this in critical paths.
 */
export declare function assertCanonical(id: string, context?: string): asserts id is CanonicalPersonaId;
/**
 * Validate and log ID conversion (for debugging).
 */
export declare function validateAndLog(id: string, context: string): CanonicalPersonaId;
/**
 * Check if two IDs refer to the same persona (handles all formats).
 *
 * NOTE: For marketplace agents not in ALIAS_TO_CANONICAL, this compares IDs directly.
 * For core team members, it resolves aliases before comparison.
 */
export declare function isSamePersona(id1: string, id2: string): boolean;
/**
 * Check if an ID refers to the coach (Ferni).
 *
 * NOTE: This directly checks against known Ferni aliases instead of using toCanonical()
 * to avoid warning spam when marketplace agent IDs are passed through.
 * Marketplace agents are NOT the coach, so we return false for unknown IDs.
 */
export declare function isCoach(id: string): boolean;
/**
 * Check if an ID refers to a core team member (not coach, not marketplace agent).
 *
 * NOTE: Returns false for marketplace agents since they're not part of the core Ferni team.
 * To check if something is a valid agent at all, use AgentRegistry.hasAgent() instead.
 */
export declare function isTeamMember(id: string): boolean;
declare const _default: {
    CANONICAL_IDS: {
        readonly COACH: "ferni";
        readonly RESEARCHER: "peter-john";
        readonly COMMUNICATOR: "alex-chen";
        readonly BUDGETER: "maya-santos";
        readonly PLANNER: "jordan-taylor";
        readonly SAGE: "nayan-patel";
        readonly JOEL_DICKSON: "joel-dickson";
    };
    ALL_CANONICAL_IDS: readonly CanonicalPersonaId[];
    toCanonical: typeof toCanonical;
    toFrontend: typeof toFrontend;
    fromFrontend: typeof fromFrontend;
    isCanonicalId: typeof isCanonicalId;
    isKnownId: typeof isKnownId;
    isSamePersona: typeof isSamePersona;
    isCoach: typeof isCoach;
    isTeamMember: typeof isTeamMember;
    getDisplayName: typeof getDisplayName;
    assertCanonical: typeof assertCanonical;
    validateAndLog: typeof validateAndLog;
};
export default _default;
//# sourceMappingURL=persona-ids.d.ts.map