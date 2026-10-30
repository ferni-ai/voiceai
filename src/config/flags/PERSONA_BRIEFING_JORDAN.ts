import type { FlagSpec } from '../flag-spec.js';

// on: Jordan gets her milestone briefing (jordan-milestone-insights) at call start and on handoffs
// (#2836). It never ran on a call before #2836. Defaults no longer show as facts (#3044); it reads
// savings goals only, so other dated plans (birthdays, trips) wait on lane S7.
export const PERSONA_BRIEFING_JORDAN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
