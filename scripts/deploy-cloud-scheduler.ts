#!/usr/bin/env npx tsx
/**
 * Deploy Cloud Scheduler Jobs
 *
 * Creates/updates Cloud Scheduler jobs that trigger background tasks.
 * These replace in-process setInterval calls for better reliability.
 *
 * Usage:
 *   pnpm ops:deploy:scheduler          # Deploy all jobs
 *   pnpm ops:deploy:scheduler --dry-run # Preview changes
 *   pnpm ops:deploy:scheduler --delete  # Delete all jobs
 *
 * @module scripts/deploy-cloud-scheduler
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'johnb-2025';
const REGION = 'us-central1';

// Service URLs (update these after deployment)
const UI_SERVER_URL =
  process.env.UI_SERVER_URL || 'https://john-bogle-ui-784391336098.us-central1.run.app';
const ASYNC_WORKER_URL =
  process.env.ASYNC_WORKER_URL || 'https://async-worker-784391336098.us-central1.run.app';
const INTELLIGENCE_WORKER_URL =
  process.env.INTELLIGENCE_WORKER_URL ||
  'https://intelligence-worker-784391336098.us-central1.run.app';

// Service account for authenticated requests
const SERVICE_ACCOUNT = `scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com`;

// ============================================================================
// JOB DEFINITIONS
// ============================================================================

interface SchedulerJob {
  name: string;
  description: string;
  schedule: string;
  timezone: string;
  uri: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  retryCount?: number;
  minBackoff?: string;
  maxBackoff?: string;
  timeout?: string;
  enabled: boolean;
  headers?: Record<string, string>;
}

const SCHEDULER_JOBS: SchedulerJob[] = [
  // ==========================================================================
  // BACKGROUND TASK PROCESSING
  // ==========================================================================
  {
    name: 'background-task-processor',
    description: 'Process pending background tasks (replaces in-process setInterval)',
    schedule: '* * * * *', // Every minute
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/process-background-tasks`,
    httpMethod: 'POST',
    retryCount: 2,
    minBackoff: '10s',
    maxBackoff: '60s',
    timeout: '60s',
    enabled: true,
  },
  {
    name: 'scheduled-job-checker',
    description: 'Check and trigger user-scheduled jobs',
    schedule: '* * * * *', // Every minute
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/check-scheduled`,
    httpMethod: 'POST',
    retryCount: 2,
    enabled: true,
  },

  // ==========================================================================
  // SESSION CLEANUP
  // ==========================================================================
  {
    name: 'session-cleanup',
    description: 'Clean up orphaned sessions to prevent memory leaks',
    schedule: '*/5 * * * *', // Every 5 minutes
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/cleanup-sessions`,
    httpMethod: 'POST',
    retryCount: 1,
    enabled: true,
  },
  {
    name: 'old-task-cleanup',
    description: 'Clean up completed/failed tasks older than 7 days',
    schedule: '0 3 * * *', // Daily at 3 AM
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/cleanup-old-tasks`,
    httpMethod: 'POST',
    retryCount: 2,
    enabled: true,
  },

  // ==========================================================================
  // OUTREACH PROCESSING
  // ==========================================================================
  {
    name: 'outreach-batch-processor',
    description: 'Process pending outreach triggers',
    schedule: '*/2 * * * *', // Every 2 minutes
    timezone: 'America/Los_Angeles',
    uri: `${ASYNC_WORKER_URL}/process-batch?limit=100`,
    httpMethod: 'POST',
    retryCount: 3,
    minBackoff: '30s',
    maxBackoff: '300s',
    enabled: true,
  },
  {
    name: 'daily-outreach-job',
    description: 'Daily outreach evaluation (thinking of you, growth reflections)',
    schedule: '0 10 * * *', // 10 AM daily
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/daily-outreach`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '300s', // 5 minutes - this job processes many users
    enabled: true,
  },
  {
    name: 'thinking-of-you-evaluator',
    description: 'Evaluate users for random "thinking of you" outreach',
    schedule: '0 */4 * * *', // Every 4 hours
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/evaluate-thinking-of-you`,
    httpMethod: 'POST',
    retryCount: 2,
    enabled: true,
  },

  // ==========================================================================
  // INTELLIGENCE PROCESSING
  // ==========================================================================
  {
    name: 'intelligence-batch-processor',
    description: 'Process pending intelligence events from queue',
    schedule: '*/5 * * * *', // Every 5 minutes
    timezone: 'America/Los_Angeles',
    uri: `${INTELLIGENCE_WORKER_URL}/process-batch?limit=100`,
    httpMethod: 'POST',
    retryCount: 3,
    enabled: true,
  },
  {
    name: 'pattern-detection-batch',
    description: 'Run pattern detection on accumulated data',
    schedule: '*/10 * * * *', // Every 10 minutes
    timezone: 'America/Los_Angeles',
    uri: `${INTELLIGENCE_WORKER_URL}/process-batch?type=pattern_detection&limit=50`,
    httpMethod: 'POST',
    retryCount: 3,
    enabled: true,
  },
  {
    name: 'predictive-analysis-batch',
    description: 'Run predictive analysis for active users',
    schedule: '0 */2 * * *', // Every 2 hours
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/run-predictive-analysis`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '300s',
    enabled: true,
  },
  {
    name: 'llm-deep-analysis',
    description: 'Run Gemini-powered deep pattern analysis (weekly)',
    schedule: '0 3 * * 0', // Weekly on Sunday at 3 AM (low traffic, cost-controlled)
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/run-deep-analysis`,
    httpMethod: 'POST',
    retryCount: 1, // Only retry once due to cost
    timeout: '600s', // 10 min - deep analysis is slower
    enabled: true,
  },
  {
    name: 'flush-ml-state',
    description: 'Persist ML model state (Markov, TimeSeries, Reinforcement) to Firestore',
    schedule: '*/10 * * * *', // Every 10 minutes
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/flush-ml-state`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '120s',
    enabled: true,
  },

  // ==========================================================================
  // ANALYTICS & MAINTENANCE
  // ==========================================================================
  {
    name: 'aggregate-community-insights',
    description: 'Aggregate anonymized community insights',
    schedule: '0 4 * * *', // Daily at 4 AM
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/aggregate-community-insights`,
    httpMethod: 'POST',
    retryCount: 2,
    enabled: true,
  },
  {
    name: 'rollup-persona-metrics',
    description: 'Roll up per-persona usage metrics',
    schedule: '0 5 * * *', // Daily at 5 AM
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/rollup-persona-metrics`,
    httpMethod: 'POST',
    retryCount: 2,
    enabled: true,
  },
  {
    name: 'sync-trust-profiles',
    description: 'Sync trust profiles to Firestore backup',
    schedule: '0 6 * * *', // Daily at 6 AM
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/sync-trust-profiles`,
    httpMethod: 'POST',
    retryCount: 2,
    enabled: true,
  },
  {
    name: 'cleanup-transcripts',
    description: 'Archive and cleanup old conversation transcripts',
    schedule: '0 2 * * 0', // Weekly on Sunday at 2 AM
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/cleanup-transcripts`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '600s',
    enabled: true,
  },
  {
    name: 'semantic-ttl-cleanup',
    description: 'Clean up expired documents from semantic data store based on TTL policies',
    schedule: '0 1 * * *', // Daily at 1 AM
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/ttl-cleanup`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '300s', // 5 min - may need to process many entities
    enabled: true,
  },
  {
    name: 'outreach-analytics-rollup',
    description: 'Aggregate daily outreach analytics',
    schedule: '0 4 * * *', // Daily at 4 AM
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/rollup-outreach-analytics`,
    httpMethod: 'POST',
    retryCount: 2,
    enabled: true,
  },

  // ==========================================================================
  // BETTER THAN HUMAN OUTREACH (AGI-LIKE PROACTIVE CAPABILITIES)
  // ==========================================================================
  {
    name: 'better-than-human-outreach-morning',
    description: 'Proactive outreach: thinking-of-you, commitment follow-ups, celebrations (morning batch)',
    schedule: '0 9 * * *', // 9 AM daily
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/better-than-human-outreach`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '300s', // 5 minutes - processes all users
    enabled: true,
  },
  {
    name: 'better-than-human-outreach-evening',
    description: 'Proactive outreach: evening batch for celebrations and gentle check-ins',
    schedule: '0 18 * * *', // 6 PM daily
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/better-than-human-outreach`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '300s',
    enabled: true,
  },
  {
    name: 'family-checkin-calls',
    description: 'Proactive family wellbeing check-in calls',
    schedule: '0 */2 * * *', // Every 2 hours
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/family-checkin-calls`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '300s',
    enabled: true,
  },
  {
    name: 'insight-action-processor',
    description: 'Process superhuman insights and trigger automated actions',
    schedule: '*/15 * * * *', // Every 15 minutes
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/process-insight-actions`,
    httpMethod: 'POST',
    retryCount: 2,
    timeout: '120s',
    enabled: true,
  },

  // ==========================================================================
  // WEEKLY RESETS
  // ==========================================================================
  {
    name: 'weekly-outreach-counter-reset',
    description: 'Reset weekly outreach counters for rate limiting',
    schedule: '0 0 * * 0', // Sunday at midnight
    timezone: 'America/Los_Angeles',
    uri: `${UI_SERVER_URL}/api/jobs/reset-weekly-counters`,
    httpMethod: 'POST',
    retryCount: 2,
    enabled: true,
  },
];

// ============================================================================
// DEPLOYMENT FUNCTIONS
// ============================================================================

async function checkGcloudAuth(): Promise<boolean> {
  try {
    await execAsync('gcloud auth print-access-token');
    return true;
  } catch {
    console.error('❌ Not authenticated with gcloud. Run: gcloud auth login');
    return false;
  }
}

async function checkServiceAccount(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `gcloud iam service-accounts describe ${SERVICE_ACCOUNT} --project=${PROJECT_ID} 2>/dev/null`
    );
    return stdout.includes(SERVICE_ACCOUNT);
  } catch {
    console.log(`⚠️ Service account ${SERVICE_ACCOUNT} not found. Creating...`);
    try {
      await execAsync(
        `gcloud iam service-accounts create scheduler-invoker ` +
          `--display-name="Cloud Scheduler Invoker" ` +
          `--project=${PROJECT_ID}`
      );

      // Grant Cloud Run invoker role
      await execAsync(
        `gcloud projects add-iam-policy-binding ${PROJECT_ID} ` +
          `--member="serviceAccount:${SERVICE_ACCOUNT}" ` +
          `--role="roles/run.invoker"`
      );

      console.log(`✅ Created service account: ${SERVICE_ACCOUNT}`);
      return true;
    } catch (createErr) {
      console.error('❌ Failed to create service account:', createErr);
      return false;
    }
  }
}

async function listExistingJobs(): Promise<Set<string>> {
  try {
    const { stdout } = await execAsync(
      `gcloud scheduler jobs list --location=${REGION} --project=${PROJECT_ID} --format="value(name)"`
    );
    const jobs = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((j) => j.split('/').pop() || j);
    return new Set(jobs);
  } catch {
    return new Set();
  }
}

async function createOrUpdateJob(job: SchedulerJob, existing: Set<string>, dryRun: boolean): Promise<void> {
  const action = existing.has(job.name) ? 'update' : 'create';
  const actionVerb = action === 'update' ? 'Updating' : 'Creating';

  console.log(`  ${actionVerb} job: ${job.name}`);

  if (dryRun) {
    console.log(`    [DRY RUN] Would ${action} with:`);
    console.log(`      Schedule: ${job.schedule}`);
    console.log(`      URI: ${job.uri}`);
    console.log(`      Enabled: ${job.enabled}`);
    return;
  }

  const baseCmd = `gcloud scheduler jobs ${action} http ${job.name}`;
  const args = [
    `--location=${REGION}`,
    `--project=${PROJECT_ID}`,
    `--schedule="${job.schedule}"`,
    `--time-zone="${job.timezone}"`,
    `--uri="${job.uri}"`,
    `--http-method=${job.httpMethod}`,
    `--oidc-service-account-email=${SERVICE_ACCOUNT}`,
    `--description="${job.description}"`,
  ];

  if (job.retryCount !== undefined) {
    args.push(`--max-retry-attempts=${job.retryCount}`);
  }
  if (job.minBackoff) {
    args.push(`--min-backoff=${job.minBackoff}`);
  }
  if (job.maxBackoff) {
    args.push(`--max-backoff=${job.maxBackoff}`);
  }
  if (job.timeout) {
    args.push(`--attempt-deadline=${job.timeout}`);
  }

  const cmd = `${baseCmd} ${args.join(' ')}`;

  try {
    await execAsync(cmd);
    console.log(`    ✅ ${action === 'create' ? 'Created' : 'Updated'}`);
  } catch (err) {
    console.error(`    ❌ Failed: ${err}`);
    throw err;
  }
}

async function deleteJob(jobName: string, dryRun: boolean): Promise<void> {
  console.log(`  Deleting job: ${jobName}`);

  if (dryRun) {
    console.log(`    [DRY RUN] Would delete`);
    return;
  }

  try {
    await execAsync(
      `gcloud scheduler jobs delete ${jobName} --location=${REGION} --project=${PROJECT_ID} --quiet`
    );
    console.log(`    ✅ Deleted`);
  } catch (err) {
    console.error(`    ❌ Failed: ${err}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const deleteAll = args.includes('--delete');
  const enabledOnly = !args.includes('--include-disabled');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Cloud Scheduler Deployment');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Project: ${PROJECT_ID}`);
  console.log(`  Region: ${REGION}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : deleteAll ? 'DELETE' : 'DEPLOY'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Pre-flight checks
  if (!dryRun) {
    console.log('\n📋 Pre-flight checks...');

    if (!(await checkGcloudAuth())) {
      process.exit(1);
    }
    console.log('  ✅ gcloud authenticated');

    if (!(await checkServiceAccount())) {
      process.exit(1);
    }
    console.log(`  ✅ Service account ready: ${SERVICE_ACCOUNT}`);
  }

  // Get existing jobs
  const existingJobs = await listExistingJobs();
  console.log(`\n📋 Found ${existingJobs.size} existing jobs`);

  if (deleteAll) {
    // Delete all jobs
    console.log('\n🗑️ Deleting all scheduler jobs...');
    for (const jobName of existingJobs) {
      await deleteJob(jobName, dryRun);
    }
    console.log('\n✅ All jobs deleted');
    return;
  }

  // Deploy jobs
  const jobsToDeploy = enabledOnly ? SCHEDULER_JOBS.filter((j) => j.enabled) : SCHEDULER_JOBS;

  console.log(`\n🚀 Deploying ${jobsToDeploy.length} scheduler jobs...\n`);

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const job of jobsToDeploy) {
    try {
      const isNew = !existingJobs.has(job.name);
      await createOrUpdateJob(job, existingJobs, dryRun);
      if (isNew) created++;
      else updated++;
    } catch {
      failed++;
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed: ${failed}`);

  if (dryRun) {
    console.log('\n  [DRY RUN] No changes were made. Remove --dry-run to apply.');
  } else if (failed === 0) {
    console.log('\n  ✅ All scheduler jobs deployed successfully!');
    console.log('\n  Next steps:');
    console.log('    1. Verify jobs in GCP Console:');
    console.log(`       https://console.cloud.google.com/cloudscheduler?project=${PROJECT_ID}`);
    console.log('    2. Monitor job executions:');
    console.log(`       gcloud scheduler jobs list --location=${REGION} --project=${PROJECT_ID}`);
    console.log('    3. View job logs:');
    console.log(`       gcloud logging read "resource.type=cloud_scheduler_job" --limit=50`);
  } else {
    console.log('\n  ⚠️ Some jobs failed to deploy. Check errors above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
