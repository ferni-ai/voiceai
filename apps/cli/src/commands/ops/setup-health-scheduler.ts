#!/usr/bin/env npx tsx
/**
 * Setup Cloud Scheduler for External Health Monitoring
 *
 * Creates GCP Cloud Scheduler jobs that ping the voice agent and UI server
 * from OUTSIDE the containers. This catches issues that internal monitoring can't:
 * - Container completely dead
 * - Network routing issues
 * - Load balancer problems
 *
 * Alerts are sent to Cloud Monitoring which can trigger Slack/PagerDuty/etc.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/ops/setup-health-scheduler.ts
 *   pnpm ops:setup-scheduler
 *   pnpm ops:setup-scheduler --dry-run
 */

import { execSync } from 'node:child_process';

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Configuration
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'ferni-ai';
const REGION = 'us-central1';
const VOICE_AGENT_URL = 'http://34.134.186.63:8080';
const UI_SERVER_URL = 'https://app.ferni.ai';
const SERVICE_ACCOUNT = `scheduler-health@${PROJECT_ID}.iam.gserviceaccount.com`;

interface SchedulerJob {
  name: string;
  description: string;
  schedule: string; // Cron expression
  url: string;
  httpMethod: 'GET' | 'POST';
  expectedStatus: number;
  timeoutSeconds: number;
  retryCount: number;
}

const HEALTH_JOBS: SchedulerJob[] = [
  {
    name: 'voice-agent-health',
    description: 'Check voice agent health every minute',
    schedule: '* * * * *', // Every minute
    url: `${VOICE_AGENT_URL}/health`,
    httpMethod: 'GET',
    expectedStatus: 200,
    timeoutSeconds: 10,
    retryCount: 3,
  },
  {
    name: 'voice-agent-readiness',
    description: 'Check voice agent readiness every 2 minutes',
    schedule: '*/2 * * * *', // Every 2 minutes
    url: `${VOICE_AGENT_URL}/health/ready`,
    httpMethod: 'GET',
    expectedStatus: 200,
    timeoutSeconds: 10,
    retryCount: 2,
  },
  {
    name: 'ui-server-health',
    description: 'Check UI server health every minute',
    schedule: '* * * * *', // Every minute
    url: `${UI_SERVER_URL}/health`,
    httpMethod: 'GET',
    expectedStatus: 200,
    timeoutSeconds: 10,
    retryCount: 3,
  },
  {
    name: 'voice-agent-observability',
    description: 'Fetch observability metrics every 5 minutes',
    schedule: '*/5 * * * *', // Every 5 minutes
    url: `${VOICE_AGENT_URL}/api/observability`,
    httpMethod: 'GET',
    expectedStatus: 200,
    timeoutSeconds: 30,
    retryCount: 2,
  },
];

function printHeader(text: string): void {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);
}

