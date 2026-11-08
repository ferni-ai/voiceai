import type { FlagSpec } from '../flag-spec.js';

// on (read by the UI server's outreach jobs only): text stored from calls is screened before it goes into an owner message (owner-message-policy.ts)
export const OWNER_OUTREACH_STORED_TEXT_SCREEN = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-01-31',
  issue: 'TBD',
  context:
    'Privacy screen on owner messages: decide permanent (kill-switch, on) or replace; never just delete.',
} as const satisfies FlagSpec;
