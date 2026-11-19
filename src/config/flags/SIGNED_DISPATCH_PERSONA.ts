import type { FlagSpec } from '../flag-spec.js';

// on: a dispatch type only our server places (on-behalf call, family check-in, proactive outreach) picks its persona and voice from persona_id only when the dispatch as sent carries a valid signature; a tampered one gets the default persona (voice-agent-entry/metadata-parser.ts). Other dispatch types are unchanged. off = persona_id is read from every dispatch, as before.
export const SIGNED_DISPATCH_PERSONA = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4111',
} as const satisfies FlagSpec;
