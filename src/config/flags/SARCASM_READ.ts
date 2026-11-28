import type { FlagSpec } from '../flag-spec.js';

// on (with ATTUNE_LEDGER): stock sarcasm with no positive word in it ("living the dream", "story of my life", "best Monday ever. Truly.", "best day ever, my car broke down again") reads 'mixed' instead of excited or nothing, so the reply asks lightly how it really was instead of celebrating it. The same idioms said sincerely ("living the dream!", "truly the best day ever") keep their read. A caller the ledger reads low, or whose words say they're hurting, keeps that read. Read in turn-attunement.ts readCaller via attune-ledger.ts; off = unchanged (#4054).
export const SARCASM_READ = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4054',
  context:
    'Keep if the sarcasm red-team scenarios score better on understanding with no new false mixed reads on sincere good news; else delete.',
} as const satisfies FlagSpec;
