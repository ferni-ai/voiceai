/**
 * Persona ID Mapping - Core ID Types and Resolution
 *
 * This module provides:
 * - AgentRole enum (role-based identifiers)
 * - PersonaId type (canonical persona IDs)
 * - PERSONA_REGISTRY (persona metadata)
 * - ID resolution functions
 *
 * NOTE: Alias resolution is delegated to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 * This module focuses on AgentRole enum and persona metadata.
 *
 * NOTE: For new code, prefer importing via the central module:
 *   import { AgentRole, getPersonaId, isCoach } from '../personas/index.js';
 *
 * CORE EXPORTS (kept):
 *
 * AGENT ROLES (stable, role-based identifiers):
 * Use AgentRole enum values in code for type safety and easy persona swapping.
 * - AgentRole.COACH - Life coach (currently: Ferni)
 * - AgentRole.COMMUNICATOR - Communication specialist (currently: Alex)
 * - AgentRole.HABITS - Habit/budget tracker (currently: Maya)
 * - AgentRole.PLANNER - Life/event planner (currently: Jordan)
 * - AgentRole.RESEARCHER - Research specialist (currently: Peter)
 * - AgentRole.SAGE - Wisdom/mentor figure (currently: Nayan)
 *
 * CANONICAL IDs (string-based, for storage/display):
 * - ferni, alex-chen, maya-santos, jordan-taylor, peter-john, nayan-patel
 *
 * Legacy aliases are still supported for backward compatibility.
 */
/**
 * Agent roles are stable identifiers based on the agent's FUNCTION.
 * Use these instead of string IDs to enable easy persona swapping.
 *
 * @example
 * // Good - role-based
 * handoff(AgentRole.PLANNER)
 *
 * // Avoid - string-based (harder to swap personas)
 * handoff('jordan-taylor')
 */
export declare enum AgentRole {
    /** Life coach - main entry point (currently: Ferni) */
    COACH = "role_coach",
    /** Communication specialist (currently: Alex Chen) */
    COMMUNICATOR = "role_comms",
    /** Habit tracker / budgeting (currently: Maya Santos) */
    HABITS = "role_habits",
    /** Life/event planner (currently: Jordan Taylor) */
    PLANNER = "role_planner",
    /** Research specialist (currently: Peter John) */
    RESEARCHER = "role_research",
    /** Wisdom/sage figure (currently: Nayan Patel) */
    SAGE = "role_sage"
}
/** Canonical persona IDs - the ONLY format that should be used */
export type PersonaId = 'ferni' | 'alex-chen' | 'maya-santos' | 'jordan-taylor' | 'peter-john' | 'nayan-patel';
/** Input type for functions - accepts both AgentRole and string aliases */
export type AgentIdInput = AgentRole | string;
/** Agent ID type (alias for PersonaId) - widely used throughout codebase */
export type AgentId = PersonaId;
export interface PersonaMetadata {
    id: PersonaId;
    agentRole: AgentRole;
    displayName: string;
    shortName: string;
    role: 'coach' | 'team';
    handoffTool: string;
    handoffBackTool: string;
    aliases: string[];
}
/**
 * Maps AgentRole enum values to the current persona ID for that role.
 * This is the ONLY place to change when swapping a persona for a role.
 */
export declare const ROLE_TO_PERSONA: Record<AgentRole, PersonaId>;
/**
 * Resolves any agent identifier (AgentRole, PersonaId, or alias) to the canonical PersonaId.
 *
 * @example
 * resolveAgentId(AgentRole.PLANNER) // => 'jordan-taylor'
 * resolveAgentId('jordan')          // => 'jordan-taylor'
 * resolveAgentId('jordan-taylor')   // => 'jordan-taylor'
 */
export declare function resolveAgentId(input: AgentIdInput): PersonaId;
/**
 * Gets the AgentRole for a given persona ID or alias.
 *
 * @example
 * getAgentRole('jordan-taylor') // => AgentRole.PLANNER
 * getAgentRole('jordan')        // => AgentRole.PLANNER
 */
export declare function getAgentRoleForPersona(id: string): AgentRole;
/** Complete persona registry with all ID mappings */
export declare const PERSONA_REGISTRY: Record<PersonaId, PersonaMetadata>;
/**
 * Get the canonical persona ID from any ID format or alias.
 *
 * NOTE: Delegates to persona-ids.ts for alias resolution (SINGLE SOURCE OF TRUTH),
 * but also handles AgentRole enum values.
 */
export declare function getPersonaId(id: string): PersonaId;
/**
 * Get the display name from any ID format.
 *
 * NOTE: Uses DISPLAY_NAMES from persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export declare function getDisplayName(id: string): string;
/**
 * Get the short name from any ID format.
 */
export declare function getShortName(id: string): string;
/**
 * Get full persona metadata from any ID format.
 */
export declare function getPersonaMetadata(id: string): PersonaMetadata;
/**
 * Get the handoff tool name for a persona.
 */
export declare function getHandoffToolName(id: string): string;
/**
 * Check if an ID refers to the coach (Ferni).
 */
export declare function isCoach(id: string): boolean;
/**
 * Check if an ID refers to a team member.
 */
export declare function isTeamMember(id: string): boolean;
/**
 * Get all team member persona IDs.
 */
export declare function getTeamMemberIds(): PersonaId[];
/**
 * Check if an ID is recognized as a valid persona.
 *
 * NOTE: Delegates to persona-ids.ts for alias checking,
 * but also handles AgentRole enum values.
 */
export declare function isKnownPersonaId(id: string): boolean;
declare const _default: {
    PERSONA_REGISTRY: Record<PersonaId, PersonaMetadata>;
    getPersonaId: typeof getPersonaId;
    getDisplayName: typeof getDisplayName;
    getShortName: typeof getShortName;
    getPersonaMetadata: typeof getPersonaMetadata;
    getHandoffToolName: typeof getHandoffToolName;
    isCoach: typeof isCoach;
    isTeamMember: typeof isTeamMember;
    getTeamMemberIds: typeof getTeamMemberIds;
    isKnownPersonaId: typeof isKnownPersonaId;
};
export default _default;
//# sourceMappingURL=id-mapping.d.ts.map