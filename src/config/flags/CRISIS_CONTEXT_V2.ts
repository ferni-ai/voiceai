import type { FlagSpec } from '../flag-spec.js';

// on: a crisis classifier read of a turn whose own words carry no strong risk phrase does not count Ferni's own crisis lines or safety check-ins as the caller's words, lets earlier lines raise risk only when the caller stated it and this turn continues it, reads a goodbye as imminent only with explicit death, plan or means words on the call, and (with SEXUAL_TOPIC_BOUNDARY on) does not count sexual or adult content alone as risk; a turn with a strong risk phrase is read exactly as with it off (services/safety/crisis-context-v2.ts)
export const CRISIS_CONTEXT_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
