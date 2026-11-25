import type { FlagSpec } from '../flag-spec.js';

// on: the prompt says Ferni can't see anyone else's conversations and never counts, quotes or describes them, the director is told the same, and a director note that asks for a usage number or other callers' questions is dropped (agents/personas/no-invented-usage.ts, #3028).
export const NO_INVENTED_USAGE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3028',
  context:
    'Keep if no reply on a call with it on counts callers or quotes another caller; else delete.',
} as const satisfies FlagSpec;
