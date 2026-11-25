import type { FlagSpec } from '../flag-spec.js';

// off | on: the reply gate reads every caller line since Ferni's last completed reply (not one the caller spoke over) and acts on the strongest classifier read of its turn, its own or the turn pipeline's. A failed other read is never a script: the classifier-timeout check-in decides (CRISIS_TIMEOUT_CHECKIN). Only raises; logs counts and wait times only (agents/personas/crisis-gate-turn-reads.ts). Dev on after merge; the owner sets prod timing.
export const CRISIS_GATE_TURN_READS = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4004',
  context:
    'dev on/off nights: no-gate turns with a crisis read in the turn go to 0, and the added wait p50/p95',
} as const satisfies FlagSpec;
