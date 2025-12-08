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

// Import from persona-ids.ts - the SINGLE SOURCE OF TRUTH for alias resolution
import {
  toCanonical,
  isKnownId as isKnownIdFromSource,
  ALIAS_TO_CANONICAL,
  DISPLAY_NAMES,
  type CanonicalPersonaId,
} from './persona-ids.js';

// ============================================================================
// AGENT ROLE ENUM - Stable identifiers based on function, not persona
// ============================================================================

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
export enum AgentRole {
  /** Life coach - main entry point (currently: Ferni) */
  COACH = 'role_coach',
  /** Communication specialist (currently: Alex Chen) */
  COMMUNICATOR = 'role_comms',
  /** Habit tracker / budgeting (currently: Maya Santos) */
  HABITS = 'role_habits',
  /** Life/event planner (currently: Jordan Taylor) */
  PLANNER = 'role_planner',
  /** Research specialist (currently: Peter John) */
  RESEARCHER = 'role_research',
  /** Wisdom/sage figure (currently: Nayan Patel) */
  SAGE = 'role_sage',
}

// ============================================================================
// ID FORMAT TYPES
// ============================================================================

/** Canonical persona IDs - the ONLY format that should be used */
export type PersonaId =
  | 'ferni'
  | 'alex-chen'
  | 'maya-santos'
  | 'jordan-taylor'
  | 'peter-john'
  | 'nayan-patel';

/** Input type for functions - accepts both AgentRole and string aliases */
export type AgentIdInput = AgentRole | string;

/** Agent ID type (alias for PersonaId) - widely used throughout codebase */
export type AgentId = PersonaId;

// ============================================================================
// PERSONA METADATA
// ============================================================================

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

// ============================================================================
// ROLE TO PERSONA MAPPING
// ============================================================================

/**
 * Maps AgentRole enum values to the current persona ID for that role.
 * This is the ONLY place to change when swapping a persona for a role.
 */
export const ROLE_TO_PERSONA: Record<AgentRole, PersonaId> = {
  [AgentRole.COACH]: 'ferni',
  [AgentRole.COMMUNICATOR]: 'alex-chen',
  [AgentRole.HABITS]: 'maya-santos',
  [AgentRole.PLANNER]: 'jordan-taylor',
  [AgentRole.RESEARCHER]: 'peter-john',
  [AgentRole.SAGE]: 'nayan-patel',
};

/**
 * Resolves any agent identifier (AgentRole, PersonaId, or alias) to the canonical PersonaId.
 *
 * @example
 * resolveAgentId(AgentRole.PLANNER) // => 'jordan-taylor'
 * resolveAgentId('jordan')          // => 'jordan-taylor'
 * resolveAgentId('jordan-taylor')   // => 'jordan-taylor'
 */
export function resolveAgentId(input: AgentIdInput): PersonaId {
  // If it's an AgentRole enum value, look up the persona
  if (Object.values(AgentRole).includes(input as AgentRole)) {
    return ROLE_TO_PERSONA[input as AgentRole];
  }

  // Otherwise, resolve string alias to canonical ID
  return getPersonaId(input as string);
}

/**
 * Gets the AgentRole for a given persona ID or alias.
 *
 * @example
 * getAgentRole('jordan-taylor') // => AgentRole.PLANNER
 * getAgentRole('jordan')        // => AgentRole.PLANNER
 */
export function getAgentRoleForPersona(id: string): AgentRole {
  const personaId = getPersonaId(id);
  const metadata = PERSONA_REGISTRY[personaId];
  return metadata.agentRole;
}

/** Complete persona registry with all ID mappings */
export const PERSONA_REGISTRY: Record<PersonaId, PersonaMetadata> = {
  ferni: {
    id: 'ferni',
    agentRole: AgentRole.COACH,
    displayName: 'Ferni',
    shortName: 'Ferni',
    role: 'coach',
    handoffTool: 'handoffToFerni',
    handoffBackTool: 'handoffToFerni',
    aliases: ['jack-b', 'jackie', 'coach', 'life-coach', 'fern'],
  },
  'peter-john': {
    id: 'peter-john',
    agentRole: AgentRole.RESEARCHER,
    displayName: 'Peter John',
    shortName: 'Peter',
    role: 'team',
    handoffTool: 'handoffToPeter',
    handoffBackTool: 'handoffToFerni',
    aliases: ['peter', 'john', 'researcher', 'stock-storyteller'],
  },
  'alex-chen': {
    id: 'alex-chen',
    agentRole: AgentRole.COMMUNICATOR,
    displayName: 'Alex Chen',
    shortName: 'Alex',
    role: 'team',
    handoffTool: 'handoffToAlex',
    handoffBackTool: 'handoffToFerni',
    aliases: ['alex', 'comm-specialist', 'comm', 'communications', 'communicator'],
  },
  'maya-santos': {
    id: 'maya-santos',
    agentRole: AgentRole.HABITS,
    displayName: 'Maya Santos',
    shortName: 'Maya',
    role: 'team',
    handoffTool: 'handoffToMaya',
    handoffBackTool: 'handoffToFerni',
    aliases: [
      'maya',
      'habits-coach',
      'life-habits',
      'routines',
      'habits',
      'spend-save',
      'spend',
      'save',
      'budget',
      'wellness',
      'self-care',
      'debt-counselor',
      'debt',
    ],
  },
  'jordan-taylor': {
    id: 'jordan-taylor',
    agentRole: AgentRole.PLANNER,
    displayName: 'Jordan Taylor',
    shortName: 'Jordan',
    role: 'team',
    handoffTool: 'handoffToJordan',
    handoffBackTool: 'handoffToFerni',
    aliases: [
      'jordan',
      'event-planner',
      'event',
      'planner',
      'events',
      'retirement-specialist',
      'retirement',
    ],
  },
  'nayan-patel': {
    id: 'nayan-patel',
    agentRole: AgentRole.SAGE,
    displayName: 'Nayan Patel',
    shortName: 'Nayan',
    role: 'team',
    handoffTool: 'handoffToNayan',
    handoffBackTool: 'handoffToFerni',
    aliases: ['nayan', 'patel', 'wisdom', 'sage', 'sage-mentor'],
  },
};

