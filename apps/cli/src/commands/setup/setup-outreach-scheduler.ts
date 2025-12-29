#!/usr/bin/env npx tsx
/**
 * Setup Cloud Scheduler for Daily Outreach Job
 *
 * Creates a GCP Cloud Scheduler job that triggers the daily outreach
 * evaluation at 10 AM Pacific time. This enables "Thinking of You"
 * proactive messages.
 *
 * The scheduler calls the async worker's /jobs/daily-outreach endpoint,
 * which evaluates all active users for potential outreach moments.
 *
 * Security Note: This CLI tool uses execSync for gcloud commands. All command
 * arguments are hardcoded or from trusted environment variables (not user input).
 * This is safe for admin CLI tools.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/setup/setup-outreach-scheduler.ts
 *   pnpm ferni setup outreach-scheduler
 *   pnpm ferni setup outreach-scheduler --dry-run
 */

import { execSync } from 'node:child_process';

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Configuration - all values are hardcoded or from trusted env vars
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'johnb-2025';
const REGION = 'us-central1';
const SERVICE_ACCOUNT = `cloud-scheduler@${PROJECT_ID}.iam.gserviceaccount.com`;

interface SchedulerJob {
  name: string;
  description: string;
  schedule: string;
  timezone: string;
  uri: string;
  httpMethod: 'GET' | 'POST';
  headers: Record<string, string>;
  retryCount: number;
  attemptDeadline: string;
}

function printHeader(text: string): void {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);
}

/**
 * Execute a shell command safely.
 * Note: All inputs are from trusted sources (hardcoded or env vars), not user input.
 */
function runCommand(cmd: string, dryRun: boolean, silent = false): string {
  if (dryRun) {
    if (!silent) console.log(`${YELLOW}[DRY-RUN]${RESET} ${cmd}`);
    return '';
  }
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    throw new Error(e.stderr || e.message || 'Command failed');
  }
}

function checkPrerequisites(): boolean {
  console.log(`${CYAN}Checking prerequisites...${RESET}\n`);

  // Check gcloud is installed
  try {
    execSync('gcloud --version', { stdio: 'pipe' });
    console.log(`${GREEN}✓${RESET} gcloud CLI installed`);
  } catch {
    console.log(`${RED}✗${RESET} gcloud CLI not installed`);
    return false;
  }

  // Check authenticated
  try {
    const account = execSync('gcloud config get-value account 2>/dev/null', { encoding: 'utf8' }).trim();
    if (account) {
      console.log(`${GREEN}✓${RESET} Authenticated as: ${account}`);
    } else {
      console.log(`${RED}✗${RESET} Not authenticated. Run: gcloud auth login`);
      return false;
    }
  } catch {
    console.log(`${RED}✗${RESET} Authentication check failed`);
    return false;
  }

  console.log(`${GREEN}✓${RESET} Project: ${PROJECT_ID}`);
  return true;
}

function discoverAsyncWorkerUrl(): string | null {
  console.log(`\n${CYAN}Discovering async worker URL...${RESET}`);

  try {
    // Try to get the Cloud Run service URL
    const cmd = [
      'gcloud', 'run', 'services', 'describe', 'ferni-async',
      `--region=${REGION}`,
      `--project=${PROJECT_ID}`,
      '--format=value(status.url)',
    ].join(' ');

    const url = execSync(cmd + ' 2>/dev/null', { encoding: 'utf8' }).trim();

    if (url) {
      console.log(`${GREEN}✓${RESET} Found async worker: ${url}`);
      return url;
    }
  } catch {
    // Service doesn't exist yet
  }

  console.log(`${YELLOW}⚠${RESET} Async worker not deployed yet`);
  console.log(`  → Run: ferni deploy async  (when async worker is set up)`);
  console.log(`  → For now, using placeholder URL for reference\n`);

  return null;
}

