import type { FlagSpec } from '../flag-spec.js';

// on: a reply to a call or text read-back that the fast path cannot decide goes to one flash-lite judgement (consent-judge.ts); off: it is unclear and Ferni asks once
export const CALL_CONSENT_CLASSIFIER = {
  default: 'on',
  owner: 'outreach',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
