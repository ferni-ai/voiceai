import type { FlagSpec } from '../flag-spec.js';

// on: Ferni's voiced presence path (voiced-presence.ts, VOICED_PRESENCE) gets a long-quiet slot that can play a recorded snore once a call (18-26 s of mutual quiet, 60%, never on a heavy moment, a handoff or a tool call; asks SOUND_CONDUCTOR), records every whistle, hum, yawn and snore it plays with recordQuirk (QUIRK_AWARENESS) so the next reply can own it, and after a snore the caller's next turn gets one line to own it (quirk-note.ts). Off: no snore and no quirk records from the voiced path.
export const VOICED_QUIRKS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
