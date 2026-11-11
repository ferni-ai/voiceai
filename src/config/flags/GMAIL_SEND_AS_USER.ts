import type { FlagSpec } from '../flag-spec.js';

// on: a user can grant gmail.send and reachOut's email goes from their own Gmail
// (config/gmail-send-flag.ts, services/identity/gmail-send-as-user.ts). Read per person
// (COHORT_FLAGS) by the web server's connect routes and the agent's send, so one person
// can have it before Google verifies the app. Off: the connect is refused.
export const GMAIL_SEND_AS_USER = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
