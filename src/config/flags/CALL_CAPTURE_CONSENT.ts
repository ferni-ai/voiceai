import type { FlagSpec } from '../flag-spec.js';

// on: the "Help shape Ferni" consent (services/call-capture-consent.ts): its account API and the
// setCallCaptureConsent voice tool. off: the routes answer 404, no tool, consent never holds.
export const CALL_CAPTURE_CONSENT = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
} as const satisfies FlagSpec;
