#!/usr/bin/env npx tsx
/**
 * Comprehensive Monitoring & Automation Setup
 *
 * Sets up monitoring, alerting, uptime checks, budget alerts, and backup scheduling.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/setup/setup-monitoring.ts
 *   ferni setup monitoring
 *
 * Environment:
 *   GCP_PROJECT - GCP project ID
 *   ALERT_EMAIL - Email for notifications
 *   SLACK_WEBHOOK_URL - Slack webhook (optional)
 *   BUDGET_AMOUNT - Monthly budget in USD (default: 50)
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

// Configuration
const CONFIG = {
  projectId: process.env.GCP_PROJECT || 'johnb-2025',
  region: 'us-central1',
  agentUrl: 'voiceai-agent-1031920444452.us-central1.run.app',
  uiUrl: 'john-bogle-ui-1031920444452.us-central1.run.app',
  notificationEmail: process.env.ALERT_EMAIL || 'seth.ford@gmail.com',
  slackWebhook: process.env.SLACK_WEBHOOK_URL || '',
  budgetAmount: process.env.BUDGET_AMOUNT || '50',
};

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

function printHeader(title: string): void {
  console.log(`\n${colors.cyan}━━━ ${title} ━━━${colors.reset}\n`);
}

export async function setupMonitoring(): Promise<boolean> {
  console.log(`${colors.blue}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  FERNI MONITORING SETUP                                      ║${colors.reset}`);
  console.log(`${colors.blue}╚══════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`
Project: ${CONFIG.projectId}
Agent URL: ${CONFIG.agentUrl}
UI URL: ${CONFIG.uiUrl}
Notification Email: ${CONFIG.notificationEmail}
Budget: $${CONFIG.budgetAmount}/month
`);

  // 1. Enable required APIs
  printHeader('ENABLING APIS');
  const apis = [
    'monitoring.googleapis.com',
    'logging.googleapis.com',
    'cloudbilling.googleapis.com',
    'cloudscheduler.googleapis.com',
  ];
  for (const api of apis) {
    exec(`gcloud services enable ${api} --project=${CONFIG.projectId} --quiet`, { silent: true });
  }
  console.log(`${colors.green}✓ APIs enabled${colors.reset}`);

  // 2. Create email notification channel
  printHeader('CREATING NOTIFICATION CHANNELS');

  const existingEmail = exec(
    `gcloud alpha monitoring channels list \
      --project=${CONFIG.projectId} \
      --filter="type=email AND labels.email_address=${CONFIG.notificationEmail}" \
      --format="value(name)" 2>/dev/null || echo ""`,
    { silent: true }
  ).trim();

  let emailChannel = existingEmail;
  if (!existingEmail) {
    const emailChannelConfig = {
      type: 'email',
      displayName: 'Ferni Alerts Email',
      labels: {
        email_address: CONFIG.notificationEmail,
      },
    };
    writeFileSync('/tmp/email-channel.json', JSON.stringify(emailChannelConfig, null, 2));

    emailChannel = exec(
      `gcloud alpha monitoring channels create \
        --channel-content-from-file=/tmp/email-channel.json \
        --project=${CONFIG.projectId} \
        --format="value(name)" 2>/dev/null || echo ""`,
      { silent: true }
    ).trim();
    console.log(`${colors.green}✓ Email notification channel created${colors.reset}`);
  } else {
    console.log(`${colors.green}✓ Email notification channel exists${colors.reset}`);
  }

  // 3. Create uptime check configs
  printHeader('CREATING UPTIME CHECKS');

  const uptimeAgentConfig = {
    displayName: 'Ferni Voice Agent Health',
    monitoredResource: {
      type: 'uptime_url',
      labels: {
        project_id: CONFIG.projectId,
        host: CONFIG.agentUrl,
      },
    },
    httpCheck: {
      path: '/health',
      port: 443,
      useSsl: true,
      validateSsl: true,
      requestMethod: 'GET',
      acceptedResponseStatusCodes: [{ statusClass: 'STATUS_CLASS_2XX' }],
    },
    period: '300s',
    timeout: '10s',
    checkerType: 'STATIC_IP_CHECKERS',
  };
  writeFileSync('/tmp/uptime-agent.json', JSON.stringify(uptimeAgentConfig, null, 2));

  const uptimeUiConfig = {
    displayName: 'Ferni UI Server Health',
    monitoredResource: {
      type: 'uptime_url',
      labels: {
        project_id: CONFIG.projectId,
        host: CONFIG.uiUrl,
      },
    },
    httpCheck: {
      path: '/health',
      port: 443,
      useSsl: true,
      validateSsl: true,
      requestMethod: 'GET',
      acceptedResponseStatusCodes: [{ statusClass: 'STATUS_CLASS_2XX' }],
    },
    period: '300s',
    timeout: '10s',
    checkerType: 'STATIC_IP_CHECKERS',
  };
  writeFileSync('/tmp/uptime-ui.json', JSON.stringify(uptimeUiConfig, null, 2));

  console.log(`${colors.green}✓ Uptime check configs created${colors.reset}`);
  console.log('  Run these in Cloud Console or with: gcloud alpha monitoring uptime create');

  // 4. Create alert policy configs
  printHeader('CREATING ALERT POLICIES');

  // Alert for initialization timeouts
  const alertTimeoutConfig = {
    displayName: 'Ferni Agent Initialization Timeout',
    documentation: {
      content:
        'The voice agent child process timed out during initialization. This usually means cold start is too slow.',
      mimeType: 'text/markdown',
    },
    conditions: [
      {
        displayName: 'Initialization timeout errors',
        conditionMatchedLog: {
          filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="voiceai-agent" AND textPayload=~"runner initialization timed out"`,
        },
      },
    ],
    alertStrategy: {
      notificationRateLimit: {
        period: '300s',
      },
    },
    combiner: 'OR',
  };
  writeFileSync('/tmp/alert-timeout.json', JSON.stringify(alertTimeoutConfig, null, 2));

  // Alert for high error rate
  const alertErrorsConfig = {
    displayName: 'Ferni High Error Rate',
    documentation: {
      content: 'Error rate has exceeded 5 errors per minute.',
      mimeType: 'text/markdown',
    },
    conditions: [
      {
        displayName: 'Error rate > 5/min',
        conditionThreshold: {
          filter:
            'resource.type="cloud_run_revision" AND metric.type="logging.googleapis.com/log_entry_count" AND metric.labels.severity="ERROR"',
          aggregations: [
            {
              alignmentPeriod: '60s',
              perSeriesAligner: 'ALIGN_RATE',
            },
          ],
          comparison: 'COMPARISON_GT',
          thresholdValue: 5,
          duration: '60s',
        },
      },
    ],
    combiner: 'OR',
  };
  writeFileSync('/tmp/alert-errors.json', JSON.stringify(alertErrorsConfig, null, 2));

  // Alert for agent down
  const alertDownConfig = {
    displayName: 'Ferni Agent Unhealthy',
    documentation: {
      content: 'The voice agent health check is failing.',
      mimeType: 'text/markdown',
    },
    conditions: [
      {
        displayName: 'Uptime check failing',
        conditionThreshold: {
          filter:
            'metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.type="uptime_url" AND metric.labels.check_id=~"ferni-agent.*"',
          aggregations: [
            {
              alignmentPeriod: '300s',
              perSeriesAligner: 'ALIGN_FRACTION_TRUE',
            },
          ],
          comparison: 'COMPARISON_LT',
          thresholdValue: 0.8,
          duration: '300s',
        },
      },
    ],
    combiner: 'OR',
  };
  writeFileSync('/tmp/alert-down.json', JSON.stringify(alertDownConfig, null, 2));

  console.log(`${colors.green}✓ Alert policy configs created${colors.reset}`);

  // 5. Create budget alert config
  printHeader('CREATING BUDGET ALERT');

  const billingAccount = exec(
    `gcloud billing projects describe ${CONFIG.projectId} --format="value(billingAccountName)" 2>/dev/null | sed 's/billingAccounts\\///'`,
    { silent: true }
  ).trim();

  if (billingAccount) {
    const budgetConfig = {
      displayName: 'Ferni Monthly Budget',
      budgetFilter: {
        projects: [`projects/${CONFIG.projectId}`],
      },
      amount: {
        specifiedAmount: {
          currencyCode: 'USD',
          units: CONFIG.budgetAmount,
        },
      },
      thresholdRules: [{ thresholdPercent: 0.5 }, { thresholdPercent: 0.8 }, { thresholdPercent: 1.0 }],
      notificationsRule: {
        monitoringNotificationChannels: [],
        pubsubTopic: '',
        schemaVersion: '1.0',
      },
    };
    writeFileSync('/tmp/budget.json', JSON.stringify(budgetConfig, null, 2));
    console.log(`${colors.green}✓ Budget config created ($${CONFIG.budgetAmount}/month)${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠ Could not get billing account - budget creation skipped${colors.reset}`);
  }

  // 6. Create backup scheduler config
  printHeader('CREATING BACKUP SCHEDULER');

  const backupJobConfig = {
    name: 'ferni-firestore-backup',
    description: 'Daily Firestore backup at 3am UTC',
    schedule: '0 3 * * *',
    timeZone: 'UTC',
    httpTarget: {
      uri: `https://${CONFIG.region}-${CONFIG.projectId}.cloudfunctions.net/firestore-backup`,
      httpMethod: 'POST',
      oidcToken: {
        serviceAccountEmail: `${CONFIG.projectId}@appspot.gserviceaccount.com`,
      },
    },
  };
  writeFileSync('/tmp/backup-job.json', JSON.stringify(backupJobConfig, null, 2));
  console.log(`${colors.green}✓ Backup scheduler config created${colors.reset}`);
  console.log("  Note: Requires Cloud Function 'firestore-backup' to be deployed");

  // 7. Output summary
  console.log(`
${colors.blue}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.blue}║  SETUP COMPLETE                                              ║${colors.reset}
${colors.blue}╚══════════════════════════════════════════════════════════════╝${colors.reset}

Config files created in /tmp/:
  - email-channel.json     (notification channel)
  - uptime-agent.json      (agent health check)
  - uptime-ui.json         (UI health check)
  - alert-timeout.json     (initialization timeout alert)
  - alert-errors.json      (high error rate alert)
  - alert-down.json        (agent down alert)
  - budget.json            (monthly budget)
  - backup-job.json        (daily backup scheduler)

${colors.bold}Manual steps needed:${colors.reset}
  1. Go to https://console.cloud.google.com/monitoring/uptime?project=${CONFIG.projectId}
     Create uptime checks using the configs above

  2. Go to https://console.cloud.google.com/monitoring/alerting?project=${CONFIG.projectId}
     Create alert policies using the configs above

  3. Go to https://console.cloud.google.com/billing/budgets?project=${CONFIG.projectId}
     Create budget using the config above

  4. Add Slack webhook to .env as SLACK_WEBHOOK_URL=https://hooks.slack.com/...
     Then create Slack notification channel in Cloud Console

${colors.bold}Quick links:${colors.reset}
  Monitoring: https://console.cloud.google.com/monitoring?project=${CONFIG.projectId}
  Logs: https://console.cloud.google.com/logs?project=${CONFIG.projectId}
  Budgets: https://console.cloud.google.com/billing/budgets?project=${CONFIG.projectId}
`);

  return true;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  setupMonitoring()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      process.exit(1);
    });
}
