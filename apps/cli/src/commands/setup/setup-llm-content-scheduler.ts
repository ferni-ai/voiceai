#!/usr/bin/env npx tsx
/**
 * Setup/Deploy LLM Content Cloud Scheduler Jobs
 *
 * Creates/updates Cloud Scheduler jobs for LLM dynamic content cache warming.
 * Run this after deploying the UI server with LLM content routes.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/setup/setup-llm-content-scheduler.ts
 *   npx tsx apps/cli/src/commands/setup/setup-llm-content-scheduler.ts --dry-run
 *   npx tsx apps/cli/src/commands/setup/setup-llm-content-scheduler.ts --delete
 *   ferni setup llm-content
 */

import { execSync } from 'child_process';

// Configuration
const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',
  baseUrl: 'https://app.ferni.ai/api/llm-content',
  timeZone: 'America/Los_Angeles',
};

// Job definitions
const JOBS = [
  {
    name: 'llm-content-prewarm',
    schedule: '*/5 * * * *', // Every 5 minutes
    endpoint: '/prewarm',
    description: 'Keep LLM content cache warm for fast responses',
  },
  {
    name: 'llm-content-metrics-reset',
    schedule: '0 0 * * *', // Midnight daily
    endpoint: '/reset',
    description: 'Daily reset of LLM content metrics',
  },
];

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const deleteJobs = args.includes('--delete');

console.log('🔧 LLM Content Scheduler Setup');
console.log(`   Project: ${CONFIG.projectId}`);
console.log(`   Region: ${CONFIG.region}`);
console.log(`   Base URL: ${CONFIG.baseUrl}`);
if (dryRun) console.log('   [DRY RUN MODE]');
if (deleteJobs) console.log('   [DELETE MODE]');
console.log();

/**
 * Run a gcloud command
 */
function runGcloud(command: string, options?: { ignoreError?: boolean }): string | null {
  const fullCommand = `gcloud ${command} --project=${CONFIG.projectId}`;

  if (dryRun) {
    console.log(`   Would run: ${fullCommand}`);
    return null;
  }

  try {
    console.log(`   Running: ${command.slice(0, 80)}...`);
    return execSync(fullCommand, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    if (options?.ignoreError) {
      return null;
    }
    throw error;
  }
}

/**
 * Check if a job exists
 */
function jobExists(name: string): boolean {
  try {
    execSync(
      `gcloud scheduler jobs describe ${name} --location=${CONFIG.region} --project=${CONFIG.projectId}`,
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Create or update a job
 */
function createOrUpdateJob(job: (typeof JOBS)[0]): void {
  const uri = `${CONFIG.baseUrl}${job.endpoint}`;
  const exists = jobExists(job.name);

  const action = deleteJobs ? 'delete' : exists ? 'update' : 'create';

  console.log(`\n📅 ${action.toUpperCase()}: ${job.name}`);
  console.log(`   Schedule: ${job.schedule}`);
  console.log(`   Endpoint: ${uri}`);

  if (deleteJobs) {
    if (exists) {
      runGcloud(`scheduler jobs delete ${job.name} --location=${CONFIG.region} --quiet`);
      console.log(`   ✅ Deleted`);
    } else {
      console.log(`   ⏭️  Does not exist, skipping`);
    }
    return;
  }

  const command = `scheduler jobs ${action} http ${job.name} ` +
    `--location=${CONFIG.region} ` +
    `--schedule="${job.schedule}" ` +
    `--uri="${uri}" ` +
    `--http-method=POST ` +
    `--headers="Content-Type=application/json,X-CloudScheduler=true" ` +
    `--time-zone="${CONFIG.timeZone}" ` +
    `--description="${job.description}"`;

  runGcloud(command);
  console.log(`   ✅ ${exists ? 'Updated' : 'Created'}`);
}

// Main
async function main() {
  console.log('═'.repeat(60));

  for (const job of JOBS) {
    createOrUpdateJob(job);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n✅ LLM Content Scheduler setup complete!\n');

  if (!deleteJobs) {
    console.log('📊 Test commands:');
    console.log('   curl -X POST https://app.ferni.ai/api/llm-content/prewarm');
    console.log('   curl https://app.ferni.ai/api/llm-content/metrics | jq');
    console.log('   curl https://app.ferni.ai/api/llm-content/summary');
    console.log();
    console.log('📋 List jobs:');
    console.log(`   gcloud scheduler jobs list --location=${CONFIG.region} | grep llm-content`);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

