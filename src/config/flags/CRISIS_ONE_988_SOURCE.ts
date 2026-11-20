import type { FlagSpec } from '../flag-spec.js';

// off | on (#4238): the three prompt builders that named 988 on their own (the transfer awareness context, the safety injection's resource line, the first-aid voice instructions and its safety follow-up) name the line the shared policy picks for the caller's last line (guideLineOf, in the guided-line floor's words): 988 for the caller's own crisis; 911 then 988 for their own imminent read; the for-them 988 line for someone they're worried about; 911 for them and no 988 for an emergency for someone else. Spanish for someone else (no Spanish for-them wording on main): the same line, asked in the caller's language. Only on a turn the crisis patterns read as a crisis; any other turn, and a line that names no 988 (abuse, elder, substance), stays as it was. Off: all three say what they said before. Read from process.env (crisis-one-988-source.ts).
export const CRISIS_ONE_988_SOURCE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4238',
  context:
    'Promote only after the crisis recall counts from #4083 are in (lane A: after recall is measured), an independent verify, the crisis owner yes and clean dev nights; then make permanent, else delete.',
} as const satisfies FlagSpec;
