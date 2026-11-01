import type { FlagSpec } from '../flag-spec.js';

// on: Maya gets her coaching briefing (maya-coaching-insights) at call start and on handoffs (#2836).
// It never ran on a call before #2836. It no longer shows defaults as facts (#3044), but it reads
// enhancedHabits, which nothing on the live path writes: real habit data waits on lane S6 (one store).
export const PERSONA_BRIEFING_MAYA = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
