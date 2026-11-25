import type { FlagSpec } from '../flag-spec.js';

// on: a confirmed on-behalf call waits up to 30 s (not 5 s) for Ferni's agent to join its room,
// long enough for a cold worker (services/outreach/agent-join.ts); still nothing is dialled if no
// agent joins. The member hears "Still connecting, one moment." once at about 3 s while it waits,
// never on a crisis-held turn (agents/multi-agent/still-connecting.ts), and a call that still
// can't connect is answered with the not-placed line as the reply itself (call-not-placed.ts).
// Off: as on main.
export const ON_BEHALF_JOIN_WAIT = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4391',
  context:
    'Keep if confirmed calls no longer fail on a cold worker and the wait line is never heard on a crisis turn; else delete.',
} as const satisfies FlagSpec;
