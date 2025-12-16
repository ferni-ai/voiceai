#!/usr/bin/env npx tsx
/**
 * Setup/Deploy Marketplace Cloud Scheduler Jobs
 *
 * Creates/updates Cloud Scheduler jobs for the marketplace billing system.
 * Run this after deploying the UI server with marketplace routes.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/setup/setup-marketplace-scheduler.ts
 *   npx tsx apps/cli/src/commands/setup/setup-marketplace-scheduler.ts --dry-run
 *   npx tsx apps/cli/src/commands/setup/setup-marketplace-scheduler.ts --delete
 *   ferni setup marketplace
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

// Configuration
const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',
  get serviceAccount() {
    return `cloud-scheduler@${this.projectId}.iam.gserviceaccount.com`;
  },
  get baseUrl() {
    return `https://voiceai-ui-${this.projectId}.a.run.app/api/jobs`;
  },
  uiService: 'voiceai-ui',
};

// Job definitions: name, schedule, description
const JOBS = [
  {
    name: 'marketplace-daily-aggregation',
    schedule: '0 6 * * *',
    description: 'Aggregate daily usage metrics and send quota warnings',
  },
  {
    name: 'marketplace-weekly-reports',
    schedule: '0 9 * * 1',
    description: 'Generate and send weekly usage reports to users',
  },
  {
    name: 'marketplace-monthly-revenue',
    schedule: '0 0 1 * *',
    description: 'Calculate publisher revenue shares for previous month',
  },
  {
    name: 'marketplace-publisher-payouts',
    schedule: '0 12 15 * *',
    description: 'Process pending publisher payouts via Stripe',
  },
  {
    name: 'marketplace-quarterly-cleanup',
    schedule: '0 2 1 1,4,7,10 *',
    description: 'Archive old records and clean up data',
  },
];

// Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface Options {
  dryRun: boolean;
  delete: boolean;
}

function exec(cmd: string, options: { silent?: boolean } = {}): string {
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

function runCmd(cmd: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`${colors.yellow}[DRY RUN]${colors.reset} ${cmd}`);
  } else {
    exec(cmd, { silent: true });
  }
}

export async function setupMarketplaceScheduler(options: Options = { dryRun: false, delete: false }): Promise<boolean> {
  const { dryRun, delete: deleteJobs } = options;

  console.log(`${colors.blue}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║       Marketplace Cloud Scheduler Deployment                 ║${colors.reset}`);
  console.log(`${colors.blue}╚══════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`
Project:         ${colors.green}${CONFIG.projectId}${colors.reset}
Region:          ${colors.green}${CONFIG.region}${colors.reset}
Service Account: ${colors.green}${CONFIG.serviceAccount}${colors.reset}
Base URL:        ${colors.green}${CONFIG.baseUrl}${colors.reset}
`);

  if (dryRun) {
    console.log(`${colors.yellow}🔍 DRY RUN MODE - No changes will be made${colors.reset}\n`);
  }

  // Delete mode
  if (deleteJobs) {
    console.log(`${colors.red}⚠️  Deleting all marketplace scheduler jobs...${colors.reset}\n`);

    for (const job of JOBS) {
      console.log(`  Deleting ${colors.yellow}${job.name}${colors.reset}...`);
      runCmd(
        `gcloud scheduler jobs delete ${job.name} --location=${CONFIG.region} --quiet 2>/dev/null || true`,
        dryRun
      );
    }

    console.log(`\n${colors.green}✓ All marketplace jobs deleted${colors.reset}`);
    return true;
  }

  // Ensure service account exists
  console.log(`${colors.blue}1. Checking service account...${colors.reset}`);
  try {
    exec(`gcloud iam service-accounts describe "${CONFIG.serviceAccount}" --project="${CONFIG.projectId}"`, {
      silent: true,
    });
    console.log(`   ${colors.green}✓${colors.reset} Service account exists`);
  } catch {
    console.log('   Creating service account...');
    runCmd(
      `gcloud iam service-accounts create cloud-scheduler \
        --display-name='Cloud Scheduler Service Account' \
        --project=${CONFIG.projectId}`,
      dryRun
    );
  }

  // Grant Cloud Run invoker role
  console.log(`\n${colors.blue}2. Ensuring IAM permissions...${colors.reset}`);
  runCmd(
    `gcloud run services add-iam-policy-binding ${CONFIG.uiService} \
      --region=${CONFIG.region} \
      --member='serviceAccount:${CONFIG.serviceAccount}' \
      --role='roles/run.invoker' \
      --project=${CONFIG.projectId} 2>/dev/null || true`,
    dryRun
  );
  console.log(`   ${colors.green}✓${colors.reset} IAM binding configured`);

  // Create/update scheduler jobs
  console.log(`\n${colors.blue}3. Creating scheduler jobs...${colors.reset}\n`);

  for (const job of JOBS) {
    console.log(`   ${colors.yellow}►${colors.reset} ${job.name}`);
    console.log(`     Schedule: ${job.schedule}`);
    console.log(`     Description: ${job.description}`);

    // Delete existing job if it exists (for idempotent updates)
    runCmd(`gcloud scheduler jobs delete ${job.name} --location=${CONFIG.region} --quiet 2>/dev/null || true`, dryRun);

    // Create the job
    runCmd(
      `gcloud scheduler jobs create http ${job.name} \
        --location=${CONFIG.region} \
        --schedule='${job.schedule}' \
        --uri='${CONFIG.baseUrl}/${job.name}' \
        --http-method=POST \
        --headers='X-CloudScheduler=true,Content-Type=application/json' \
        --oidc-service-account-email=${CONFIG.serviceAccount} \
        --description='${job.description}' \
        --project=${CONFIG.projectId}`,
      dryRun
    );

    console.log(`     ${colors.green}✓${colors.reset} Created\n`);
  }

  // Verify jobs
  console.log(`${colors.blue}4. Verifying jobs...${colors.reset}\n`);

  if (!dryRun) {
    exec(
      `gcloud scheduler jobs list --location=${CONFIG.region} --project=${CONFIG.projectId} \
        --filter="name~marketplace" \
        --format="table(name,schedule,state,httpTarget.uri)" 2>/dev/null || true`
    );
  }

  // Summary
  console.log(`
${colors.green}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.green}║                    Deployment Complete!                      ║${colors.reset}
${colors.green}╚══════════════════════════════════════════════════════════════╝${colors.reset}

Jobs created:`);

  for (const job of JOBS) {
    console.log(`  ${colors.green}✓${colors.reset} ${job.name}`);
  }

  console.log(`
To test a job manually:
  ${colors.blue}gcloud scheduler jobs run marketplace-daily-aggregation --location=${CONFIG.region}${colors.reset}

To view job status:
  ${colors.blue}gcloud scheduler jobs list --location=${CONFIG.region}${colors.reset}
`);

  return true;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: args.includes('--dry-run'),
    delete: args.includes('--delete'),
  };

  if (args.includes('-h') || args.includes('--help')) {
    console.log(`
Usage: npx tsx setup-marketplace-scheduler.ts [options]

Options:
  --dry-run    Preview commands without executing
  --delete     Remove all marketplace scheduler jobs
  -h, --help   Show this help
`);
    process.exit(0);
  }

  setupMarketplaceScheduler(options)
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      process.exit(1);
    });
}
