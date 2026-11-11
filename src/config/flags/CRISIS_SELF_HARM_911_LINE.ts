import type { FlagSpec } from '../flag-spec.js';

// off | on (owner decision 2026-11-11): the caller's severe crisis script that is not imminent (suicide or self-harm, English, "tonight" or not) keeps 988 first and whole, then adds one line right after it: "If you've already hurt yourself or you're about to, call 911." The imminent (911 first), someone-else, Spanish (which already has its 911 sentence) and check-in scripts are unchanged (crisis-guard-replies.ts). Read from process.env, as crisis-guard's other reads are.
export const CRISIS_SELF_HARM_911_LINE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-11',
  issue: 'TBD',
  context: 'Make permanent once the crisis lead turns it on and the gate stays green; else delete.',
} as const satisfies FlagSpec;
