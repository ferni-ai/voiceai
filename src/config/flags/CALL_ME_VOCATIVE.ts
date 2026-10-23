import type { FlagSpec } from '../flag-spec.js';

// "call me Ferni" (or an STT spelling, "call me Fern") is a phone-call request, not a nickname, and "did you call me?" with no call placed is an offer to ring (agents/personas/call-me-note.ts, utils/call-me-vocative.ts). Off: unchanged.
export const CALL_ME_VOCATIVE = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
