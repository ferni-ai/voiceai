#!/usr/bin/env npx tsx
/**
 * Setup Brand Scheduler
 *
 * Deploys brand automation jobs to GCP Cloud Scheduler.
 * This is a convenience wrapper around deploy-cloud-scheduler.ts
 * that focuses only on brand-related jobs.
 *
 * Usage:
 *   ferni brand scheduler setup          # Deploy brand jobs
 *   ferni brand scheduler setup --dry-run # Preview changes
 *   ferni brand scheduler status         # List brand job status
 *   ferni brand scheduler test <job>     # Manually trigger a job
 *
 * @module cli/commands/brand/setup-brand-scheduler
 */

import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'johnb-2025';
const REGION = 'us-central1';
const UI_SERVER_URL =
  process.env.UI_SERVER_URL || 'https://john-bogle-ui-784391336098.us-central1.run.app';

// Brand-specific jobs
const BRAND_JOBS = [
  'brand-award-deadline-check',
  'brand-story-review-reminder',
  'brand-workstream-progress',
  'brand-milestone-check',
  'brand-ambassador-engagement',
  'brand-metrics-collection',
  'brand-weekly-report',
  'brand-publish-stories',
];

// ============================================================================
// COMMANDS
// ============================================================================

export async function setupBrandScheduler(options: {
  dryRun?: boolean;
}): Promise<void> {
  console.log(chalk.bold('\n🗓️  Brand Scheduler Setup\n'));

  // Check for gcloud auth
  try {
    await execAsync('gcloud auth print-access-token');
  } catch {
    console.log(chalk.red('❌ Not authenticated with gcloud. Run: gcloud auth login'));
    return;
  }

  console.log(chalk.gray(`Project: ${PROJECT_ID}`));
  console.log(chalk.gray(`Region: ${REGION}`));
  console.log(chalk.gray(`Mode: ${options.dryRun ? 'DRY RUN' : 'DEPLOY'}`));
  console.log();

  // Run the main scheduler deployment script
  const scriptPath = '../../../../../scripts/deploy-cloud-scheduler.ts';
  const dryRunFlag = options.dryRun ? '--dry-run' : '';

  console.log(chalk.cyan('Deploying brand automation jobs...'));
  console.log();

  try {
    const { stdout, stderr } = await execAsync(
      `npx tsx ${scriptPath} ${dryRunFlag}`,
      { cwd: import.meta.dirname }
    );

    // Filter output to show only brand-related jobs
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (BRAND_JOBS.some((job) => line.includes(job)) || line.includes('Summary') || line.includes('═')) {
        console.log(line);
      }
    }

    if (stderr && !stderr.includes('ExperimentalWarning')) {
      console.error(chalk.yellow(stderr));
    }

    console.log(chalk.green('\n✅ Brand scheduler setup complete!'));
    console.log();
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray('  1. View jobs: ferni brand scheduler status'));
    console.log(chalk.gray('  2. Test a job: ferni brand scheduler test award-deadline-check'));
    console.log(chalk.gray('  3. View in GCP Console:'));
    console.log(chalk.gray(`     https://console.cloud.google.com/cloudscheduler?project=${PROJECT_ID}`));
  } catch (error) {
    console.error(chalk.red('Failed to deploy scheduler jobs:'), error);
  }
}

export async function showBrandSchedulerStatus(): Promise<void> {
  console.log(chalk.bold('\n📊 Brand Scheduler Status\n'));

  try {
    const { stdout } = await execAsync(
      `gcloud scheduler jobs list --location=${REGION} --project=${PROJECT_ID} --format="table(name,state,schedule,lastAttemptTime)"`
    );

    // Filter to show only brand jobs
    const lines = stdout.split('\n');
    const header = lines[0];
    const brandLines = lines.filter((line) =>
      BRAND_JOBS.some((job) => line.includes(job)) || line.includes('NAME')
    );

    if (brandLines.length <= 1) {
      console.log(chalk.yellow('No brand scheduler jobs found.'));
      console.log(chalk.gray('Run `ferni brand scheduler setup` to deploy them.'));
      return;
    }

    console.log(brandLines.join('\n'));
  } catch (error) {
    console.error(chalk.red('Failed to get scheduler status:'), error);
    console.log(chalk.gray('Make sure you are authenticated: gcloud auth login'));
  }
}

