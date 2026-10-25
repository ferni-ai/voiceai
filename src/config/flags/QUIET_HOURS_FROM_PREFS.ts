import type { FlagSpec } from '../flag-spec.js';

// On: every sender reads the quiet hours the menu saves (bogle_users/{uid}.messagingPrefs, POST /api/user/preferences)
// in the person's zone, through savedQuietHours (services/outreach/quiet-hours.ts). Their window adds quiet
// time to each sender's own; it never opens a window a sender keeps closed. Off: senders read outreachPreferences only.
export const QUIET_HOURS_FROM_PREFS = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
