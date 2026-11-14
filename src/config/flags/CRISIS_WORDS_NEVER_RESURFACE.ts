import type { FlagSpec } from '../flag-spec.js';

// on: crisis_support and vulnerability moments keep no caller words (type, date and score only) and are never offered as callbacks, at any stage or probability, including moments saved before (intelligence/relationship/wordless-moments.ts). Their vulnerability deposits keep no summary, content or keywords, their pattern evidence keeps no line, and the personality prompt never quotes a deposit with no words. Off: as on main.
export const CRISIS_WORDS_NEVER_RESURFACE = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-10',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3798',
  context:
    'Crisis lane: turn on in dev after the crisis verify and a yes per PR, then prod; becomes permanent once callbacks show no crisis words.',
} as const satisfies FlagSpec;
