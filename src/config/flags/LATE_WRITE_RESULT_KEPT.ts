import type { FlagSpec } from '../flag-spec.js';

// on: a write tool (reminders, calendar, scheduled calls and messages, lists, alarms; tools/registry/write-results.ts) that finishes after the caller's barge-in aborted its reply has its result put into the agent's chat context, paired with its call, so the next turn knows the write happened and a re-ask doesn't run it twice. LiveKit stops waiting for a tool on an abort and records no output for it. Nothing is held and no reply waits. Crisis, support and human-transfer tools are never listed. Off: as on main.
export const LATE_WRITE_RESULT_KEPT = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4253',
  context:
    'Keep if no write tool is run twice after a barge-in and no turn after one says a finished write did not happen; else delete.',
} as const satisfies FlagSpec;