function ensureServiceAccount(dryRun: boolean): boolean {
  console.log(`\n${CYAN}Ensuring service account exists...${RESET}`);

  const describeCmd = [
    'gcloud', 'iam', 'service-accounts', 'describe',
    SERVICE_ACCOUNT,
    `--project=${PROJECT_ID}`,
  ].join(' ');

  try {
    runCommand(describeCmd, dryRun, true);
    console.log(`${GREEN}✓${RESET} Service account exists: ${SERVICE_ACCOUNT}`);
    return true;
  } catch {
    console.log(`${YELLOW}Creating service account...${RESET}`);
    try {
      const createCmd = [
        'gcloud', 'iam', 'service-accounts', 'create', 'cloud-scheduler',
        '--display-name=Cloud Scheduler Jobs',
        `--project=${PROJECT_ID}`,
      ].join(' ');
      runCommand(createCmd, dryRun);

      // Grant Cloud Run invoker role
      const bindCmd = [
        'gcloud', 'projects', 'add-iam-policy-binding', PROJECT_ID,
        `--member=serviceAccount:${SERVICE_ACCOUNT}`,
        '--role=roles/run.invoker',
      ].join(' ');
      runCommand(bindCmd, dryRun);

      console.log(`${GREEN}✓${RESET} Created service account with invoker permissions`);
      return true;
    } catch (error) {
      console.log(`${RED}✗${RESET} Failed to create service account: ${error}`);
      return false;
    }
  }
}

