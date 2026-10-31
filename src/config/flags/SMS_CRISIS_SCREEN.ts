import type { FlagSpec } from '../flag-spec.js';

// on: every signed inbound text is read for crisis (the pattern guard plus the crisis classifier; either one is enough) and a crisis read is answered with 988/741741/911 instead of the usual reply; nobody else is alerted (Seth, 2026-10-25). shadow: reads and logs the outcome (no words), replies unchanged. off: no read (sms-crisis-screen.ts).
export const SMS_CRISIS_SCREEN = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
