import type { FlagSpec } from '../flag-spec.js';

// on: Alex gets his communication briefing (alex-communication-insights) at call start and on handoffs
// (#2836). It never ran on a call before #2836. Off until it is fixed: it compares getHandoffContext()'s
// null with undefined, so every briefing goes in at high priority as a handoff briefing.
export const PERSONA_BRIEFING_ALEX = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
