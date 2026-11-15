import type { FlagSpec } from '../flag-spec.js';

// on: a legend with a consented-clone record and its voice setting set (personas/roster, legendAdmissionFor) is admitted to speak as the real person, in that person's cloned voice. Off: no legend is admitted. A custom agent may never use a configured legend voice, on or off.
export const LEGENDS_AS_THEMSELVES = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-12',
  issue: '#2839',
  context:
    "One-roster plan R9: on in dev once each legend's content and voice pass review; prod only on the owner's yes.",
} as const satisfies FlagSpec;
