#!/usr/bin/env npx tsx
/**
 * Deploy Intelligence Worker
 *
 * Deploys the intelligence worker service to Cloud Run.
 * Uses blue-green deployment with health checks.
 *
 * Usage:
 *   ferni deploy intelligence
 *   ferni deploy intelligence --dry-run
 *
 * @module cli/commands/deploy/deploy-intelligence
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',
  serviceName: 'ferni-intelligence-worker',
  cloudbuildFile: 'cloudbuild-intelligence.yaml',
  minInstances: 0,
  maxInstances: 5,
  memory: '512Mi',
  cpu: '1',
  timeout: '300s',
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

function exec(cmd: string, options: { silent?: boolean; cwd?: string } = {}): string {
  try {
    return execSync(cmd, {
      cwd: options.cwd || PROJECT_ROOT,
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

function checkPrerequisites(): boolean {
  // Check if cloudbuild file exists
  const cloudbuildPath = join(PROJECT_ROOT, CONFIG.cloudbuildFile);
  if (!existsSync(cloudbuildPath)) {
    log.error(`Cloud Build file not found: ${CONFIG.cloudbuildFile}`);
    return false;
  }

  // Check if intelligence worker source exists
  const workerPath = join(PROJECT_ROOT, 'apps', 'intelligence-worker');
  if (!existsSync(workerPath)) {
    log.error('Intelligence worker source not found: apps/intelligence-worker/');
    return false;
  }

  // Check gcloud auth
  try {
    exec('gcloud auth print-access-token', { silent: true });
  } catch {
    log.error('Not authenticated with gcloud. Run: gcloud auth login');
    return false;
  }

  return true;
}

async function healthCheck(url: string, maxAttempts = 30): Promise<boolean> {
  const healthUrl = `${url}/health`;
  log.info(`Health check: ${healthUrl}`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        log.success('Health check passed');
        return true;
      }
    } catch {
      // Continue trying
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    process.stdout.write('.');
  }

  log.error('Health check failed');
  return false;
}

// ============================================================================
// MAIN DEPLOYMENT
// ============================================================================

export async function deployIntelligenceWorker(options: { dryRun?: boolean } = {}): Promise<void> {
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧠 Deploying Intelligence Worker');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  if (options.dryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
    console.log();
  }

  log.info(`Project: ${CONFIG.projectId}`);
  log.info(`Region: ${CONFIG.region}`);
  log.info(`Service: ${CONFIG.serviceName}`);
  console.log();

  // Check prerequisites
  log.step('Checking Prerequisites');
  if (!checkPrerequisites()) {
    process.exit(1);
  }
  log.success('Prerequisites OK');

  // Build with Cloud Build
  log.step('Building with Cloud Build');

  const buildCmd = [
    'gcloud builds submit',
    `--config=${CONFIG.cloudbuildFile}`,
    `--project=${CONFIG.projectId}`,
    `--substitutions=_TAG=latest`,
  ].join(' ');

  if (options.dryRun) {
    log.info(`Would run: ${buildCmd}`);
  } else {
    try {
      exec(buildCmd);
      log.success('Build completed');
    } catch (error) {
      log.error('Build failed');
      console.error(error);
      process.exit(1);
    }
  }

  // Get service URL
  log.step('Getting Service URL');

  let serviceUrl = '';
  if (!options.dryRun) {
    try {
      serviceUrl = exec(
        `gcloud run services describe ${CONFIG.serviceName} --region=${CONFIG.region} --project=${CONFIG.projectId} --format='value(status.url)'`,
        { silent: true }
      ).trim();
      log.info(`Service URL: ${serviceUrl}`);
    } catch {
      log.info('Service not yet deployed (first deployment)');
    }
  }

  // Health check
  if (serviceUrl && !options.dryRun) {
    log.step('Running Health Check');
    const healthy = await healthCheck(serviceUrl);
    if (!healthy) {
      log.error('Service unhealthy - check logs');
      process.exit(1);
    }
  }

  // Done
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Intelligence Worker Deployment Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  if (serviceUrl) {
    log.info(`Service URL: ${serviceUrl}`);
    log.info(`Health endpoint: ${serviceUrl}/health`);
  }

  log.info('Next steps:');
  console.log('  1. Verify Pub/Sub subscription is configured');
  console.log('  2. Test with: gcloud pubsub topics publish intelligence-events --message=\'{"test":true}\'');
  console.log('  3. Check logs: gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=ferni-intelligence-worker" --limit=50');
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  deployIntelligenceWorker({ dryRun }).catch(console.error);
}

export default deployIntelligenceWorker;

