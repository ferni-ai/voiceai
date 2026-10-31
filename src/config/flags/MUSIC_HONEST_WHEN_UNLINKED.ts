import type { FlagSpec } from '../flag-spec.js';

// on: when Spotify cannot be used (token revoked, not configured), playMusic and musicProvider say so plainly: a structured spotify unavailable result plus a short true line (tools/domains/entertainment/music-honesty.ts). Off: a preview plays, as before. Neither state offers to link Spotify.
export const MUSIC_HONEST_WHEN_UNLINKED = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
