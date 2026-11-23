import type { FlagSpec } from '../flag-spec.js';

// off | on (#4212, owner rule 2026-11-02): when the crisis classifier reads someone other than the caller in immediate danger and no pattern read an emergency for them, the reply leads with the 911 for them the pattern path uses (CALL_911_FOR_THEM, through forThemFirst), then says everything it said before, whole: the for-them 988 reply, or the caller's own script when the patterns read the caller at risk too. Off, that verdict reads as a worry for someone else: the for-them 988 reply, 911 last. A non-imminent verdict about someone else and every verdict about the caller are unchanged. Read from the gate's or pipeline's env, else process.env (crisis-classifier-verdict.ts).
export const CRISIS_CLASSIFIER_OTHER_IMMINENT_911 = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4212',
  context:
    'Promote after an independent verify, the crisis owner yes and clean dev nights; then make permanent, else delete.',
} as const satisfies FlagSpec;
