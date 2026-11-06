import type { FlagSpec } from '../flag-spec.js';

// on: an owner's soft no ("no", "nope", "nah") ends a waiting call or text only when it answers Ferni's read-back, or names the action ("No, don't call him."). A refusal ("Stop.", "Cancel.", "Never mind.", "Forget it.", "No, I changed my mind.") or a turn the crisis reader flags ends it wherever it is said. Once the talk has moved on (the owner asked about something else and Ferni answered, or Ferni asked something else), a no such as "No, I'm just checking." leaves it unclear: nothing is cancelled or sent, and Ferni asks once (tools/domains/communication/outreach/consent-window.ts). A yes is unchanged. Off: any no since the read-back declines, as before.
export const OUTREACH_NO_ANSWERS_READBACK = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3531',
  context:
    'Keep until the dev consent eval shows no answered no left unclear; then default on and delete.',
} as const satisfies FlagSpec;
