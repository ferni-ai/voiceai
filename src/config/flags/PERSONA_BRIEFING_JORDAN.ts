import type { FlagSpec } from '../flag-spec.js';

// on: Jordan gets her milestone briefing (jordan-milestone-insights) at call start and on handoffs
// (#2836). It never ran on a call before #2836. Off until it is fixed: it calls July to October wedding
// season, puts Mother's Day on May 11 every year, and gives every caller a "Total saved: $0" line.
export const PERSONA_BRIEFING_JORDAN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
