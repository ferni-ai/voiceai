import type { FlagSpec } from '../flag-spec.js';

// on: the caller-text screen (caller-text.ts isRiskyCallerText) also reads a match-only fold of a call's text: spelled digits and look-alike letters inside a digit run, Cyrillic or Greek letters mixed into a Latin word, a link said as "dot com", and a request to send or read out a code. More of the other side's words may be withheld behind riskyCallerLine; the quoted words, and the crisis read and crisisCallerLine, are unchanged. Off: the screen reads only the text as written.
export const SCREEN_SPELLED_PII = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#3346',
  context: 'Keep once dev shows no ordinary call reports withheld by the fold; else delete.',
} as const satisfies FlagSpec;
