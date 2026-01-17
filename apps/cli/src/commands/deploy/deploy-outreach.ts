#!/usr/bin/env npx tsx
/**
 * Outreach System Deployment
 *
 * Deploys the proactive outreach infrastructure:
 * 1. Outreach Scheduler Cloud Function
 * 2. Cloud Scheduler job (triggers every 15 minutes)
 * 3. Pub/Sub topic (outreach-trigger)
 *
 * Usage:
 *   ferni deploy outreach
 *   ferni deploy outreach --dry-run
 *
 * Philosophy: "Better than Human" means reaching out at the right moment.
 * This system enables Ferni to send proactive check-ins, celebrations,
 * and "thinking of you" messages when the time is right.
 *
 * @module cli/commands/deploy/deploy-outreach
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',
  functionName: 'outreachScheduler',
  topicName: 'outreach-trigger',
  schedulerJobName: 'outreach-check',
  schedule: '0/15 * * * *', // Every 15 minutes
  timezone: 'America/New_York',
  runtime: 'nodejs20',
  timeout: '300s',
  memory: '512MB',
};

// ============================================================================
// COLORS
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
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) =>
    console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// UTILITIES
// ============================================================================

function exec(cmd: string, options: { silent?: boolean; dryRun?: boolean } = {}): string {
  if (options.dryRun) {
    log.info(`[DRY RUN] Would execute: ${cmd}`);
    return '';
  }

  try {
    return execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (!options.silent) {
      throw error;
    }
    return '';
  }
}

function checkCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// DEPLOYMENT STEPS
// ============================================================================

async function ensurePubSubTopic(dryRun: boolean): Promise<boolean> {
  log.step('Ensuring Pub/Sub Topic');

  // Check if topic exists
  const topicExists = exec(
    `gcloud pubsub topics describe ${CONFIG.topicName} --project=${CONFIG.projectId} 2>/dev/null || echo "NOT_FOUND"`,
    { silent: true }
  );

  if (topicExists.includes('NOT_FOUND')) {
    log.info(`Creating Pub/Sub topic: ${CONFIG.topicName}`);
    exec(
      `gcloud pubsub topics create ${CONFIG.topicName} --project=${CONFIG.projectId}`,
      { dryRun }
    );
    log.success(`Pub/Sub topic created: ${CONFIG.topicName}`);
  } else {
    log.success(`Pub/Sub topic already exists: ${CONFIG.topicName}`);
  }

  return true;
}

async function deployCloudFunction(dryRun: boolean): Promise<boolean> {
  log.step('Deploying Cloud Function');

  const functionsDir = join(PROJECT_ROOT, 'functions');
  const sourceFile = join(functionsDir, 'outreach-scheduler.ts');

  if (!existsSync(sourceFile)) {
    log.error(`Source file not found: ${sourceFile}`);
    return false;
  }

  log.info(`Deploying function: ${CONFIG.functionName}`);

  const deployCmd = `gcloud functions deploy ${CONFIG.functionName} \
    --gen2 \
    --runtime=${CONFIG.runtime} \
    --trigger-topic=${CONFIG.topicName} \
    --entry-point=${CONFIG.functionName} \
    --timeout=${CONFIG.timeout} \
    --memory=${CONFIG.memory} \
    --region=${CONFIG.region} \
    --project=${CONFIG.projectId} \
    --source=${functionsDir}`;

  exec(deployCmd, { dryRun });

  if (!dryRun) {
    log.success(`Cloud Function deployed: ${CONFIG.functionName}`);
  }

  return true;
}

async function createOrUpdateScheduler(dryRun: boolean): Promise<boolean> {
  log.step('Creating/Updating Cloud Scheduler Job');

  // Check if scheduler job exists
  const jobExists = exec(
    `gcloud scheduler jobs describe ${CONFIG.schedulerJobName} --location=${CONFIG.region} --project=${CONFIG.projectId} 2>/dev/null || echo "NOT_FOUND"`,
    { silent: true }
  );

  const scheduleCmd = jobExists.includes('NOT_FOUND')
    ? `gcloud scheduler jobs create pubsub ${CONFIG.schedulerJobName}`
    : `gcloud scheduler jobs update pubsub ${CONFIG.schedulerJobName}`;

  const fullCmd = `${scheduleCmd} \
    --schedule="${CONFIG.schedule}" \
    --topic=${CONFIG.topicName} \
    --message-body="{}" \
    --time-zone="${CONFIG.timezone}" \
    --location=${CONFIG.region} \
    --project=${CONFIG.projectId}`;

  exec(fullCmd, { dryRun });

  if (!dryRun) {
    log.success(
      `Cloud Scheduler job ${jobExists.includes('NOT_FOUND') ? 'created' : 'updated'}: ${CONFIG.schedulerJobName}`
    );
    log.info(`Schedule: ${CONFIG.schedule} (${CONFIG.timezone})`);
  }

  return true;
}

async function verifyDeployment(dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    log.info('[DRY RUN] Would verify deployment');
    return true;
  }

  log.step('Verifying Deployment');

  // Check function status
  try {
    const functionStatus = exec(
      `gcloud functions describe ${CONFIG.functionName} --region=${CONFIG.region} --format='value(state)' --project=${CONFIG.projectId}`,
      { silent: true }
    ).trim();

    if (functionStatus === 'ACTIVE') {
      log.success(`Function status: ${functionStatus}`);
    } else {
      log.warn(`Function status: ${functionStatus}`);
    }
  } catch (e) {
    log.warn('Could not verify function status');
  }

  // Check scheduler status
  try {
    const schedulerStatus = exec(
      `gcloud scheduler jobs describe ${CONFIG.schedulerJobName} --location=${CONFIG.region} --format='value(state)' --project=${CONFIG.projectId}`,
      { silent: true }
    ).trim();

    if (schedulerStatus === 'ENABLED') {
      log.success(`Scheduler status: ${schedulerStatus}`);
    } else {
      log.warn(`Scheduler status: ${schedulerStatus}`);
    }
  } catch (e) {
    log.warn('Could not verify scheduler status');
  }

  return true;
}

// ============================================================================
// MAIN
// ============================================================================

export interface DeployOutreachOptions {
  dryRun?: boolean;
}

export async function deployOutreach(options: DeployOutreachOptions = {}): Promise<boolean> {
  const { dryRun = false } = options;

  console.log(`
${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║                  OUTREACH SYSTEM DEPLOYMENT                     ║
║                                                                  ║
║  "Better Than Human" - Proactive Check-ins & Celebrations        ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
`);

  if (dryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
  }

  // Pre-flight checks
  if (!checkCommand('gcloud')) {
    log.error('gcloud CLI not found. Please install the Google Cloud SDK.');
    return false;
  }

  log.info(`Project: ${CONFIG.projectId}`);
  log.info(`Region: ${CONFIG.region}`);
  log.info(`Function: ${CONFIG.functionName}`);
  log.info(`Scheduler: ${CONFIG.schedulerJobName} (${CONFIG.schedule})`);

  try {
    // Step 1: Ensure Pub/Sub topic
    await ensurePubSubTopic(dryRun);

    // Step 2: Deploy Cloud Function
    await deployCloudFunction(dryRun);

    // Step 3: Create/Update Cloud Scheduler
    await createOrUpdateScheduler(dryRun);

    // Step 4: Verify deployment
    await verifyDeployment(dryRun);

    console.log(`
${colors.green}${colors.bold}════════════════════════════════════════════════════════════════
✓ Outreach system deployment ${dryRun ? 'preview' : 'complete'}!

${dryRun ? 'Run without --dry-run to deploy.' : `The outreach scheduler will now run every 15 minutes,
checking for users who need proactive check-ins.

To manually trigger: gcloud scheduler jobs run ${CONFIG.schedulerJobName} --location=${CONFIG.region}`}
════════════════════════════════════════════════════════════════${colors.reset}
`);

    return true;
  } catch (error) {
    log.error(`Deployment failed: ${error}`);
    return false;
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  deployOutreach({ dryRun }).then((success) => {
    process.exit(success ? 0 : 1);
  });
}
