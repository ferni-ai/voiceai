import type { FlagSpec } from '../flag-spec.js';

// off | on (crisis lead, 2026-11-17): a reply the voice gate guided for a crisis read always names the line. When the model's reply leaves it out, code says it after the reply: 988 for the caller's own crisis, 911 and 988 on an imminent read, the for-them 988 line when the caller is worried about someone, 911 for them in an emergency. Only adds; soft check-ins and eased guides are untouched (services/safety/crisis-guided-line-floor.ts).
export const CRISIS_GUIDED_LINE_FLOOR = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-15',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4009',
  context: 'dev on, spoken-line log counts before and after; prod on the owner yes',
} as const satisfies FlagSpec;
