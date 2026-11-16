import type { FlagSpec } from '../flag-spec.js';

// on: a team note shown as a toast stays in the team panel until the user dismisses it (toastedAt, not hiddenFromUserAt); off: showing a toast hides it from the panel, as before (services/cross-persona/insight-visibility.ts).
export const TEAM_NOTES_STAY_AFTER_TOAST = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-14',
  issue: '#3945',
} as const satisfies FlagSpec;
