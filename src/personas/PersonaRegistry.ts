/**
 * PersonaRegistry - DEPRECATED
 *
 * @deprecated This module is deprecated. Use the unified registry instead:
 *
 *   import { AgentRegistry, Agent } from './registry/unified-registry.js';
 *
 * The unified registry:
 * - Auto-discovers agents from bundles (no hardcoding)
 * - Single source of truth for all agent lookups
 * - Dynamic handoff tool generation
 *
 * Migration examples:
 *
 *   // OLD (deprecated):
 *   const alex = PersonaRegistry.get('alex');
 *
 *   // NEW (use this):
 *   const alex = await AgentRegistry.getAgent('alex');
 *
 * Migration guide: See docs/AGENT-MANAGEMENT.md
 *
 * This file is kept for backwards compatibility and will be removed in a future version.
 */

// Log deprecation warning on first import
console.warn(
  '⚠️ DEPRECATED: PersonaRegistry.ts is deprecated. ' +
    'Use AgentRegistry from registry/unified-registry.js instead.'
);

import { getVoiceIdForPersona } from '../config/voice-ids.js';

// ============================================================================
// PERSONA INTERFACE
// ============================================================================

/**
 * The Persona object - contains EVERYTHING about a persona.
 * Pass this object around instead of ID strings!
 */
export interface Persona {
  /** Canonical ID (ferni, alex-chen, maya-santos, jordan-taylor, peter-john) */
  readonly id: string;
  /** Display name (Ferni, Alex, Maya, Jordan, Peter) */
  readonly name: string;
  /** Voice ID for TTS */
  readonly voiceId: string;
  /** Role: coach or team member */
  readonly role: 'coach' | 'team';
  /** Is this the coach (Ferni)? */
  readonly isCoach: boolean;
  /** Handoff tool name to transfer TO this persona */
  readonly handoffTool: string;
  /** All known aliases for this persona */
  readonly aliases: readonly string[];
}

// ============================================================================
// PERSONA DATA
// ============================================================================

const PERSONAS: Record<string, Persona> = {
  ferni: {
    id: 'ferni',
    name: 'Ferni',
    voiceId: getVoiceIdForPersona('ferni'),
    role: 'coach',
    isCoach: true,
    handoffTool: 'handoffToFerni',
    aliases: ['ferni', 'jack-b', 'coach', 'life-coach', 'jackie'],
  },
  'peter-john': {
    id: 'peter-john',
    name: 'Peter',
    voiceId: getVoiceIdForPersona('peter-john'),
    role: 'team',
    isCoach: false,
    handoffTool: 'handoffToPeter',
    aliases: ['peter-john', 'peter', 'john', 'researcher'],
  },
  'alex-chen': {
    id: 'alex-chen',
    name: 'Alex',
    voiceId: getVoiceIdForPersona('alex-chen'),
    role: 'team',
    isCoach: false,
    handoffTool: 'handoffToAlex',
    aliases: ['alex-chen', 'alex', 'comm-specialist', 'comm', 'communications'],
  },
  'maya-santos': {
    id: 'maya-santos',
    name: 'Maya',
    voiceId: getVoiceIdForPersona('maya-santos'),
    role: 'team',
    isCoach: false,
    handoffTool: 'handoffToMaya',
    aliases: ['maya-santos', 'maya', 'spend-save', 'budget', 'habits-coach'],
  },
  'jordan-taylor': {
    id: 'jordan-taylor',
    name: 'Jordan',
    voiceId: getVoiceIdForPersona('jordan-taylor'),
    role: 'team',
    isCoach: false,
    handoffTool: 'handoffToJordan',
    aliases: ['jordan-taylor', 'jordan', 'event-planner', 'planner', 'events'],
  },
  'nayan-patel': {
    id: 'nayan-patel',
    name: 'Nayan',
    voiceId: getVoiceIdForPersona('nayan-patel'),
    role: 'team',
    isCoach: false,
    handoffTool: 'handoffToNayan',
    aliases: ['nayan-patel', 'nayan', 'patel', 'guru', 'mystic', 'lifetime-advisor'],
  },
};

