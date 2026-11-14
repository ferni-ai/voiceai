import type { FlagSpec } from '../flag-spec.js';

// on: a turn whose only distress is a request for help with a task ("help me plan dinner") no longer reads as concern level crisis or a heavy topic in the humanization layer, unless something backs the distress up (agents/processors/task-help-distress.ts); one turn sends one concern_detected. Off: as before.
export const HUMANIZE_DISTRESS_CORROBORATION = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-12',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3784',
  context:
    'Keep if dev task-help turns stop starting the crisis face while every bare cry for help still does; else delete.',
} as const satisfies FlagSpec;
