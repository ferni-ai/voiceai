/**
 * Agent Domain Tools
 *
 * Barrel export for agent coordination tools:
 * - Handoff between agents (Jack ↔ Peter ↔ Alex ↔ etc)
 * - Peter John stock research & analysis
 */
export { createHandoffTools, normalizeAgentId, getAgentDisplayName } from '../handoff/index.js';
export { createResearchTools } from './research/research-tools.js';
export { createInsightsAnalysisTools } from './research/insights-analysis.js';
// Re-export voice ID retrieval from voice-registry (preferred over deprecated constants)
export { getVoiceId, getCanonicalPersonaId } from '../../personas/voice-registry.js';
//# sourceMappingURL=agent.js.map