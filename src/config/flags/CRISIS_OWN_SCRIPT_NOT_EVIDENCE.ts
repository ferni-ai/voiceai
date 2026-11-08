import type { FlagSpec } from '../flag-spec.js';

// off | on: when the line the crisis classifier sees as COMPANION is Ferni's own crisis reply from the turn before (988/911 guidance or script, known from userData.lastAgentResponseCrisisHelp, never from the text), the classifier reads a fixed marker saying crisis resources were just offered, plus a rule to judge the caller's reply on their own words (services/safety/crisis-own-reply.ts). Ferni's own script made a plain "thanks" next turn read as risk again. A reply with risk words of its own, or one agreeing with Ferni, reads the full line, as off. Patterns are untouched.
export const CRISIS_OWN_SCRIPT_NOT_EVIDENCE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-08',
  issue: 'https://github.com/ferni-ai/voiceai/issues/2469',
  context:
    'Safety: expiry only warns, never turns it off. Keep if repeat alarms after a crisis reply fall with no lost catch; else delete.',
} as const satisfies FlagSpec;
