/**
 * Persona ID Mapping - Single Source of Truth
 *
 * This module provides centralized ID mapping for personas.
 * 
 * CANONICAL IDs (used everywhere):
 * - ferni, alex-chen, maya-santos, jordan-taylor, peter-john, nayan-patel
 *
 * Legacy aliases are still supported for backward compatibility but canonical IDs
 * should be used in all new code.
 */

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

/** @deprecated Use PersonaId instead */
export type BundleId = PersonaId;

/** @deprecated Use PersonaId instead - all IDs are now canonical */
export type FrontendId = PersonaId;

/** @deprecated Use PersonaId instead - all IDs are now canonical */
export type AgentId = PersonaId;

// ============================================================================
// PERSONA METADATA
// ============================================================================

export interface PersonaMetadata {
  id: PersonaId;
  /** @deprecated Use id instead */
  bundleId: PersonaId;
  /** @deprecated Use id instead */
  frontendId: PersonaId;
  /** @deprecated Use id instead */
  agentId: PersonaId;
  displayName: string;
  shortName: string;
  role: 'coach' | 'team';
  handoffTool: string;
  handoffBackTool: string;
  aliases: string[];
}

/** Complete persona registry with all ID mappings */
export const PERSONA_REGISTRY: Record<PersonaId, PersonaMetadata> = {
  ferni: {
    id: 'ferni',
    bundleId: 'ferni',
    frontendId: 'ferni',
    agentId: 'ferni',
    displayName: 'Ferni',
    shortName: 'Ferni',
    role: 'coach',
    handoffTool: 'handoffToFerni',
    handoffBackTool: 'handoffToFerni',
    aliases: ['jack-b', 'jackie', 'coach', 'life-coach', 'fern'],
  },
  'peter-john': {
    id: 'peter-john',
    bundleId: 'peter-john',
    frontendId: 'peter-john',
    agentId: 'peter-john',
    displayName: 'Peter John',
    shortName: 'Peter',
    role: 'team',
    handoffTool: 'handoffToPeter',
    handoffBackTool: 'handoffToFerni',
    aliases: ['peter', 'john', 'researcher', 'stock-storyteller'],
  },
  'alex-chen': {
    id: 'alex-chen',
    bundleId: 'alex-chen',
    frontendId: 'alex-chen',
    agentId: 'alex-chen',
    displayName: 'Alex Chen',
    shortName: 'Alex',
    role: 'team',
    handoffTool: 'handoffToAlex',
    handoffBackTool: 'handoffToFerni',
    aliases: ['alex', 'comm-specialist', 'comm', 'communications', 'communicator'],
  },
  'maya-santos': {
    id: 'maya-santos',
    bundleId: 'maya-santos',
    frontendId: 'maya-santos',
    agentId: 'maya-santos',
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
    bundleId: 'jordan-taylor',
    frontendId: 'jordan-taylor',
    agentId: 'jordan-taylor',
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
    bundleId: 'nayan-patel',
    frontendId: 'nayan-patel',
    agentId: 'nayan-patel',
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

/** Cache for fast alias lookups */
const aliasCache = new Map<string, PersonaId>();

/** Initialize the alias cache */
function initializeAliasCache(): void {
  if (aliasCache.size > 0) return;

  for (const [personaId, metadata] of Object.entries(PERSONA_REGISTRY)) {
    const pid = personaId as PersonaId;

    // Add canonical ID
    aliasCache.set(pid, pid);
    aliasCache.set(metadata.displayName.toLowerCase(), pid);
    aliasCache.set(metadata.shortName.toLowerCase(), pid);

    // Add all aliases (for backward compatibility)
    for (const alias of metadata.aliases) {
      aliasCache.set(alias.toLowerCase(), pid);
    }
  }
}

/**
 * Get the canonical persona ID from any ID format or alias.
 * This is the master resolution function.
 */
export function getPersonaId(id: string): PersonaId {
  initializeAliasCache();
  const normalized = id.toLowerCase().trim();
  return aliasCache.get(normalized) || 'ferni'; // Default to coach
}

/** @deprecated Use getPersonaId instead */
export function getBundleId(id: string): PersonaId {
  return getPersonaId(id);
}

/** @deprecated Use getPersonaId instead */
export function getFrontendId(id: string): PersonaId {
  return getPersonaId(id);
}

/** @deprecated Use getPersonaId instead */
export function getAgentId(id: string): PersonaId {
  return getPersonaId(id);
}

/**
 * Get the display name from any ID format.
 */
export function getDisplayName(id: string): string {
  const personaId = getPersonaId(id);
  return PERSONA_REGISTRY[personaId].displayName;
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
 */
export function isKnownPersonaId(id: string): boolean {
  initializeAliasCache();
  return aliasCache.has(id.toLowerCase().trim());
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PERSONA_REGISTRY,
  getPersonaId,
  getBundleId, // deprecated
  getFrontendId, // deprecated
  getAgentId, // deprecated
  getDisplayName,
  getShortName,
  getPersonaMetadata,
  getHandoffToolName,
  isCoach,
  isTeamMember,
  getTeamMemberIds,
  isKnownPersonaId,
};
