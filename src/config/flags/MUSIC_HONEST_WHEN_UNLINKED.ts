import type { FlagSpec } from '../flag-spec.js';

// on: when Spotify cannot be used (token revoked, not configured), playMusic and musicProvider say so plainly: a structured spotify unavailable result plus a short true line, and no suggestion to link Spotify unless the connect route is configured (tools/domains/entertainment/music-honesty.ts). Off: the old wording, as before.
export const MUSIC_HONEST_WHEN_UNLINKED = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
