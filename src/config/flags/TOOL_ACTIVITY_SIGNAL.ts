import type { FlagSpec } from '../flag-spec.js';

// on: the apps get tool_start/tool_end data messages while a tool runs (tool-activity-signal.ts).
// Only a closed kind is sent, never the tool name or its arguments (docs/api/tool-activity.md).
export const TOOL_ACTIVITY_SIGNAL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
