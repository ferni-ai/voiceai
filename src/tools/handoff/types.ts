/**
 * Handoff Types
 * Type definitions for the handoff system
 */

import type { AgentId } from '../../services/agent-bus.js';
import type { PersonaConfig } from '../../personas/types.js';
// NOTE: getPersona is dynamically imported below to avoid circular dependency

/**
 * Data emitted for voiceSwitch events during handoffs.
 * The canonical format for all handoff event emissions.
 */
export interface HandoffEventData {
  /** The persona being handed off TO (full object, no ID lookups needed) */
  persona: PersonaConfig;
  /** Shortcut to persona.id for convenience */
  agentId: string;
  /** Voice ID for TTS - CRITICAL for voice switching! */
  voiceId: string;
  /** Optional greeting for the new persona to say */
  greeting?: string;
  /** Sound to play during transition */
  playSound?: string;
  /** Previous agent's canonical ID (for logging/analytics) */
  previousAgentId?: string;
}

/**
 * Create a handoff event data object for emitting voiceSwitch events.
 *
 * @example
 * const event = await createHandoffEvent('alex-chen', {
 *   greeting: 'Hey! Alex here.',
 *   previousAgentId: 'ferni'
 * });
 * handoffEvents.emit('voiceSwitch', event);
 */
export async function createHandoffEvent(
  targetId: string,
  options: {
    greeting?: string;
    playSound?: string;
    previousAgentId?: string;
  } = {}
): Promise<HandoffEventData> {
  // Dynamic import to avoid circular dependency through personas/index
  // 🐛 FIX: Use getPersonaAsync instead of sync getPersona to ensure bundle is loaded
  // This was the ROOT CAUSE of Maya handoff failures - the sync function returns undefined
  // if the persona bundle hasn't been loaded yet!
  const { getPersonaAsync } = await import('../../personas/index.js');
  const persona = await getPersonaAsync(targetId);
  if (!persona) {
    throw new Error(
      `Cannot create handoff event: persona "${targetId}" not found (bundle may not be loaded)`
    );
  }

  // 🐛 FIX: Extract voiceId from persona.voice.voiceId - CRITICAL for TTS voice switching!
  // Without this, the TTS continues using the previous persona's voice even after handoff.
  const voiceId = persona.voice?.voiceId;
  if (!voiceId) {
    throw new Error(`Cannot create handoff event: persona "${targetId}" has no voiceId configured`);
  }

  return {
    persona,
    agentId: persona.id,
    voiceId,
    greeting: options.greeting,
    playSound: options.playSound,
    previousAgentId: options.previousAgentId,
  };
}

/**
 * Represents context passed during a handoff between agents
 */
export interface HandoffContext {
  /** The reason for the handoff */
  reason: string;
  /** Previous conversation summary */
  conversationSummary?: string;
  /** User's current goal */
  userGoal?: string;
  /** Any relevant user data */
  userData?: Record<string, unknown>;
  /** Timestamp of the handoff */
  timestamp: number;
}

/**
 * Record of a completed handoff
 */
export interface HandoffRecord {
  /** Timestamp of the handoff */
  timestamp: number;
  /** Source agent ID */
  from: AgentId;
  /** Target agent ID */
  to: AgentId;
  /** Reason for the handoff */
  reason: string;
  /** Duration of the handoff in ms */
  duration?: number;
}

/**
 * Analytics about handoff patterns
 */
export interface HandoffAnalytics {
  /** Total number of handoffs */
  totalHandoffs: number;
  /** Handoffs by source agent */
  bySource: Record<string, number>;
  /** Handoffs by target agent */
  byTarget: Record<string, number>;
  /** Average handoff duration */
  avgDuration: number;
  /** Most common handoff pair */
  mostCommonPair?: { from: string; to: string; count: number };
}
