#!/usr/bin/env npx tsx
/**
 * Setup Cloud Monitoring Alerts
 *
 * Creates free Cloud Monitoring alert policies for auto-scaling.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/setup/setup-alerts.ts
 *   ferni setup alerts
 *
 * Environment:
 *   GOOGLE_CLOUD_PROJECT - GCP project ID (or uses gcloud default)
 *   ALERT_EMAIL - Email for notifications (default: user@gmail.com)
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

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

function getProjectId(): string {
  let projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    projectId = exec('gcloud config get-value project 2>/dev/null', { silent: true }).trim();
  }
  return projectId;
}

export async function setupAlerts(): Promise<boolean> {
  const projectId = getProjectId();
  const email = process.env.ALERT_EMAIL || `${process.env.USER}@gmail.com`;

  console.log(`${colors.cyan}🔔 Setting up free Cloud Monitoring alerts for ${projectId}${colors.reset}`);
  console.log(`${colors.blue}📧 Notifications will go to: ${email}${colors.reset}\n`);

  // Create notification channel (email - FREE)
  console.log('Creating email notification channel...');
  let channelId = exec(
    `gcloud alpha monitoring channels create \
      --display-name="Ferni Alerts" \
      --type=email \
      --channel-labels=email_address="${email}" \
      --format="value(name)" 2>/dev/null || echo ""`,
    { silent: true }
  ).trim();

  if (!channelId) {
    console.log(`${colors.yellow}⚠️  Could not create channel (may already exist). Looking up existing...${colors.reset}`);
    channelId = exec(
      `gcloud alpha monitoring channels list \
        --filter="displayName='Ferni Alerts'" \
        --format="value(name)" 2>/dev/null | head -1`,
      { silent: true }
    ).trim();
  }

  console.log(`Channel ID: ${channelId || 'not found'}\n`);

  // Alert 1: High error rate (>5% of requests failing)
  console.log('Creating high error rate alert...');
  try {
    exec(
      `gcloud alpha monitoring policies create \
        --display-name="Ferni: High Error Rate" \
        --condition-display-name="Error rate > 5%" \
        --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class!="2xx"' \
        --condition-threshold-value=0.05 \
        --condition-threshold-comparison=COMPARISON_GT \
        --condition-threshold-duration=300s \
        --condition-threshold-aggregation-alignment-period=60s \
        --condition-threshold-aggregation-per-series-aligner=ALIGN_RATE \
        ${channelId ? `--notification-channels="${channelId}"` : ''} \
        --documentation="Error rate exceeded 5% - check logs at https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22;timeRange=PT1H?project=${projectId}"`,
      { silent: true }
    );
    console.log(`${colors.green}✅ Error rate alert created${colors.reset}`);
  } catch {
    console.log(`${colors.yellow}⚠️  Error alert may already exist${colors.reset}`);
  }

  // Alert 2: High latency (p99 > 5s)
  console.log('Creating high latency alert...');
  try {
    exec(
      `gcloud alpha monitoring policies create \
        --display-name="Ferni: High Latency" \
        --condition-display-name="p99 latency > 5s" \
        --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_latencies"' \
        --condition-threshold-value=5000 \
        --condition-threshold-comparison=COMPARISON_GT \
        --condition-threshold-duration=300s \
        --condition-threshold-aggregation-alignment-period=60s \
        --condition-threshold-aggregation-per-series-aligner=ALIGN_PERCENTILE_99 \
        ${channelId ? `--notification-channels="${channelId}"` : ''} \
        --documentation="Response times are slow. Consider scaling up min-instances."`,
      { silent: true }
    );
    console.log(`${colors.green}✅ Latency alert created${colors.reset}`);
  } catch {
    console.log(`${colors.yellow}⚠️  Latency alert may already exist${colors.reset}`);
  }

  // Alert 3: Hitting max instances (near capacity)
  console.log('Creating capacity warning alert...');
  try {
    exec(
      `gcloud alpha monitoring policies create \
        --display-name="Ferni: Near Capacity" \
        --condition-display-name="Instance count > 80" \
        --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/instance_count"' \
        --condition-threshold-value=80 \
        --condition-threshold-comparison=COMPARISON_GT \
        --condition-threshold-duration=300s \
        --condition-threshold-aggregation-alignment-period=60s \
        --condition-threshold-aggregation-per-series-aligner=ALIGN_MAX \
        ${channelId ? `--notification-channels="${channelId}"` : ''} \
        --documentation="Running at 80% capacity. Consider increasing max-instances."`,
      { silent: true }
    );
    console.log(`${colors.green}✅ Capacity alert created${colors.reset}`);
  } catch {
    console.log(`${colors.yellow}⚠️  Capacity alert may already exist${colors.reset}`);
  }

  console.log(`
${colors.green}✅ Alert setup complete!${colors.reset}

📊 View alerts: https://console.cloud.google.com/monitoring/alerting?project=${projectId}
📧 You'll receive emails at: ${email}

💡 To change email, run: ALERT_EMAIL=you@example.com ferni setup alerts
`);

  return true;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  setupAlerts()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      process.exit(1);
    });
}
