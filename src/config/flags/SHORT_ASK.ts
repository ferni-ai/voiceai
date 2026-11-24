import type { FlagSpec } from '../flag-spec.js';

// on: a caller's direct ask for less ("short version", "in one sentence", "tl;dr") ends the turn reminder with a one-sentence, no-offer, no-question line (agents/personas/short-ask.ts, wired in turn-shape.ts). Fails closed on a negated ask or a caller telling their own story. Off: the reminder is unchanged.
export const SHORT_ASK = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-03-24',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4383',
  context:
    'Keep if a dev A/B on short-version shortens the reply after the ask with no judge loss; else delete.',
} as const satisfies FlagSpec;
