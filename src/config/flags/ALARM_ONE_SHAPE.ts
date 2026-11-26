import type { FlagSpec } from '../flag-spec.js';

// on: an alarm set through chat is saved by the voice tool's path (alarm-tools.ts createAlarm), in the voice shape, so it can be listed, deleted and snoozed; and the alarm store reads every stored alarm, so chat's old documents (active, no enabled) read as set (#4316). Off: as on main.
export const ALARM_ONE_SHAPE = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4316',
  context:
    'Turn on in dev with ALARM_WRITES_TRUTHFUL; promote the two together once a chat-set alarm lists, deletes and snoozes by voice and chat; else delete.',
} as const satisfies FlagSpec;
