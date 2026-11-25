import type { FlagSpec } from '../flag-spec.js';

// off | on (#3222): a call record starts with userTurnCount 0, so a call where only Ferni spoke (greeting, "are you there?") is not a session together in history, counts, streaks or milestones. Off: the field is missing until the caller speaks and any two turns count. Records already stored are read as before (services/memory/conversation-start.ts).
export const ASSISTANT_ONLY_CALLS_UNCOUNTED = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#3222',
} as const satisfies FlagSpec;
