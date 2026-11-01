import type { FlagSpec } from '../flag-spec.js';

// on: a pronoun ask (bring him in) after Ferni named the teammate counts as asking, and a held handoff never says the teammate is away (tools/handoff/handoff-consent.ts)
export const HANDOFF_HELD_TRUTHFUL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
