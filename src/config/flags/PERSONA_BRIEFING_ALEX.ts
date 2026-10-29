import type { FlagSpec } from '../flag-spec.js';

// on: Alex gets his communication briefing (alex-communication-insights) at call start and on handoffs
// (#2836). It never ran on a call before #2836. Off until it is fixed (#3044): a caller with no data
// gets a metrics dashboard of defaults, and it records communication debts from a read path.
export const PERSONA_BRIEFING_ALEX = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
