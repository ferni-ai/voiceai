import type { FlagSpec } from '../flag-spec.js';

// On: the service-availability note (what the model may offer) reads whether the caller has linked Google Calendar, Gmail and Spotify from the stores the connect callbacks write (services/integrations/connection-status.ts: bogle_users/{uid}/google_calendar_tokens and spotify_links), so a linked caller is no longer told "NOT CONNECTED"; a store that can't be read says nothing definitive. Off: the note reads IntegrationHub's oauth_tokens collection, which no connect flow writes, so it tells every caller Calendar, Gmail and Spotify are not connected. Remove the hub read once this is on.
export const LINK_STATUS_V2 = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
