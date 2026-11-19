import type { FlagSpec } from '../flag-spec.js';

// off | on (#4221): the calls' check-in (CRISIS_TIMEOUT_CHECKIN) for a text. With SMS_CRISIS_SCREEN on, a text whose crisis read failed (no classifier verdict: a timeout, an error, an unusable reply, a read that throws), which the patterns read as nothing, is no bare keyword, and holds a check-in word that is not only plainly denied, gets the check-in reply: the crisis reply's opening, "Are you safe right now?", then 988, 741741 and 911. A "call me" text keeps its call and says so. A classifier "none" is a read and gets no check-in; a crisis read keeps its reply. Off: no check-in, as before. Read from process.env (sms-crisis-screen.ts).
export const SMS_CRISIS_TIMEOUT_CHECKIN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4221',
  context:
    'Promote after an independent verify, the crisis owner yes (and their read of the check-in text) and clean dev nights; then make permanent, else delete.',
} as const satisfies FlagSpec;
