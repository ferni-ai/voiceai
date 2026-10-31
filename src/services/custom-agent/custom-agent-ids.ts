/**
 * Custom agent id detection, with no imports: the TTS path checks ids on every reply and
 * must not load the custom-agent runtime (and its Firestore client) to do it.
 */

// Custom agent ID prefixes for detection
export const CUSTOM_AGENT_PREFIXES = ['agent_', 'custom_', 'ca_'];

/**
 * Check if a persona ID is a custom agent
 */
export function isCustomAgentId(personaId: string): boolean {
  return CUSTOM_AGENT_PREFIXES.some((prefix) => personaId.startsWith(prefix));
}
