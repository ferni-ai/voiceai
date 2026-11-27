import type { FlagSpec } from '../flag-spec.js';

// off | on: no turn-opening sound ("Mm" / "Hmm", TURN_OPENING_SOUND) is played while a crisis verdict is pending or once the crisis gate has acted on the call, and one already queued is cut when the gate's decision lands (the reply it held is released). The reply, and every other sound, are untouched. Read in agents/integrations/turn-opening-sound.ts, attached by multi-agent/live-call-behaviors.ts.
export const CRISIS_NO_OPENING_SOUND = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4451',
  context: 'dev on: ordinary turns get the opening sound as before; a crisis turn gets none',
} as const satisfies FlagSpec;
