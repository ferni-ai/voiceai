#!/usr/bin/env npx tsx
/**
 * Memory Scheduler CLI Command
 *
 * Deploy and manage Cloud Scheduler jobs for the memory system.
 * Handles both memory maintenance jobs and knowledge graph jobs.
 *
 * Usage:
 *   ferni ops memory:deploy-scheduler         # Deploy all memory jobs
 *   ferni ops memory:deploy-scheduler --dry-run  # Preview what would be created
 *   ferni ops memory:scheduler-status         # Show status of all jobs
 *   ferni ops memory:trigger <job-name>       # Manually trigger a job
 *
 * @module cli/commands/ops/memory-scheduler
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: 'us-central1',
  uiServerUrl: 'https://app.ferni.ai',
  serviceAccount: 'scheduler-invoker@johnb-2025.iam.gserviceaccount.com',
};

// ============================================================================
// COLORS & LOGGING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) =>
    console.log(`\n${colors.bold}${colors.blue}━━━ ${msg} ━━━${colors.reset}\n`),
  substep: (msg: string) => console.log(`  ${colors.dim}→${colors.reset} ${msg}`),
};

// ============================================================================
// JOB DEFINITIONS (Memory System Jobs)
// ============================================================================

interface SchedulerJob {
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

function getMemoryJobs(): SchedulerJob[] {
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

// ============================================================================
// GCLOUD UTILITIES
// ============================================================================

async function checkGcloudAuth(): Promise<boolean> {
  try {
    await execAsync('gcloud auth print-access-token');
    return true;
  } catch {
    log.error('Not authenticated with gcloud. Run: gcloud auth login');
    return false;
  }
}

async function listExistingJobs(): Promise<Map<string, { state: string; schedule: string }>> {
  try {
    const { stdout } = await execAsync(
      `gcloud scheduler jobs list --location=${CONFIG.region} --project=${CONFIG.projectId} --format="json"`
    );
    const jobs = JSON.parse(stdout || '[]');
    const result = new Map<string, { state: string; schedule: string }>();

    for (const job of jobs) {
      const name = job.name.split('/').pop() || job.name;
      result.set(name, {
        state: job.state || 'UNKNOWN',
        schedule: job.schedule || '',
      });
    }

    return result;
  } catch {
    return new Map();
  }
}

async function createOrUpdateJob(
  job: SchedulerJob,
  existing: Map<string, { state: string; schedule: string }>,
  dryRun: boolean
): Promise<void> {
  const action = existing.has(job.name) ? 'update' : 'create';
  const actionVerb = action === 'update' ? 'Updating' : 'Creating';

  // Build the gcloud command
  const args = [
    `gcloud scheduler jobs ${action} http ${job.name}`,
    `--location=${CONFIG.region}`,
    `--project=${CONFIG.projectId}`,
    `--schedule="${job.schedule}"`,
    `--time-zone="${job.timezone}"`,
    `--uri="${job.uri}"`,
    `--http-method=${job.httpMethod}`,
    `--headers="Content-Type=application/json,X-CloudScheduler=true"`,
    `--oidc-service-account-email="${CONFIG.serviceAccount}"`,
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

  const command = args.join(' ');

  if (dryRun) {
    log.substep(`${colors.yellow}[DRY RUN]${colors.reset} ${actionVerb}: ${job.name}`);
    log.substep(`  Schedule: ${job.schedule}`);
    log.substep(`  URI: ${job.uri}`);
    return;
  }

  log.substep(`${actionVerb}: ${job.name}`);

  try {
    await execAsync(command);
    log.success(`${job.name} - ${action}d successfully`);
  } catch (error) {
    log.error(`Failed to ${action} ${job.name}: ${error}`);
    throw error;
  }
}

async function triggerJob(jobName: string): Promise<void> {
  log.info(`Triggering job: ${jobName}`);

  try {
    await execAsync(
      `gcloud scheduler jobs run ${jobName} --location=${CONFIG.region} --project=${CONFIG.projectId}`
    );
    log.success(`Job ${jobName} triggered successfully`);
  } catch (error) {
    log.error(`Failed to trigger ${jobName}: ${error}`);
    throw error;
  }
}

// ============================================================================
// MAIN COMMANDS
// ============================================================================

async function deployMemoryScheduler(dryRun: boolean): Promise<void> {
  log.step('Memory System Scheduler Deployment');

  // Check auth
  if (!(await checkGcloudAuth())) {
    process.exit(1);
  }

  // Get existing jobs
  log.info('Fetching existing Cloud Scheduler jobs...');
  const existing = await listExistingJobs();
  log.substep(`Found ${existing.size} existing jobs`);

  // Get memory jobs
  const memoryJobs = getMemoryJobs();
  log.info(`Deploying ${memoryJobs.length} memory system jobs...`);

  if (dryRun) {
    log.warn('DRY RUN MODE - No changes will be made\n');
  }

  // Deploy each job
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const job of memoryJobs) {
    try {
      const isUpdate = existing.has(job.name);
      await createOrUpdateJob(job, existing, dryRun);
      if (isUpdate) {
        updated++;
      } else {
        created++;
      }
    } catch {
      errors++;
    }
  }

  // Summary
  log.step('Deployment Summary');
  log.success(`Created: ${created}`);
  log.success(`Updated: ${updated}`);
  if (errors > 0) {
    log.error(`Errors: ${errors}`);
  }

  if (dryRun) {
    log.warn('\nDRY RUN complete. Run without --dry-run to apply changes.');
  } else {
    log.success('\nMemory scheduler deployment complete!');
    log.info('Verify with: ferni ops memory:scheduler-status');
  }
}

async function showSchedulerStatus(): Promise<void> {
  log.step('Memory System Scheduler Status');

  // Check auth
  if (!(await checkGcloudAuth())) {
    process.exit(1);
  }

  // Get existing jobs
  const existing = await listExistingJobs();
  const memoryJobs = getMemoryJobs();
  const memoryJobNames = new Set(memoryJobs.map((j) => j.name));

  // Filter to only memory jobs
  const memorySchedulerJobs = Array.from(existing.entries()).filter(([name]) =>
    memoryJobNames.has(name)
  );

  if (memorySchedulerJobs.length === 0) {
    log.warn('No memory scheduler jobs found. Run: ferni ops memory:deploy-scheduler');
    return;
  }

  // Display status
  console.log('\n');
  console.log(`${'Job Name'.padEnd(40)} ${'State'.padEnd(12)} Schedule`);
  console.log(`${'─'.repeat(40)} ${'─'.repeat(12)} ${'─'.repeat(20)}`);

  for (const [name, info] of memorySchedulerJobs) {
    const stateColor =
      info.state === 'ENABLED' ? colors.green : info.state === 'PAUSED' ? colors.yellow : colors.red;
    console.log(`${name.padEnd(40)} ${stateColor}${info.state.padEnd(12)}${colors.reset} ${info.schedule}`);
  }

  // Show missing jobs
  const missingJobs = memoryJobs.filter((j) => !existing.has(j.name));
  if (missingJobs.length > 0) {
    console.log('\n');
    log.warn(`Missing jobs (${missingJobs.length}):`);
    for (const job of missingJobs) {
      log.substep(`${job.name} - ${job.description}`);
    }
    log.info('\nDeploy missing jobs with: ferni ops memory:deploy-scheduler');
  }

  // Overall status
  const enabledCount = memorySchedulerJobs.filter(([, info]) => info.state === 'ENABLED').length;
  const totalExpected = memoryJobs.length;

  console.log('\n');
  if (enabledCount === totalExpected && memorySchedulerJobs.length === totalExpected) {
    log.success(`Memory scheduler: ${colors.green}FULLY OPERATIONAL${colors.reset} (${enabledCount}/${totalExpected} jobs enabled)`);
  } else if (enabledCount > 0) {
    log.warn(`Memory scheduler: ${colors.yellow}PARTIALLY OPERATIONAL${colors.reset} (${enabledCount}/${totalExpected} jobs enabled)`);
  } else {
    log.error(`Memory scheduler: ${colors.red}NOT OPERATIONAL${colors.reset} (0/${totalExpected} jobs enabled)`);
  }
}

async function triggerMemoryJob(jobName: string): Promise<void> {
  log.step(`Triggering Memory Job: ${jobName}`);

  // Validate job name
  const memoryJobs = getMemoryJobs();
  const validJob = memoryJobs.find((j) => j.name === jobName);

  if (!validJob) {
    log.error(`Unknown job: ${jobName}`);
    log.info('Available jobs:');
    for (const job of memoryJobs) {
      log.substep(`${job.name}`);
    }
    process.exit(1);
  }

  // Check auth
  if (!(await checkGcloudAuth())) {
    process.exit(1);
  }

  await triggerJob(jobName);
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

export async function memorySchedulerCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';
  const dryRun = args.includes('--dry-run');
  const jobName = args.find((a) => !a.startsWith('--') && a !== subcommand);

  switch (subcommand) {
    case 'deploy':
    case 'deploy-scheduler':
      await deployMemoryScheduler(dryRun);
      break;

    case 'status':
    case 'scheduler-status':
      await showSchedulerStatus();
      break;

    case 'trigger':
      if (!jobName) {
        log.error('Please specify a job name: ferni ops memory:trigger <job-name>');
        process.exit(1);
      }
      await triggerMemoryJob(jobName);
      break;

    case 'list':
      log.step('Available Memory Jobs');
      for (const job of getMemoryJobs()) {
        console.log(`\n${colors.bold}${job.name}${colors.reset}`);
        log.substep(`Schedule: ${job.schedule}`);
        log.substep(`Description: ${job.description}`);
      }
      break;

    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      console.log('\nUsage:');
      console.log('  ferni ops memory:deploy-scheduler [--dry-run]  Deploy all memory jobs');
      console.log('  ferni ops memory:scheduler-status              Show job status');
      console.log('  ferni ops memory:trigger <job-name>            Manually trigger a job');
      console.log('  ferni ops memory:list                          List available jobs');
      process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1]?.includes('memory-scheduler')) {
  memorySchedulerCommand(process.argv.slice(2));
}
