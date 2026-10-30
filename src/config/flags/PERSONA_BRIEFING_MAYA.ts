import type { FlagSpec } from '../flag-spec.js';

// on: Maya gets her coaching briefing (maya-coaching-insights) at call start and on handoffs (#2836).
// It never ran on a call before #2836. Off until it is fixed: a caller with no habits gets a 0/100
// metrics dashboard and "Overall consistency needs support" as a struggle to address.
export const PERSONA_BRIEFING_MAYA = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
