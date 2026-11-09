import type { FlagSpec } from '../flag-spec.js';

// on: an owner's no that answers nothing ("No problem.", "No worries.": the closed NON_ANSWERS in tools/domains/communication/outreach/consent-words.ts) ends a waiting call or text only when it answers Ferni's read-back. Said after Ferni asked something else, it leaves it unclear (nothing is cancelled or sent, and Ferni asks once) only when it is the owner's only turn since then and every other owner turn since the read-back says nothing ("Hmm.", "Yeah.": the closed CONTENT_FREE in the same file). Any other owner words since the read-back, a question of their own included, make it a no as before. Every other no ("No.", "No thanks.", "No, please stop.") and any owner turn the crisis reader flags, alone or with the owner's other turns joined (STT splits lines), end it wherever they are said. A refusal that does not open with a no ("Forget it.", "I changed my mind.") is read as off: Ferni asks once, and a second refusal cancels. A yes is unchanged. Off: any no since the read-back declines, as before.
export const OUTREACH_NO_ANSWERS_READBACK = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3531',
  context:
    'Keep until the dev consent eval shows no answered no left unclear; then default on and delete.',
} as const satisfies FlagSpec;