// ============================================================================
// ID RESOLUTION FUNCTIONS
// ============================================================================

// NOTE: Alias resolution is delegated to persona-ids.ts (SINGLE SOURCE OF TRUTH)
// We add AgentRole enum values to the resolution for this module only

/** Cache for AgentRole to PersonaId lookups */
const roleToPersonaCache = new Map<string, PersonaId>();

/** Initialize the role cache */
function initializeRoleCache(): void {
  if (roleToPersonaCache.size > 0) return;

  for (const [personaId, metadata] of Object.entries(PERSONA_REGISTRY)) {
    const pid = personaId as PersonaId;
    // Map AgentRole enum value to PersonaId
    roleToPersonaCache.set(metadata.agentRole, pid);
  }
}

/**
 * Get the canonical persona ID from any ID format or alias.
 *
 * NOTE: Delegates to persona-ids.ts for alias resolution (SINGLE SOURCE OF TRUTH),
 * but also handles AgentRole enum values.
 */
export function getPersonaId(id: string): PersonaId {
  // First check if it's an AgentRole enum value
  initializeRoleCache();
  const roleResult = roleToPersonaCache.get(id);
  if (roleResult) {
    return roleResult;
  }

  // Delegate to persona-ids.ts for alias resolution
  return toCanonical(id) as PersonaId;
}

/**
 * Get the display name from any ID format.
 *
 * NOTE: Uses DISPLAY_NAMES from persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export function getDisplayName(id: string): string {
  const personaId = getPersonaId(id);
  // Try PERSONA_REGISTRY first (has full names), then fall back to DISPLAY_NAMES
  return (
    PERSONA_REGISTRY[personaId]?.displayName || DISPLAY_NAMES[personaId as CanonicalPersonaId] || id
  );
}

/**
 * Get the short name from any ID format.
 */
export function getShortName(id: string): string {
  const personaId = getPersonaId(id);
  return PERSONA_REGISTRY[personaId].shortName;
}

/**
 * Get full persona metadata from any ID format.
 */
export function getPersonaMetadata(id: string): PersonaMetadata {
  const personaId = getPersonaId(id);
  return PERSONA_REGISTRY[personaId];
}

/**
 * Get the handoff tool name for a persona.
 */
export function getHandoffToolName(id: string): string {
  const personaId = getPersonaId(id);
  return PERSONA_REGISTRY[personaId].handoffTool;
}

/**
 * Check if an ID refers to the coach (Ferni).
 */
export function isCoach(id: string): boolean {
  const personaId = getPersonaId(id);
  return PERSONA_REGISTRY[personaId].role === 'coach';
}

/**
 * Check if an ID refers to a team member.
 */
export function isTeamMember(id: string): boolean {
  const personaId = getPersonaId(id);
  return PERSONA_REGISTRY[personaId].role === 'team';
}

/**
 * Get all team member persona IDs.
 */
export function getTeamMemberIds(): PersonaId[] {
  return Object.entries(PERSONA_REGISTRY)
    .filter(([_, meta]) => meta.role === 'team')
    .map(([id]) => id as PersonaId);
}

/**
 * Check if an ID is recognized as a valid persona.
 *
 * NOTE: Delegates to persona-ids.ts for alias checking,
 * but also handles AgentRole enum values.
 */
export function isKnownPersonaId(id: string): boolean {
  // Check AgentRole enum values
  initializeRoleCache();
  if (roleToPersonaCache.has(id)) {
    return true;
  }

  // Delegate to persona-ids.ts for alias checking
  return isKnownIdFromSource(id);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PERSONA_REGISTRY,
  getPersonaId,
  getDisplayName,
  getShortName,
  getPersonaMetadata,
  getHandoffToolName,
  isCoach,
  isTeamMember,
  getTeamMemberIds,
  isKnownPersonaId,
};
