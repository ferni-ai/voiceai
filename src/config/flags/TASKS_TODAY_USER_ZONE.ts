import type { FlagSpec } from '../flag-spec.js';

// On: "today" for the task tools (getTasks, getTaskSummary's counts, the daily briefing) is the
// user's calendar day in the call's zone, rescheduleTask reads "tomorrow" in that zone, and open
// tasks with no due date get their own "N with no date" line, never counted as today
// (tools/domains/productivity/tasks.ts). Unknown zone: UTC, as before. Off (the kill switch):
// the server's midnight, the server's "tomorrow", undated tasks not shown, as before.
export const TASKS_TODAY_USER_ZONE = {
  default: 'on',
  owner: 'tools',
  kind: 'kill-switch',
  issue: '#3497',
  context:
    "Kill-switch, not experiment: a correctness fix (the task day was UTC's, not the user's) that is on with no env flip; remove it per #3497 once it has run clean in prod.",
} as const satisfies FlagSpec;
