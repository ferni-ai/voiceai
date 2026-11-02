import type { FlagSpec } from '../flag-spec.js';

// On: a call knows the texts Ferni sent the member in the last 6 h, in the call-start awareness
// and the greeting's facts (multi-agent/recent-texts-awareness.ts). Only for the proven owner on
// the line, never on a call placed to someone else, and never a text about a topic the caller
// asked Ferni to forget (fail closed when those topics can't be read in time).
export const CALL_KNOWS_RECENT_TEXTS = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