export async function testBrandJob(jobName: string): Promise<void> {
  // Normalize job name (add prefix if needed)
  const fullJobName = jobName.startsWith('brand-') ? jobName : `brand-${jobName}`;

  if (!BRAND_JOBS.includes(fullJobName)) {
    console.log(chalk.red(`Unknown job: ${fullJobName}`));
    console.log(chalk.gray('Available jobs:'));
    for (const job of BRAND_JOBS) {
      console.log(chalk.gray(`  - ${job}`));
    }
    return;
  }

  console.log(chalk.bold(`\n🧪 Testing job: ${fullJobName}\n`));

  // Option 1: Trigger via Cloud Scheduler
  console.log(chalk.gray('Triggering via Cloud Scheduler...'));

  try {
    await execAsync(
      `gcloud scheduler jobs run ${fullJobName} --location=${REGION} --project=${PROJECT_ID}`
    );
    console.log(chalk.green('✅ Job triggered successfully!'));
    console.log();
    console.log(chalk.gray('View execution logs:'));
    console.log(chalk.gray(`  gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=${fullJobName}" --limit=10`));
  } catch (error) {
    // If Cloud Scheduler trigger fails, try direct HTTP call
    console.log(chalk.yellow('Cloud Scheduler trigger failed, trying direct HTTP call...'));

    try {
      const endpoint = `${UI_SERVER_URL}/api/jobs/${fullJobName}`;
      console.log(chalk.gray(`POST ${endpoint}`));

      const { stdout } = await execAsync(`curl -s -X POST "${endpoint}"`);
      const result = JSON.parse(stdout);

      if (result.success) {
        console.log(chalk.green('✅ Job executed successfully!'));
        console.log(chalk.gray(JSON.stringify(result, null, 2)));
      } else {
        console.log(chalk.red('❌ Job failed:'), result.error);
      }
    } catch (httpError) {
      console.error(chalk.red('Failed to test job:'), httpError);
    }
  }
}

// ============================================================================
// CLI ROUTER
// ============================================================================

export async function brandScheduler(
  subcommand: string,
  options: Record<string, unknown>
): Promise<void> {
  switch (subcommand) {
    case 'setup':
      await setupBrandScheduler({ dryRun: options.dryRun as boolean });
      break;

    case 'status':
      await showBrandSchedulerStatus();
      break;

    case 'test':
      if (!options.job) {
        console.log(chalk.red('Please specify a job name: ferni brand scheduler test <job-name>'));
        console.log(chalk.gray('Available jobs:'));
        for (const job of BRAND_JOBS) {
          console.log(chalk.gray(`  - ${job.replace('brand-', '')}`));
        }
        return;
      }
      await testBrandJob(options.job as string);
      break;

    default:
      console.log(chalk.bold('\n🗓️  Brand Scheduler Commands\n'));
      console.log('  ' + chalk.cyan('ferni brand scheduler setup') + '          Deploy brand jobs to Cloud Scheduler');
      console.log('  ' + chalk.cyan('ferni brand scheduler setup --dry-run') + ' Preview changes without deploying');
      console.log('  ' + chalk.cyan('ferni brand scheduler status') + '         Show status of brand jobs');
      console.log('  ' + chalk.cyan('ferni brand scheduler test <job>') + '     Manually trigger a job');
      console.log();
      console.log(chalk.gray('Jobs:'));
      for (const job of BRAND_JOBS) {
        console.log(chalk.gray(`  - ${job}`));
      }
  }
}
