/**
 * Cloud Scheduler jobs for reminders, scheduled actions, outreach, and
 * calendar triggers. The voice process no longer runs these in-memory.
 */

export interface DeliverySchedulerJob {
  name: string;
  description: string;
  schedule: string;
  timezone: string;
  uri: string;
  httpMethod: 'POST';
  retryCount?: number;
  minBackoff?: string;
  maxBackoff?: string;
  timeout?: string;
  /** Sent without the Content-Type and X-CloudScheduler headers (OIDC alone authenticates). */
  noHeaders?: boolean;
}

export function getDeliveryJobs(uiServerUrl: string): DeliverySchedulerJob[] {
  return [
    {
      name: 'deliver-reminders',
      description: 'Deliver due reminders from Firestore',
      schedule: '* * * * *',
      timezone: 'America/Los_Angeles',
      uri: `${uiServerUrl}/api/jobs/deliver-reminders`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '15s',
      maxBackoff: '60s',
      timeout: '120s',
    },
    {
      name: 'deliver-scheduled-actions',
      description: 'Run due scheduled actions and workflow reminders',
      schedule: '* * * * *',
      timezone: 'America/Los_Angeles',
      uri: `${uiServerUrl}/api/jobs/deliver-scheduled-actions`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '15s',
      maxBackoff: '60s',
      timeout: '120s',
    },
    {
      name: 'execute-scheduled-outreach',
      description: 'Send scheduled outreach that is due',
      schedule: '* * * * *',
      timezone: 'America/Los_Angeles',
      uri: `${uiServerUrl}/api/jobs/execute-scheduled-outreach`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '15s',
      maxBackoff: '60s',
      timeout: '120s',
    },
    {
      name: 'calendar-morning-briefing',
      description: 'Alex morning briefing (one per user per local day)',
      // All day: 7am (push) and 8am (text) come at different UTC hours per zone.
      schedule: '*/15 * * * *',
      timezone: 'Etc/UTC',
      uri: `${uiServerUrl}/api/jobs/calendar-briefing`,
      httpMethod: 'POST',
      retryCount: 1,
      minBackoff: '30s',
      timeout: '180s',
    },
    {
      name: 'calendar-triggers',
      description: 'Fire calendar-based coaching triggers',
      schedule: '*/5 * * * *',
      timezone: 'America/Los_Angeles',
      uri: `${uiServerUrl}/api/jobs/calendar-triggers`,
      httpMethod: 'POST',
      retryCount: 1,
      minBackoff: '30s',
      maxBackoff: '120s',
      timeout: '180s',
    },
    {
      // Off until the UI server has FOLLOW_THROUGH_JOB=on; until then each run answers flag-off.
      // As created in prod on 2026-10-18 (gcloud scheduler jobs describe follow-through).
      name: 'follow-through',
      description:
        'Follow-up texts (follow-up-texts.ts via /api/jobs/follow-through); sends only to people with FOLLOW_THROUGH_TEXTS on',
      schedule: '*/5 * * * *',
      timezone: 'America/Los_Angeles',
      uri: `${uiServerUrl}/api/jobs/follow-through`,
      httpMethod: 'POST',
      retryCount: 0,
      timeout: '120s',
      noHeaders: true,
    },
    {
      // Hourly: each poll ponders callers whose night slot has come (ponder-job.ts), at most
      // POLL_BUDGET_MS plus one caller. Off until PONDERING is on here or in a cohort.
      name: 'pondering',
      description: 'Ponder the callers whose night slot has come (PONDERING, ponder-job.ts)',
      schedule: '40 * * * *',
      timezone: 'Etc/UTC',
      uri: `${uiServerUrl}/api/jobs/pondering`,
      httpMethod: 'POST',
      retryCount: 0,
      timeout: '300s',
    },
    {
      // Revokes Google couldn't take during an account erasure; gives up after 14 days.
      name: 'retry-pending-revocations',
      description: 'Retry Google OAuth revokes queued by account erasure',
      schedule: '*/15 * * * *',
      timezone: 'Etc/UTC',
      uri: `${uiServerUrl}/api/jobs/retry-pending-revocations`,
      httpMethod: 'POST',
      retryCount: 0,
      timeout: '120s',
    },
    {
      name: 'held-scrub-sweep',
      description: 'Retry MINOR_CARE held-window scrubs that failed (off unless HELD_SCRUB_SWEEP)',
      schedule: '17 * * * *',
      timezone: 'Etc/UTC',
      uri: `${uiServerUrl}/api/jobs/held-scrub-sweep`,
      httpMethod: 'POST',
      retryCount: 0,
      timeout: '280s',
    },
  ];
}
