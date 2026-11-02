import type { FlagSpec } from '../flag-spec.js';

// on (with MINOR_CARE on): a caller who sounds under 18 keeps youth-safe words on a crisis turn. A guided reply gets MINOR_CRISIS_NOTE beside the crisis guidance (utils/minor-care.ts); a crisis script gets one short spoken youth line after its own safety question (utils/minor-crisis-care.ts). Never on a soft check-in. Every crisis resource, step and script line stays as it is. Off, or an adult: output is main's.
export const MINOR_CRISIS_CARE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