function createSchedulerJob(job: SchedulerJob, dryRun: boolean): boolean {
  console.log(`\n${CYAN}Creating scheduler job: ${job.name}...${RESET}`);

  // Check if job already exists
  const describeCmd = [
    'gcloud', 'scheduler', 'jobs', 'describe', job.name,
    `--location=${REGION}`,
    `--project=${PROJECT_ID}`,
  ].join(' ');

  try {
    runCommand(describeCmd, false, true);
    console.log(`${YELLOW}⚠${RESET} Job already exists. Updating...`);

    // Delete existing job to recreate with new settings
    const deleteCmd = [
      'gcloud', 'scheduler', 'jobs', 'delete', job.name,
      `--location=${REGION}`,
      `--project=${PROJECT_ID}`,
      '--quiet',
    ].join(' ');
    runCommand(deleteCmd, dryRun);
  } catch {
    // Job doesn't exist, which is fine
  }

  // Build the headers argument
  const headersArg = Object.entries(job.headers)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

  const createCmd = [
    'gcloud', 'scheduler', 'jobs', 'create', 'http', job.name,
    `--location=${REGION}`,
    `--schedule="${job.schedule}"`,
    `--time-zone="${job.timezone}"`,
    `--uri="${job.uri}"`,
    `--http-method=${job.httpMethod}`,
    `--headers="${headersArg}"`,
    `--oidc-service-account-email=${SERVICE_ACCOUNT}`,
    `--attempt-deadline=${job.attemptDeadline}`,
    `--max-retry-attempts=${job.retryCount}`,
    `--description="${job.description}"`,
    `--project=${PROJECT_ID}`,
  ].join(' ');

  try {
    runCommand(createCmd, dryRun);
    console.log(`${GREEN}✓${RESET} Created scheduler job: ${job.name}`);
    return true;
  } catch (error) {
    console.log(`${RED}✗${RESET} Failed to create job: ${error}`);
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  printHeader('📬 SETUP DAILY OUTREACH SCHEDULER');

  if (dryRun) {
    console.log(`${YELLOW}Running in DRY-RUN mode - no changes will be made${RESET}\n`);
  }

  // Check prerequisites
  if (!checkPrerequisites()) {
    console.log(`\n${RED}Prerequisites not met. Please fix the issues above and retry.${RESET}`);
    process.exit(1);
  }

  // Discover async worker URL
  const asyncWorkerUrl = discoverAsyncWorkerUrl();

  if (!asyncWorkerUrl && !dryRun) {
    console.log(`\n${YELLOW}⚠ Cannot create scheduler job without async worker deployed.${RESET}`);
    console.log(`\nTo proceed:`);
    console.log(`  1. Deploy the async worker: ferni deploy async`);
    console.log(`  2. Re-run this command: ferni setup outreach-scheduler`);
    console.log(`\nAlternatively, run with --dry-run to see what would be created.`);
    process.exit(1);
  }

  const workerUrl = asyncWorkerUrl || 'https://ferni-async-PLACEHOLDER.run.app';

  // Ensure service account exists
  if (!ensureServiceAccount(dryRun)) {
    process.exit(1);
  }

  // Define the daily outreach job
  const dailyOutreachJob: SchedulerJob = {
    name: 'daily-outreach-job',
    description: 'Evaluate users for proactive Thinking of You messages (10 AM PT)',
    schedule: '0 10 * * *', // 10 AM daily
    timezone: 'America/Los_Angeles',
    uri: `${workerUrl}/jobs/daily-outreach`,
    httpMethod: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CloudScheduler': 'true',
    },
    retryCount: 2,
    attemptDeadline: '600s', // 10 minutes max
  };

  // Define the weekly deep analysis job
  const deepAnalysisJob: SchedulerJob = {
    name: 'weekly-deep-analysis',
    description: 'Run Gemini deep analysis on user conversations (Sundays 3 AM PT)',
    schedule: '0 3 * * 0', // 3 AM on Sundays
    timezone: 'America/Los_Angeles',
    uri: `${workerUrl}/api/jobs/run-deep-analysis`,
    httpMethod: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CloudScheduler': 'true',
    },
    retryCount: 1, // Expensive operation, don't retry too much
    attemptDeadline: '1800s', // 30 minutes max (deep analysis can be slow)
  };

  // Define the daily ML state flush job
  const mlFlushJob: SchedulerJob = {
    name: 'daily-ml-flush',
    description: 'Flush ML model state to Firestore (2 AM PT daily)',
    schedule: '0 2 * * *', // 2 AM daily
    timezone: 'America/Los_Angeles',
    uri: `${workerUrl}/api/jobs/flush-ml-state`,
    httpMethod: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CloudScheduler': 'true',
    },
    retryCount: 2,
    attemptDeadline: '300s', // 5 minutes
  };

  // Create the jobs
  let success = createSchedulerJob(dailyOutreachJob, dryRun);
  success = createSchedulerJob(deepAnalysisJob, dryRun) && success;
  success = createSchedulerJob(mlFlushJob, dryRun) && success;

  if (success || dryRun) {
    console.log(`\n${BOLD}${GREEN}✓ Scheduler setup complete!${RESET}\n`);
    console.log(`\n${CYAN}Jobs created:${RESET}`);
    console.log(`  1. ${dailyOutreachJob.name}: ${dailyOutreachJob.schedule} (${dailyOutreachJob.timezone})`);
    console.log(`  2. ${deepAnalysisJob.name}: ${deepAnalysisJob.schedule} (${deepAnalysisJob.timezone})`);
    console.log(`  3. ${mlFlushJob.name}: ${mlFlushJob.schedule} (${mlFlushJob.timezone})`);
    console.log(`\nView scheduler jobs:`);
    console.log(`  https://console.cloud.google.com/cloudscheduler?project=${PROJECT_ID}`);
    console.log(`\nManual triggers:`);
    console.log(`  gcloud scheduler jobs run ${dailyOutreachJob.name} --location=${REGION} --project=${PROJECT_ID}`);
    console.log(`  gcloud scheduler jobs run ${deepAnalysisJob.name} --location=${REGION} --project=${PROJECT_ID}`);
    console.log(`  gcloud scheduler jobs run ${mlFlushJob.name} --location=${REGION} --project=${PROJECT_ID}`);
  } else {
    console.log(`\n${RED}Failed to create one or more scheduler jobs.${RESET}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`${RED}Error:${RESET}`, error);
  process.exit(1);
});
