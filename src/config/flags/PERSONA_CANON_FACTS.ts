import type { FlagSpec } from '../flag-spec.js';

// On: each persona's system prompt (prompt-loader.ts loadSystemPrompt) ends with one line of
// its fixed facts from identity/canon-facts.json (personas/persona-canon-facts.ts).
// Off: the prompt is unchanged.
export const PERSONA_CANON_FACTS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
