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
  ];
}
