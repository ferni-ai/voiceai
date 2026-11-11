import type { FlagSpec } from '../flag-spec.js';

// on: a pronoun ask (bring him in) after Ferni named the teammate counts as asking, a bare yes to a pronoun offer of the one teammate just named counts as agreeing, and a held handoff never says the teammate is away and asks Ferni to offer by name (tools/handoff/handoff-consent.ts)
export const HANDOFF_HELD_TRUTHFUL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
