import type { FlagSpec } from '../flag-spec.js';

// on: when the owner explicitly asks to call a family member now (callOnBehalf callNow true), the call-hours hold is skipped and the call rings now; between 10 PM and 7 AM callee time the call stays held until the owner confirms once more (lateConfirmed). Read in services/outreach/call-now-override.ts. Off: on-behalf calls wait for the call-hours window, as before.
export const CALL_NOW_OWNER_OVERRIDE = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
