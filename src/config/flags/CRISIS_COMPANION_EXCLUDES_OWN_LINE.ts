import type { FlagSpec } from '../flag-spec.js';

// off | on (#4208): on a call with crisis risk noted, the classifier's read is not shown Ferni's own crisis-line sentences (a referral to 988, 911 or a crisis line, said as a statement) as COMPANION; Ferni's questions and all of the caller's words stay. One alarm read with Ferni's 988 line as context made every later turn read imminent until hang-up. Lowers reads only on those turns; logs a count of sentences left out (services/safety/crisis-companion-own-line.ts).
export const CRISIS_COMPANION_EXCLUDES_OWN_LINE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4208',
  context:
    'dev on: CRISIS_COMPANION_OWN_LINE counts; imminent reads after a crisis turn fall; the owner sets prod timing',
} as const satisfies FlagSpec;
