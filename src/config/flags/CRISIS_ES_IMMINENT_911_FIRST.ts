import type { FlagSpec } from '../flag-spec.js';

// off | on (#4310): Spanish twins of the English imminent crisis patterns (on the bridge or ledge and about to jump, pills taken or kicking in, an overdose, the noose ready, a gun to the head or in the lap, the engine running in the garage, by the time anyone reads this) read as the caller's own imminent crisis, and the Spanish crisis reply leads with 911 before its 988 line. Escalate-only: it adds the imminent read and a line, never removes one. Off: Spanish reads and replies as before. Read from process.env (safety/crisis-spanish-imminent.ts, called by crisis-guard.ts and crisis-guard-replies.ts).
export const CRISIS_ES_IMMINENT_911_FIRST = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4310',
  context:
    'Promote after an independent verify, the crisis owner yes, a Spanish speaker listening to the reply, and clean dev nights; then make permanent, else delete.',
} as const satisfies FlagSpec;
