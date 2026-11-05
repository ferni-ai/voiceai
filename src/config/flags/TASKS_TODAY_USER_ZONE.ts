import type { FlagSpec } from '../flag-spec.js';

// On: "today" for the task tools (getTasks, getTaskSummary's completed today, the daily
// briefing) is the user's calendar day in the call's zone, rescheduleTask reads "tomorrow" in
// that zone, and open tasks with no due date list after today's dated ones
// (tools/domains/productivity/tasks.ts). Unknown zone: UTC, as before. Off (the kill switch):
// the server's midnight, the server's "tomorrow", undated tasks left out, as before.
export const TASKS_TODAY_USER_ZONE = {
  default: 'on',
  owner: 'tools',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