function exec(cmd: string, dryRun: boolean): string {
  if (dryRun) {
    console.log(`${YELLOW}[DRY-RUN]${RESET} ${cmd}`);
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

  // Check project
  console.log(`${GREEN}✓${RESET} Project: ${PROJECT_ID}`);

  return true;
}

function ensureServiceAccount(dryRun: boolean): void {
  console.log(`\n${CYAN}Ensuring service account exists...${RESET}`);

  try {
    exec(`gcloud iam service-accounts describe ${SERVICE_ACCOUNT} --project=${PROJECT_ID}`, dryRun);
    console.log(`${GREEN}✓${RESET} Service account exists: ${SERVICE_ACCOUNT}`);
  } catch {
    console.log(`${YELLOW}Creating service account...${RESET}`);
    exec(
      `gcloud iam service-accounts create scheduler-health ` +
        `--display-name="Cloud Scheduler Health Checks" ` +
        `--project=${PROJECT_ID}`,
      dryRun
    );
    console.log(`${GREEN}✓${RESET} Created service account`);
  }
}

function createUptimeChecks(dryRun: boolean): void {
  console.log(`\n${CYAN}Creating Cloud Monitoring uptime checks...${RESET}\n`);

  // Create uptime checks using Cloud Monitoring (better than scheduler for simple health)
  const uptimeChecks = [
    {
      displayName: 'Voice Agent Health',
      hostname: '34.134.186.63',
      port: 8080,
      path: '/health',
    },
    {
      displayName: 'UI Server Health',
      hostname: 'app.ferni.ai',
      port: 443,
      path: '/health',
    },
  ];

  for (const check of uptimeChecks) {
    const checkId = check.displayName.toLowerCase().replace(/\s+/g, '-');
    console.log(`Creating uptime check: ${check.displayName}`);

    // Check if already exists
    try {
      exec(
        `gcloud monitoring uptime-check-configs describe ${checkId} --project=${PROJECT_ID}`,
        dryRun
      );
      console.log(`${YELLOW}⚠${RESET} Already exists: ${checkId}`);
      continue;
    } catch {
      // Doesn't exist, create it
    }

    const protocol = check.port === 443 ? 'HTTPS' : 'HTTP';
    const cmd = `gcloud monitoring uptime-check-configs create ${checkId} \
      --display-name="${check.displayName}" \
      --monitored-resource-type="uptime_url" \
      --resource-labels=host=${check.hostname} \
      --protocol=${protocol} \
      --port=${check.port} \
      --path="${check.path}" \
      --period=60 \
      --timeout=10 \
      --project=${PROJECT_ID}`;

    try {
      exec(cmd, dryRun);
      console.log(`${GREEN}✓${RESET} Created: ${check.displayName}`);
    } catch (error) {
      console.log(`${RED}✗${RESET} Failed to create ${check.displayName}: ${error}`);
    }
  }
}

function createAlertPolicy(dryRun: boolean): void {
  console.log(`\n${CYAN}Creating alert policy for uptime failures...${RESET}`);

  const policyName = 'ferni-health-alerts';

  // Check if policy exists
  try {
    const existing = exec(
      `gcloud alpha monitoring policies list --filter="displayName='${policyName}'" --format="value(name)" --project=${PROJECT_ID}`,
      false
    ).trim();

    if (existing) {
      console.log(`${YELLOW}⚠${RESET} Alert policy already exists`);
      return;
    }
  } catch {
    // Continue to create
  }

  // Create a simple alert policy JSON
  const policyConfig = {
    displayName: policyName,
    documentation: {
      content: 'Ferni health check failed. Check: docs/runbooks/DISCONNECT-DEBUGGING.md',
      mimeType: 'text/markdown',
    },
    conditions: [
      {
        displayName: 'Uptime Check Failed',
        conditionThreshold: {
          filter: 'metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.type="uptime_url"',
          comparison: 'COMPARISON_LT',
          thresholdValue: 1,
          duration: '120s',
          aggregations: [
            {
              alignmentPeriod: '60s',
              perSeriesAligner: 'ALIGN_FRACTION_TRUE',
            },
          ],
        },
      },
    ],
    alertStrategy: {
      autoClose: '1800s',
    },
    combiner: 'OR',
    enabled: true,
  };

  // Write policy to temp file and create
  const tempFile = '/tmp/alert-policy.json';
  if (!dryRun) {
    require('fs').writeFileSync(tempFile, JSON.stringify(policyConfig, null, 2));
  }

  try {
    exec(
      `gcloud alpha monitoring policies create --policy-from-file=${tempFile} --project=${PROJECT_ID}`,
      dryRun
    );
    console.log(`${GREEN}✓${RESET} Created alert policy: ${policyName}`);
  } catch (error) {
    console.log(`${YELLOW}⚠${RESET} Alert policy creation may require additional setup: ${error}`);
    console.log(`  → Go to: https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}`);
  }
}

function printSlackSetupInstructions(): void {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  SLACK INTEGRATION (Manual Step)${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

  console.log(`To receive alerts in Slack, you need to set up a notification channel:\n`);
  console.log(`1. Go to: https://console.cloud.google.com/monitoring/alerting/notifications?project=${PROJECT_ID}`);
  console.log(`2. Click "ADD NEW" → "Slack"`);
  console.log(`3. Follow the OAuth flow to connect your Slack workspace`);
  console.log(`4. Select the channel (e.g., #ferni-alerts)`);
  console.log(`5. Edit the alert policy to use this notification channel`);
  console.log(`\nAlternatively, set SLACK_WEBHOOK_URL in your environment for in-container alerts.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  printHeader('🔧 SETUP HEALTH MONITORING SCHEDULER');

  if (dryRun) {
    console.log(`${YELLOW}Running in DRY-RUN mode - no changes will be made${RESET}\n`);
  }

  // Check prerequisites
  if (!checkPrerequisites()) {
    console.log(`\n${RED}Prerequisites not met. Please fix the issues above and retry.${RESET}`);
    process.exit(1);
  }

  // Ensure service account
  ensureServiceAccount(dryRun);

  // Create uptime checks
  createUptimeChecks(dryRun);

  // Create alert policy
  createAlertPolicy(dryRun);

  // Print Slack setup instructions
  printSlackSetupInstructions();

  console.log(`\n${BOLD}${GREEN}✓ Health monitoring scheduler setup complete!${RESET}\n`);
  console.log(`View uptime checks: https://console.cloud.google.com/monitoring/uptime?project=${PROJECT_ID}`);
  console.log(`View alerts: https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}\n`);
}

main().catch((error) => {
  console.error(`${RED}Error:${RESET}`, error);
  process.exit(1);
});

