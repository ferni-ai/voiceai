import type { FlagSpec } from '../flag-spec.js';

// off | shadow | on: a crisis the reply gate handles on a call (the 988/911 script, or full crisis guidance, never a soft check-in) starts the CRISIS_QUIET_DAYS proactive quiet window: one crisis_signals doc with no words through logCrisisSignal (agents/safety/crisis-quiet-window.ts). A MINOR_CARE-held caller gets a quietUntil time on minor_care_holds instead. shadow logs what it would write; off: nothing runs.
export const CRISIS_QUIET_FROM_GATE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
