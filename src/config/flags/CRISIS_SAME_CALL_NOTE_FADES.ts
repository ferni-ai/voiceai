import type { FlagSpec } from '../flag-spec.js';

// off | on (#3000, Seth: fade after a few turns): the crisis follow-up note for a crisis logged earlier on THIS call shows for the next 3 caller turns, then stops; a new crisis signal on the call restarts the 3 turns. Cross-call notes and all in-call crisis handling are unchanged. The signal doc carries its turn (userData.turnCount) when on (services/human-transfer/crisis-signals.ts followUpCrisis).
export const CRISIS_SAME_CALL_NOTE_FADES = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
