import type { FlagSpec } from '../flag-spec.js';

// on: while the house Spotify token is revoked or none is configured, the Spotify-only tools (spotifyAdvanced, callMusic, spotifyStatus, and the Spotify Connect room tools) are unregistered, so no call is offered them; they come back when a new token is stored. One SPOTIFY_TOOLS_HIDDEN line per state change, reason only. The iTunes-preview music tools stay (tools/domains/entertainment/spotify-tool-gate.ts). Off: offered as before.
export const SPOTIFY_TOOLS_HIDE_WHEN_DOWN = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: 'TBD',
  context:
    'dev on, then confirm SPOTIFY_TOOLS_HIDDEN fires once per worker and spotify-only tool calls drop to zero; prod on the owner yes',
} as const satisfies FlagSpec;
