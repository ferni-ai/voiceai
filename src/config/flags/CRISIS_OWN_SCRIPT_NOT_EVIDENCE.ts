import type { FlagSpec } from '../flag-spec.js';

// off | on (crisis false alarms, 2026-11-03): when Ferni's line before the caller's turn is its own crisis script (988 or a crisis line, thoughts of suicide or of hurting yourself, keeping yourself safe), the classifier reads a short marker in its place, so the script is never evidence of the caller's risk. A direct safety question in it is kept word for word in place of the marker, so a yes or a hedge still reads as risk. The caller's lines are never changed; every other check still sees Ferni's real line (services/safety/crisis-own-script.ts).
export const CRISIS_OWN_SCRIPT_NOT_EVIDENCE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
