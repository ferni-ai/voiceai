import type { FlagSpec } from '../flag-spec.js';

// on: Outlook connects with PKCE and the scopes offline_access User.Read Calendars.ReadWrite, the grant is sealed on the shared store (bogle_users/{uid}/outlook_tokens, never stored without a token key), a refused refresh is needs_reauth, and the calendar tools read and create on Graph live, saying not connected / needs reconnecting / couldn't reach it instead of "no events" (services/calendar/providers/outlook-link.ts); off = the old provider path
export const OUTLOOK_CONNECT = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
