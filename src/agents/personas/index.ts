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

// Main orchestrator
export { FerniAgent, createFerniAgent } from './ferni-agent.js';

// Team members
export { MayaAgent } from './maya-agent.js';
export { AlexAgent } from './alex-agent.js';
export { PeterAgent } from './peter-agent.js';
export { JordanAgent } from './jordan-agent.js';
export { NayanAgent } from './nayan-agent.js';

// Factory function to create the right agent by persona ID
export async function createAgentForPersona(
  personaId: string,
  systemPrompt: string
): Promise<import('@livekit/agents').voice.Agent> {
  switch (personaId) {
    case 'ferni':
      return new (await import('./ferni-agent.js')).FerniAgent(systemPrompt);
    case 'maya-santos':
      return new (await import('./maya-agent.js')).MayaAgent();
    case 'alex-chen':
      return new (await import('./alex-agent.js')).AlexAgent();
    case 'peter-john':
      return new (await import('./peter-agent.js')).PeterAgent();
    case 'jordan-taylor':
      return new (await import('./jordan-agent.js')).JordanAgent();
    case 'nayan-patel':
      return new (await import('./nayan-agent.js')).NayanAgent();
    default:
      // Default to Ferni
      return new (await import('./ferni-agent.js')).FerniAgent(systemPrompt);
  }
}
