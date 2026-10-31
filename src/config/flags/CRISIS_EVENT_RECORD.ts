import type { FlagSpec } from '../flag-spec.js';

// off | shadow | on: when the crisis script replaces a call's reply, one crisis_events record per call with no words (ids, enums, which reader decided; agents/safety/crisis-event-record.ts). No Slack or other alert. shadow logs what it would record; off: nothing runs.
export const CRISIS_EVENT_RECORD = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
