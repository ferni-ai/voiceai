import type { FlagSpec } from '../flag-spec.js';

// on: the prompt states Ferni's real website and text/email senders, and a reply that gives Ferni's own web address, email or number not among them says "I don't have that in front of me" instead (agents/personas/house-facts.ts, #3001).
export const HOUSE_FACTS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
