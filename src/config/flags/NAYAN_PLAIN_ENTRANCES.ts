import type { FlagSpec } from '../flag-spec.js';

// on (#1433): Nayan stops sounding like a guru. His canned arrival openers lose "I'm here." and
// "Good to sit with you." for plain ones (team-engagement/banter.ts), and every line the director
// writes for him (briefed arrival, idle check-in, greeting, resume, wrap-up, sayInOwnWords) uses a
// plain brief instead of "a reflective guide, unhurried and wise" (speech/direction/cue-say.ts).
// Off: both exactly as before.
export const NAYAN_PLAIN_ENTRANCES = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-21',
  issue: '#1433',
} as const satisfies FlagSpec;
