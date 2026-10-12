/**
 * ASSISTANT_ACTIONS_REAL=on makes everyday actions reach a phone-first user:
 * reminders by text to their own verified number, and (in later changes)
 * calls and alarms. Off by default. Read on every call, so a test (or a
 * restart with new env) sees the current value.
 *
 * Needed both where the tools run (the voice agent) and where the delivery
 * job runs (the server behind /api/jobs/deliver-reminders).
 *
 * @module config/assistant-actions-flag
 */

export function isAssistantActionsReal(): boolean {
  return process.env.ASSISTANT_ACTIONS_REAL === 'on';
}
