import type { FlagSpec } from '../flag-spec.js';

// on: marketData and contact look-ups the caller asked for get a look-up lead-in (never on a grave call), and calls and contact changes they asked for get On it. before the tool (personas/tool-lead-in.ts)
export const TOOL_ACK_WIDE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
