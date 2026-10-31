import type { FlagSpec } from '../flag-spec.js';

// on: Peter's arrival turn after a handoff gets his handoff briefing (peter-research-insights, #3066).
// It never ran in prod before #3066: the executor only kept a handoff context when topics were passed,
// and the live caller passes none. Off until his dashboard stops showing defaults as "(Real Data)" (#3044).
export const PERSONA_BRIEFING_PETER_HANDOFF = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
