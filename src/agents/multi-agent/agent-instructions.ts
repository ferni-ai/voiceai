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
 * Gemini caches a request's prefix. The model-level block ends with this
 * call's date, time and caller (agent-setup.ts), so placed first it made two
 * calls' instructions differ about 1.7k characters in, ahead of the whole
 * persona prompt. PROMPT_STABLE_PREFIX=on puts that call-specific tail after
 * the persona prompt, so every call of a persona starts with the same text.
 *
 * @module agents/multi-agent/agent-instructions
 */

import type { PromptModuleConfig } from '../model-provider/types.js';

type Env = Record<string, string | undefined>;

export function stablePrefixEnabled(env: Env = process.env): boolean {
  return env.PROMPT_STABLE_PREFIX === 'on';
}

/**
 * @param stableBase - The part of `modelBaseInstructions` that is the same on
 *   every call (the shared base file, before date/time and user awareness).
 */
export function composeAgentInstructions(
  personaPrompt: string,
  modelBaseInstructions: string,
  modules: Pick<PromptModuleConfig, 'modelInstructionsInAgentPrompt'>,
  options: { stableBase?: string; env?: Env } = {}
): string {
  if (!modules.modelInstructionsInAgentPrompt) return personaPrompt;
  const base = modelBaseInstructions.trim();
  // The prompt-load fallback sets both levels to the same text.
  if (!base || base === personaPrompt.trim()) return personaPrompt;
  const { stableBase, env = process.env } = options;
  if (stableBase && stablePrefixEnabled(env) && modelBaseInstructions.startsWith(stableBase)) {
    const callSpecific = modelBaseInstructions.slice(stableBase.length).trim();
    const head = `${stableBase.trim()}\n\n---\n\n${personaPrompt}`;
    return callSpecific ? `${head}\n\n${callSpecific}` : head;
  }
  return `${base}\n\n---\n\n${personaPrompt}`;
}
