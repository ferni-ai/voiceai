import type { FlagSpec } from '../flag-spec.js';

// on: Nayan gets his wisdom briefing (nayan-wisdom-insights) at call start and on handoffs (#2836).
// It never ran on a call before #2836. Off until it is fixed: it scores the caller (inner peace,
// mortality awareness) and reads the 0-100 inner-peace score as a 0-1 fraction.
export const PERSONA_BRIEFING_NAYAN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
