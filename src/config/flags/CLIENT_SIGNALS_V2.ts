import type { FlagSpec } from '../flag-spec.js';

// On: two client data messages for the iOS app (docs/api/client-signals.md): memory_saved
// {id, sensitive, ts} after a memory store resolves (memory-saved-signal.ts), and
// sound_played {kind, wireDelayMs} when any non-speech clip starts (sound-signal.ts).
// Off: neither is sent; backchannel_played is unchanged either way.
export const CLIENT_SIGNALS_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
