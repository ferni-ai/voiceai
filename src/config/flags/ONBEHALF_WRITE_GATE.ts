import type { FlagSpec } from '../flag-spec.js';

// On: nothing is written under onbehalf:<callId>, the throwaway id of a call Ferni places for a
// member. The session summary, arc, seeds, presence, per-turn learners and thread recorder skip
// it, and the call is offered no own-account tool (services/identity/owner-write-gate.ts).
// Off (the kill switch): they run as before.
export const ONBEHALF_WRITE_GATE = {
  default: 'on',
  owner: 'memory',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
