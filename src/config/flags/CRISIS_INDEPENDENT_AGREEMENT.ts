import type { FlagSpec } from '../flag-spec.js';

// off | on (#4208): reads of one crisis turn agree on risk only when independent, two different classifier prompts. The reply gate and the turn pipeline keep the same read (or the same prompt asked twice) as two reads of the turn, so one alarm read confirmed the call (CRISIS_CONFIRMED_CALL_RISK) and a lone read marked it as agreed risk (CRISIS_IMMINENT_NEEDS_AGREEMENT): no later turn could ease. Lowers reads only on later turns of a call whose alarm nothing else confirmed; the after-check read and the patterns confirm as before (services/safety/crisis-independent-agreement.ts).
export const CRISIS_INDEPENDENT_AGREEMENT = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4208',
  context:
    'dev on with CRISIS_CONFIRMED_CALL_RISK=on: CRISIS_CONFIRMED outcome counts show after-checks on alarmed calls; the owner sets prod timing',
} as const satisfies FlagSpec;
