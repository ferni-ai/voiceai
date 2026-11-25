import type { FlagSpec } from '../flag-spec.js';

// on: the end-of-call save keeps the name this call saved (services/session/call-name-on-end.ts). endSession builds its last save from the profile loaded at call start; after any mid-call save that object is stale, so a name confirmed later was written back to the old one. Off: the end-of-call save writes the call-start name, as before.
export const NAME_SURVIVES_END_SAVE = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-25',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4417',
  context: 'Keep on once a confirmed name stays stored after the call; then delete the flag.',
} as const satisfies FlagSpec;
