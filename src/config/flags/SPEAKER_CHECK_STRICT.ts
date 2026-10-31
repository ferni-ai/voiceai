import type { FlagSpec } from '../flag-spec.js';

// On: the speaker-change detector behind the web's "Someone new?" prompt ignores the caller's
// track while Ferni is audible (and 600 ms after), needs 3 like windows unlike the caller to
// confirm a change, and "Yes, it's me" re-anchors it (services/voice/speaker-change-evidence.ts).
// Off (the kill switch): 2 windows confirm a change, and the last one becomes the reference.
export const SPEAKER_CHECK_STRICT = {
  default: 'on',
  owner: 'voice',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
