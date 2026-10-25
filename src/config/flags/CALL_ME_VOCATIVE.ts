import type { FlagSpec } from '../flag-spec.js';

// "call me, Ferni" / "ring me" rings (callUser); "call me Fern" (a word like a team name) is asked about, ring or name; a new name ("call me Sam", "my name is Sam") is confirmed before it is used or saved (utils/call-me-vocative.ts, tools/domains/conversation/name-confirm.ts, call-me-note.ts). Off: unchanged.
export const CALL_ME_VOCATIVE = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
