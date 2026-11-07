import type { FlagSpec } from '../flag-spec.js';

// on: an owner's no that answers nothing ("No problem.", "No worries.": the closed NON_ANSWERS in tools/domains/communication/outreach/consent-words.ts) ends a waiting call or text only when it answers Ferni's read-back. Said after the talk moved on (the owner asked about something else and Ferni answered, or Ferni asked something else), it leaves it unclear: nothing is cancelled or sent, and Ferni asks once. It waits only as the owner's last turn: any owner words after it make it a no as before. Every other no ("No.", "No thanks.", "No, please stop."), a refusal ("Forget it.", "I changed my mind.") and any owner turn the crisis reader flags, alone or with the owner's other turns joined (STT splits lines), end it wherever they are said. A yes is unchanged. Off: any no since the read-back declines, as before.
export const OUTREACH_NO_ANSWERS_READBACK = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3531',
  context:
    'Keep until the dev consent eval shows no answered no left unclear; then default on and delete.',
} as const satisfies FlagSpec;
