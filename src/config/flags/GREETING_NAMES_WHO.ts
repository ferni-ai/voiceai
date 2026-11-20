import type { FlagSpec } from '../flag-spec.js';

// on: a returning caller's directed hello whose question asks about "her", "him", "them", "it" or "that" without saying who or what ("Did you end up calling her yesterday?") is turned away and the scripted hello plays (agents/multi-agent/greeting-names-who.ts). Off: unchanged.
export const GREETING_NAMES_WHO = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#2388',
} as const satisfies FlagSpec;
