import type { FlagSpec } from '../flag-spec.js';

// off | on (#3000): main's medical alarm for "i can't see" stands unless the whole utterance is one everyday "can't see" clause (a screen, a text, the menu, glasses, the lights off, a video call) with optional filler and a short enumerated tail; any other word keeps it (fail closed). Sight loss said outright always counts. Never lowers an alarm main gives otherwise (services/human-transfer/sight-emergency.ts).
export const CRISIS_SIGHT_NEEDS_CUE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