// Build alias lookup map
const ALIAS_MAP = new Map<string, Persona>();
for (const persona of Object.values(PERSONAS)) {
  for (const alias of persona.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), persona);
  }
  // Also map the canonical ID
  ALIAS_MAP.set(persona.id.toLowerCase(), persona);
}

// ============================================================================
// PERSONA REGISTRY
// ============================================================================

/**
 * PersonaRegistry - Get personas by any ID/alias.
 *
 * This is the ONLY way to look up personas. No more string ID passing!
 */
export const PersonaRegistry = {
  /**
   * Get a persona by ANY id or alias.
   * Returns the same Persona object regardless of which alias is used.
   *
   * @param id - Any persona ID, alias, or variant
   * @returns Persona object (defaults to Ferni if unknown)
   */
  get(id: string): Persona {
    const normalized = id.toLowerCase().trim();
    const persona = ALIAS_MAP.get(normalized);

    if (!persona) {
      console.warn(`⚠️ Unknown persona "${id}", returning Ferni`);
      return PERSONAS['ferni'];
    }

    return persona;
  },

  /**
   * Get the coach persona (Ferni).
   */
  getCoach(): Persona {
    return PERSONAS['ferni'];
  },

  /**
   * Get all team members (excluding coach).
   */
  getTeamMembers(): Persona[] {
    return Object.values(PERSONAS).filter((p) => !p.isCoach);
  },

  /**
   * Get all personas.
   */
  getAll(): Persona[] {
    return Object.values(PERSONAS);
  },

  /**
   * Check if two IDs refer to the same persona.
   */
  isSame(id1: string, id2: string): boolean {
    return this.get(id1).id === this.get(id2).id;
  },

  /**
   * Check if an ID is known.
   */
  isKnown(id: string): boolean {
    return ALIAS_MAP.has(id.toLowerCase().trim());
  },

  /**
   * Get persona by handoff tool name.
   */
  getByHandoffTool(toolName: string): Persona | undefined {
    return Object.values(PERSONAS).find((p) => p.handoffTool === toolName);
  },
};

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/** The coach persona (Ferni) */
export const COACH = PERSONAS['ferni'];

/** All canonical persona IDs */
export const ALL_PERSONA_IDS = Object.keys(PERSONAS) as readonly string[];

// ============================================================================
// HANDOFF EVENT TYPE
// ============================================================================

/**
 * The new handoff event data - uses Persona objects instead of string IDs.
 * This is the ONLY format that should be emitted for voiceSwitch events.
 */
export interface HandoffEventData {
  /** The persona being handed off TO (full object, no ID lookups needed) */
  persona: Persona;
  /** Optional greeting for the new persona to say */
  greeting?: string;
  /** Sound to play during transition */
  playSound?: string;
  /** Previous agent's canonical ID (for logging/analytics) */
  previousAgentId?: string;
}

/**
 * Create a handoff event payload from any persona ID.
 * This is the ONLY way to create handoff events - ensures consistency.
 *
 * @example
 * ```typescript
 * // Old (bad) way:
 * handoffEvents.emit('voiceSwitch', {
 *   newAgent: 'alex-chen', // or was it 'alex'? or 'comm-specialist'?
 *   voiceId: getVoiceId('alex-chen') // another lookup!
 * });
 *
 * // New (good) way:
 * handoffEvents.emit('voiceSwitch', createHandoffEvent('alex', {
 *   greeting: 'Hey there!',
 *   playSound: HANDOFF_SOUNDS.toAlex
 * }));
 * ```
 */
export function createHandoffEvent(
  targetId: string,
  options: {
    greeting?: string;
    playSound?: string;
    previousAgentId?: string;
  } = {}
): HandoffEventData {
  const persona = PersonaRegistry.get(targetId);
  return {
    persona,
    greeting: options.greeting,
    playSound: options.playSound,
    previousAgentId: options.previousAgentId,
  };
}

// Default export for convenience
export default PersonaRegistry;
