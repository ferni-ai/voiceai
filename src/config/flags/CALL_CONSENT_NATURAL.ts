import type { FlagSpec } from '../flag-spec.js';

// on: a call or text read-back is answered only by owner words begun after it started playing (earlier words are neither yes nor no); a reply the allow-list can't read places it on the consent judge's yes, unless it holds a no word (no, stop, wait, don't, cancel, hold on, never mind) or a question; "yes, tell him I'm running late" is a yes whose message is added to the call's purpose (a yes with a message for an action with no purpose asks once); a bare "Wait." or "Hold on." cancels; only another outbound tool run between the read-back and the yes voids it, not a read-only one like callStatus; and a crisis line said any time since the read-back was stored ends it for good (consent-window.ts). Off: as before.
export const CALL_CONSENT_NATURAL = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4093',
  context:
    'Keep until the dev consent eval shows natural yeses placing and no pre-read-back word cancelling; then default on and delete.',
} as const satisfies FlagSpec;
