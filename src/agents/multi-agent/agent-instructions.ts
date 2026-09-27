/**
 * The instructions the agent itself carries.
 *
 * Prompts come in two levels: a model-level block (honesty, human speech
 * patterns, safety boundaries, voice output rules, today's date, who the user
 * is) and the agent-level persona prompt. Realtime models take the first as
 * session instructions. A plain text LLM such as the cascade's Gemini has no
 * such field, so the block was silently dropped there; it has to travel in the
 * agent prompt instead.
 *
 * @module agents/multi-agent/agent-instructions
 */

import type { PromptModuleConfig } from '../model-provider/types.js';

export function composeAgentInstructions(
  personaPrompt: string,
  modelBaseInstructions: string,
  modules: Pick<PromptModuleConfig, 'modelInstructionsInAgentPrompt'>
): string {
  if (!modules.modelInstructionsInAgentPrompt) return personaPrompt;
  const base = modelBaseInstructions.trim();
  // The prompt-load fallback sets both levels to the same text.
  if (!base || base === personaPrompt.trim()) return personaPrompt;
  return `${base}\n\n---\n\n${personaPrompt}`;
}
