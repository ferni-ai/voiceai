#!/usr/bin/env npx tsx
/**
 * Ferni Health Check Script
 *
 * Checks health of all services and optionally sends alerts to Slack.
 *
 * Usage:
 *   npx tsx scripts/health-check.ts           # Check all services
 *   npx tsx scripts/health-check.ts --alert   # Check and alert on failures
 *
 * Environment:
 *   SLACK_WEBHOOK_URL - Slack webhook for alerts (optional)
 */

import { config } from 'dotenv';
config();

const SERVICES = [
  {
    name: 'Voice Agent',
    url: 'https://voiceai-agent-1031920444452.us-central1.run.app/health',
    critical: true,
  },
  {
    name: 'UI Server',
    url: 'https://john-bogle-ui-1031920444452.us-central1.run.app/health',
    critical: true,
  },
  {
    name: 'Token Server',
    url: 'https://john-bogle-ui-1031920444452.us-central1.run.app/token',
    critical: false,
    method: 'POST',
    expectStatus: 400, // Expected without proper params
  },
];

interface HealthResult {
  name: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  statusCode?: number;
  responseTime: number;
  error?: string;
  critical: boolean;
}

async function checkService(service: (typeof SERVICES)[0]): Promise<HealthResult> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(service.url, {
      method: service.method || 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    const expectedStatus = service.expectStatus || 200;
    const isHealthy = response.status === expectedStatus;

    return {
      name: service.name,
      url: service.url,
      status: isHealthy ? 'healthy' : 'unhealthy',
      statusCode: response.status,
      responseTime,
      critical: service.critical,
    };
  } catch (error) {
    return {
      name: service.name,
      url: service.url,
      status: 'unhealthy',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      critical: service.critical,
    };
  }
}

async function sendSlackAlert(results: HealthResult[]): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('⚠️  SLACK_WEBHOOK_URL not set, skipping alert');
    return;
  }

  const failures = results.filter((r) => r.status !== 'healthy');
  if (failures.length === 0) return;

  const criticalFailures = failures.filter((r) => r.critical);
  const emoji = criticalFailures.length > 0 ? '🚨' : '⚠️';

  // On-brand messaging - warm, human, direct
  const criticalMsg = criticalFailures.length > 0
    ? "Hey, I need your attention right now."
    : "Just a heads up - something's not quite right.";

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${criticalMsg}*`,
      },
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `${failures.length} service${failures.length > 1 ? 's need' : ' needs'} attention • ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PT`,
      }],
    },
    { type: 'divider' },
    ...failures.map((f) => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${f.name}*${f.critical ? ' _(this one matters most)_' : ''}\n` +
              `Response: ${f.statusCode || 'No response'} • ${f.responseTime}ms\n` +
              `${f.error ? `Issue: ${f.error}` : ''}`,
      },
    })),
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `_Run \`npm run ops:health\` locally to check again_`,
      }],
    },
  ];

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    console.log('✓ Slack alert sent');
  } catch (error) {
    console.error('✗ Failed to send Slack alert:', error);
  }
}

async function main(): Promise<void> {
  const shouldAlert = process.argv.includes('--alert');

  console.log('');
  console.log('  ✦ Ferni Health Check');
  console.log('  ─────────────────────────────────────────');
  console.log(`  ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} PT`);
  console.log('');
  console.log('');

  const results = await Promise.all(SERVICES.map(checkService));

  let hasFailures = false;
  let hasCriticalFailures = false;

  for (const result of results) {
    const icon = result.status === 'healthy' ? '✓' : '✗';
    const statusText = result.status.toUpperCase();
    const criticalTag = result.critical ? ' [CRITICAL]' : '';

    console.log(`${icon} ${result.name}${criticalTag}`);
    console.log(`  Status: ${result.statusCode || 'N/A'} (${statusText})`);
    console.log(`  Response: ${result.responseTime}ms`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    console.log('');

    if (result.status !== 'healthy') {
      hasFailures = true;
      if (result.critical) hasCriticalFailures = true;
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (hasFailures) {
    console.log(`❌ ${hasCriticalFailures ? 'CRITICAL: ' : ''}Some services are unhealthy`);

    if (shouldAlert) {
      await sendSlackAlert(results);
    }

    process.exit(hasCriticalFailures ? 2 : 1);
  } else {
    console.log('✅ All services healthy');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Health check failed:', error);
  process.exit(1);
});
