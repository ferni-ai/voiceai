/**
 * Agent Domain Tools
 *
 * Barrel export for agent coordination tools:
 * - Handoff between agents (Jack ↔ Peter ↔ Alex ↔ etc)
 * - Peter John stock picking
 */

export { createHandoffTools, normalizeAgentId, getAgentDisplayName } from '../handoff/index.js';
export {
  createResearchTools,
  createResearchTools as createPeterLynchTools,
} from '../research-tools.js';

// Re-export voice ID retrieval from voice-registry (preferred over deprecated constants)
export { getVoiceId, getCanonicalPersonaId } from '../../personas/voice-registry.js';
