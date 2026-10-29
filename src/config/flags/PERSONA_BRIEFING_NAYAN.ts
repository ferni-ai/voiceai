import type { FlagSpec } from '../flag-spec.js';

// on: Nayan gets his wisdom briefing (nayan-wisdom-insights) at call start and on handoffs (#2836).
// It never ran on a call before #2836. It no longer scores the caller or reads an unconnected
// calendar (#3044); its "life chapter" is still inferred from savings-goal names.
export const PERSONA_BRIEFING_NAYAN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
