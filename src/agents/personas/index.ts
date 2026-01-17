/**
 * Clean Persona Agents - LiveKit 1.0 Pattern
 *
 * This module provides Agent classes for each persona following the LiveKit 1.0 pattern:
 * - Tools defined inline with llm.tool()
 * - Handoffs are just tools that return llm.handoff()
 * - No tool routing needed - LLM decides based on descriptions
 * - System prompts contain personality only, no tool documentation
 *
 * @example
 * ```typescript
 * import { FerniAgent } from './personas';
 *
 * const session = new voice.AgentSession({ vad, stt, tts, llm });
 * await session.start({
 *   room: ctx.room,
 *   agent: new FerniAgent(systemPrompt),
 * });
 * ```
 *
 * @see https://docs.livekit.io/agents/build/agents-handoffs
 */

// Main orchestrator - PersonaVoiceAgent is the canonical name
// FerniAgent is a backwards-compatibility alias
export {
  PersonaVoiceAgent,
  createPersonaVoiceAgent,
  // Backwards compatibility aliases
  FerniAgent,
  createFerniAgent,
  type FerniAgentOptions,
  type PersonaVoiceAgentOptions,
} from './ferni-agent.js';

// Team members - export both classes and async factory functions
export { MayaAgent, createMayaAgent } from './maya-agent.js';
export { AlexAgent, createAlexAgent } from './alex-agent.js';
export { PeterAgent, createPeterAgent } from './peter-agent.js';
export { JordanAgent, createJordanAgent } from './jordan-agent.js';
export { NayanAgent, createNayanAgent } from './nayan-agent.js';

// Prompt utilities
export { loadSystemPrompt, preloadPrompts, getCachedPrompt } from './prompt-loader.js';

// Factory function to create the right agent by persona ID
// All agents now load their rich system prompts from bundles automatically
export async function createAgentForPersona(
  personaId: string,
  systemPrompt?: string
): Promise<import('@livekit/agents').voice.Agent> {
  switch (personaId) {
    case 'ferni':
      // Ferni requires system prompt parameter (loaded externally for first agent)
      if (!systemPrompt) {
        const { loadSystemPrompt } = await import('./prompt-loader.js');
        systemPrompt = await loadSystemPrompt('ferni');
      }
      return new (await import('./ferni-agent.js')).FerniAgent(systemPrompt);
    case 'maya-santos':
    case 'maya':
      return (await import('./maya-agent.js')).MayaAgent.create();
    case 'alex-chen':
    case 'alex':
      return (await import('./alex-agent.js')).AlexAgent.create();
    case 'peter-john':
    case 'peter':
      return (await import('./peter-agent.js')).PeterAgent.create();
    case 'jordan-taylor':
    case 'jordan':
      return (await import('./jordan-agent.js')).JordanAgent.create();
    case 'nayan-patel':
    case 'nayan':
      return (await import('./nayan-agent.js')).NayanAgent.create();
    default:
      // Default to Ferni
      if (!systemPrompt) {
        const { loadSystemPrompt } = await import('./prompt-loader.js');
        systemPrompt = await loadSystemPrompt('ferni');
      }
      return new (await import('./ferni-agent.js')).FerniAgent(systemPrompt);
  }
}
