/**
 * Custom agents: user-made characters (a twin of yourself, a loved one, a mentor).
 * Callers outside the context import from here.
 *
 * @module services/custom-agent
 */

export { eraseCustomAgent } from './custom-agent-erase.js';
export { buildLiveCustomAgentPrompt } from './custom-agent-live-prompt.js';
export { NAME_MAX as CUSTOM_AGENT_NAME_MAX } from './custom-agent-live-persona.js';
export { sanitizeOwnerText } from './custom-agent-owner-text.js';
export { customAgentToPersonaConfig } from './custom-agent-runtime-service.js';
