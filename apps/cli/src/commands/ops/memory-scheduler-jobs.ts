/**
 * Memory scheduler - configuration and Cloud Scheduler job definitions.
 * Extracted from memory-scheduler.ts.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: 'us-central1',
  uiServerUrl: 'https://app.ferni.ai',
  serviceAccount: 'scheduler-invoker@johnb-2025.iam.gserviceaccount.com',
};

// ============================================================================
// JOB DEFINITIONS (Memory System Jobs)
// ============================================================================

export interface SchedulerJob {
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

export function getMemoryJobs(): SchedulerJob[] {
  return [
    // Memory Maintenance Jobs
    {
      name: 'memory-consolidation',
      description: 'Weekly memory consolidation - merge related memories',
      schedule: '0 3 * * 0', // Sunday 3am PT
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/memory-consolidation`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '60s',
      maxBackoff: '300s',
      timeout: '600s',
    },
    {
      name: 'memory-decay',
      description: 'Daily graceful forgetting - decay old memories',
      schedule: '0 4 * * *', // Daily 4am PT
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/memory-decay`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '60s',
      maxBackoff: '300s',
      timeout: '600s',
    },
    {
      name: 'memory-deduplication',
      description: 'Weekly duplicate cleanup - LSH-based deduplication',
      schedule: '0 2 * * 6', // Saturday 2am PT
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/memory-deduplication`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '60s',
      maxBackoff: '300s',
      timeout: '600s',
    },
    {
      name: 'memory-health-check',
      description: 'Memory system health monitoring - every 4 hours',
      schedule: '0 */4 * * *', // Every 4 hours
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/memory-health-check`,
      httpMethod: 'POST',
      retryCount: 1,
      minBackoff: '30s',
      maxBackoff: '120s',
      timeout: '120s',
    },
    {
      name: 'conversation-catchup',
      description: 'Summarize conversations that ended without a summary - every 30 minutes',
      schedule: '7,37 * * * *', // Every 30 minutes
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/conversation-catchup`,
      httpMethod: 'POST',
      retryCount: 1,
      minBackoff: '60s',
      maxBackoff: '120s',
      timeout: '600s',
    },
    {
      name: 'personal-insights-refresh',
      description: 'Daily people/threads/predictions refresh for active users',
      schedule: '20 5 * * *', // Daily 5:20am PT
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/personal-insights-refresh`,
      httpMethod: 'POST',
      retryCount: 1,
      minBackoff: '60s',
      maxBackoff: '300s',
      timeout: '600s',
    },
    {
      name: 'deliver-date-reminders',
      description: 'Important-date reminders (birthdays, anniversaries, deadlines)',
      schedule: '*/15 * * * *', // Every 15 minutes
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/deliver-date-reminders`,
      httpMethod: 'POST',
      retryCount: 1,
      minBackoff: '30s',
      maxBackoff: '60s',
      timeout: '300s',
    },
    // Knowledge Graph Jobs
    {
      name: 'knowledge-graph-insights',
      description: 'Daily insight generation from knowledge graph',
      schedule: '0 2 * * *', // Daily 2am PT
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/knowledge-graph-insights`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '60s',
      maxBackoff: '300s',
      timeout: '600s',
    },
    {
      name: 'knowledge-graph-consolidation',
      description: 'Weekly entity consolidation in knowledge graph',
      schedule: '0 3 * * 1', // Monday 3am PT
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/knowledge-graph-consolidation`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '60s',
      maxBackoff: '300s',
      timeout: '600s',
    },
    {
      name: 'knowledge-graph-thread-maintenance',
      description: 'Daily conversation thread maintenance',
      schedule: '0 4 * * *', // Daily 4am PT
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/knowledge-graph-thread-maintenance`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '30s',
      maxBackoff: '120s',
      timeout: '300s',
    },
    {
      name: 'knowledge-graph-entity-decay',
      description: 'Daily entity importance decay',
      schedule: '0 5 * * *', // Daily 5am PT
      timezone: 'America/Los_Angeles',
      uri: `${CONFIG.uiServerUrl}/api/jobs/knowledge-graph-entity-decay`,
      httpMethod: 'POST',
      retryCount: 2,
      minBackoff: '30s',
      maxBackoff: '120s',
      timeout: '300s',
    },
  ];
}
