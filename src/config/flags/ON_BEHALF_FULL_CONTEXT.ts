import type { FlagSpec } from '../flag-spec.js';

// On: a call placed for the user (callOnBehalf) tells Ferni who the person called is to the user ("Sam's mother", normalised through memory/domain/person-key.ts) and, as background, what the user said about the call, both read once per call from the signed dispatch only (agents/voice-agent-entry/on-behalf-full-context.ts); the placer's script is unchanged and the agent moves its Additional Context section into that background line. A contact saved as "my mom" or "Sam's mom" is never handed to Ferni as a name to say. Off: the prompt is main's.
export const ON_BEHALF_FULL_CONTEXT = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-26',
  issue: '#4477',
  context:
    'Keep if calls placed for the user stop misaddressing family ("mom") and Ferni knows why the user wanted the call; measure only after the callOnBehalf schema text (#4391) and the spoken greeting fix (#4471) land, which this flag does not cover.',
} as const satisfies FlagSpec;
