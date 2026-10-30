import type { FlagSpec } from '../flag-spec.js';

// on: a promise Ferni made that is still open after a later call still sends its check-in (services/outreach/proactive-channels/triggers.ts), held only for 12 h after a call; off = talking since the promise stands it down. Read by the proactive tick on the UI server.
export const OPEN_PROMISE_TRIGGERS = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
