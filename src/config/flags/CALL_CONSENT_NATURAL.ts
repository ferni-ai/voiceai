import type { FlagSpec } from '../flag-spec.js';

// on: a call or text read-back is answered only by owner words begun after Ferni's latest asking turn started playing (earlier words, a filler's included, are neither yes nor no); a reply the allow-list can't read places it on the consent judge's yes only if every word is in a small yes set (yes, sure, perfect, do it, go ahead, the person's name...), not over Ferni and not a question; "yes, tell him I'm running late" asks once with the message read back, and only a yes to that adds it to the call's purpose; a bare "Wait." or "Hold on." cancels; any tool run between the read-back and the yes voids it except an allow-listed read-only one (callStatus, getContactInfo); a crisis line said around a read-back ends it, and that tool is neither read back nor sent again on the call, nor sent if one lands while the yes is being recorded; a joke is off topic to the judge (consent-window.ts, consent-loop.ts, outreach-confirm.ts). Off: as before. The CONSENT_NATURAL_DECISION count line (enums only) logs in both states.
export const CALL_CONSENT_NATURAL = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4093',
  context:
    'Keep until the dev consent eval shows natural yeses placing and no pre-read-back word cancelling; then default on and delete.',
} as const satisfies FlagSpec;
