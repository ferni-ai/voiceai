#!/usr/bin/env npx tsx

/**
 * Semantic Data Store Production Deployment Script
 *
 * Automates the full deployment and backfill process:
 * 1. Deploy code changes
 * 2. Verify health endpoints
 * 3. Run dry-run backfill
 * 4. Execute actual backfill (with confirmation)
 * 5. Run TTL cleanup
 * 6. Verify final health
 *
 * Usage:
 *   npx tsx scripts/deploy-semantic-store.ts [options]
 *
 * Options:
 *   --skip-deploy      Skip code deployment (if already deployed)
 *   --skip-backfill    Skip backfill step
 *   --dry-run          Show what would happen without executing
 *   --batch-size <n>   Batch size for backfill (default: 50)
 *   --domain <name>    Only backfill specific domain
 *   --force            Skip confirmation prompts
 *   --rollback         Disable semantic indexing (emergency)
 *
 * @module scripts/deploy-semantic-store
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as readline from 'readline';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  healthEndpoint: 'https://app.ferni.ai/api/semantic-store/health',
  metricsEndpoint: 'https://app.ferni.ai/api/semantic-store/metrics',
  cleanupEndpoint: 'https://app.ferni.ai/api/semantic-store/cleanup',
  localHealthEndpoint: 'http://localhost:3002/api/semantic-store/health',
  maxRetries: 5,
  retryDelayMs: 5000,
  backfillBatchSize: 50,
};

// ============================================================================
// UTILITIES
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: number, total: number, message: string): void {
  log(`\n[${ step }/${ total }] ${message}`, colors.cyan);
  log('─'.repeat(60), colors.cyan);
}

function logSuccess(message: string): void {
  log(`✅ ${message}`, colors.green);
}

function logWarning(message: string): void {
  log(`⚠️  ${message}`, colors.yellow);
}

function logError(message: string): void {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message: string): void {
  log(`ℹ️  ${message}`, colors.blue);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${message} (y/N): ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; silent?: boolean } = {}
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      shell: true,
      stdio: options.silent ? 'pipe' : 'inherit',
    });

    let output = '';

    if (options.silent) {
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      proc.stderr?.on('data', (data) => {
        output += data.toString();
      });
    }

    proc.on('close', (code) => {
      resolve({ success: code === 0, output });
    });

    proc.on('error', (err) => {
      resolve({ success: false, output: err.message });
    });
  });
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = CONFIG.maxRetries
): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000),
      });
      return response;
    } catch (error) {
      if (i < retries - 1) {
        logWarning(`Request failed, retrying in ${CONFIG.retryDelayMs / 1000}s... (${i + 1}/${retries})`);
        await sleep(CONFIG.retryDelayMs);
      }
    }
  }
  return null;
}

// ============================================================================
// DEPLOYMENT STEPS
// ============================================================================

interface DeployOptions {
  skipDeploy: boolean;
  skipBackfill: boolean;
  dryRun: boolean;
  batchSize: number;
  domain?: string;
  force: boolean;
  rollback: boolean;
}

async function checkPrerequisites(skipDeploy: boolean): Promise<boolean> {
  log('\n🔍 Checking prerequisites...', colors.cyan);

  // Check if we're in the right directory
  const { success: hasPackageJson } = await runCommand('test', ['-f', 'package.json'], { silent: true });
  if (!hasPackageJson) {
    logError('Not in project root. Run from /Users/sethford/Documents/voiceai');
    return false;
  }

  // Check if ferni CLI is available (only required if not skipping deploy)
  if (!skipDeploy) {
    const { success: hasFerni } = await runCommand('which', ['ferni'], { silent: true });
    if (!hasFerni) {
      logWarning('Ferni CLI not found. Will use npm scripts instead.');
      logInfo('To install: cd /Users/sethford/Documents/voiceai && npm link');
    }
  }

  logSuccess('Prerequisites check passed');
  return true;
}

async function deployCode(dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    logInfo('DRY RUN: Would deploy voice agent and UI server');
    return true;
  }

  // Check if ferni CLI is available
  const { success: hasFerni } = await runCommand('which', ['ferni'], { silent: true });

  if (hasFerni) {
    log('\n🚀 Deploying voice agent (via Ferni CLI)...', colors.blue);
    const { success: agentSuccess } = await runCommand('ferni', ['deploy', 'gce']);
    if (!agentSuccess) {
      logWarning('Voice agent deployment had issues - continuing...');
    }

    log('\n🚀 Deploying UI server (via Ferni CLI)...', colors.blue);
    const { success: uiSuccess } = await runCommand('ferni', ['deploy', 'ui']);
    if (!uiSuccess) {
      logWarning('UI server deployment had issues - continuing...');
    }
  } else {
    // Fallback to npm scripts
    log('\n🚀 Deploying voice agent (via npm)...', colors.blue);
    const { success: agentSuccess } = await runCommand('pnpm', ['deploy:agent']);
    if (!agentSuccess) {
      logWarning('Voice agent deployment had issues - continuing...');
    }

    log('\n🚀 Deploying UI server (via npm)...', colors.blue);
    const { success: uiSuccess } = await runCommand('pnpm', ['deploy:ui:async']);
    if (!uiSuccess) {
      logWarning('UI server deployment had issues - continuing...');
    }
  }

  // Wait for deployments to stabilize
  log('\n⏳ Waiting for deployments to stabilize (60s)...', colors.yellow);
  await sleep(60000);

  return true;
}

async function verifyHealth(endpoint: string): Promise<{ healthy: boolean; data: unknown }> {
  const response = await fetchWithRetry(endpoint);

  if (!response || !response.ok) {
    return { healthy: false, data: null };
  }

  try {
    const data = await response.json();
    const healthy = data.status === 'healthy' || data.healthy === true;
    return { healthy, data };
  } catch {
    return { healthy: false, data: null };
  }
}

async function runBackfillDryRun(domain?: string): Promise<{ estimatedDocs: number; domains: string[] }> {
  log('\n📊 Running backfill dry run...', colors.blue);

  const args = ['scripts/backfill-semantic-index.ts', '--dry-run'];
  if (domain) {
    args.push('--domain', domain);
  }

  const { success, output } = await runCommand('npx', ['tsx', ...args], { silent: true });

  if (!success) {
    logWarning('Dry run had issues - check backfill script');
    return { estimatedDocs: 0, domains: [] };
  }

  // Parse output for estimates
  const docMatch = output.match(/Total documents: (\d+)/);
  const domainsMatch = output.match(/Domains: (.+)/);

  return {
    estimatedDocs: docMatch ? parseInt(docMatch[1], 10) : 0,
    domains: domainsMatch ? domainsMatch[1].split(',').map((d) => d.trim()) : [],
  };
}

async function runBackfill(options: DeployOptions): Promise<boolean> {
  if (options.dryRun) {
    const estimate = await runBackfillDryRun(options.domain);
    logInfo(`DRY RUN: Would backfill ~${estimate.estimatedDocs} documents`);
    return true;
  }

  // First do a dry run to show estimates
  const estimate = await runBackfillDryRun(options.domain);

  log('\n📊 Backfill Estimate:', colors.cyan);
  log(`   Documents: ~${estimate.estimatedDocs}`, colors.reset);
  log(`   Est. Cost: ~$${((estimate.estimatedDocs / 1000) * 0.0001).toFixed(4)}`, colors.reset);
  log(`   Est. Time: ~${Math.ceil(estimate.estimatedDocs / options.batchSize / 2)} minutes`, colors.reset);

  if (!options.force) {
    const proceed = await confirm('Proceed with backfill?');
    if (!proceed) {
      logWarning('Backfill skipped by user');
      return true;
    }
  }

  log('\n📥 Running backfill...', colors.blue);

  const args = ['scripts/backfill-semantic-index.ts', '--batch', String(options.batchSize)];
  if (options.domain) {
    args.push('--domain', options.domain);
  }

  const { success } = await runCommand('npx', ['tsx', ...args]);

  if (success) {
    logSuccess('Backfill completed');
  } else {
    logError('Backfill had errors - check logs');
  }

  return success;
}

async function runTTLCleanup(endpoint: string, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    logInfo('DRY RUN: Would run TTL cleanup');
    return true;
  }

  log('\n🧹 Running TTL cleanup...', colors.blue);

  // First do dry run
  const dryRunResponse = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun: true }),
  });

  if (dryRunResponse?.ok) {
    const dryRunData = await dryRunResponse.json();
    log(`   Would clean: ${dryRunData.totalDocsDeleted || 0} documents`, colors.reset);
  }

  // Run actual cleanup
  const response = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun: false }),
  });

  if (response?.ok) {
    const data = await response.json();
    logSuccess(`Cleaned ${data.totalDocsDeleted || 0} expired documents`);
    return true;
  }

  logWarning('TTL cleanup request failed - will run on next startup');
  return true; // Not critical
}

async function enableRollback(): Promise<void> {
  logWarning('🚨 ROLLBACK MODE - Disabling semantic indexing');

  log('\nTo disable semantic indexing, set this env var on your deployments:', colors.yellow);
  log('   DISABLE_SEMANTIC_INDEXING=true', colors.reset);

  log('\nFor voice agent (GCE):', colors.cyan);
  log('   1. SSH to VM: gcloud compute ssh voiceai-agent --zone=us-central1-a', colors.reset);
  log('   2. Edit env: docker exec -it <container> sh -c "export DISABLE_SEMANTIC_INDEXING=true"', colors.reset);
  log('   3. Or redeploy with env flag', colors.reset);

  log('\nFor UI server (Cloud Run):', colors.cyan);
  log('   gcloud run services update john-bogle-ui --update-env-vars=DISABLE_SEMANTIC_INDEXING=true --region=us-central1', colors.reset);

  log('\nTo re-enable:', colors.green);
  log('   Remove the DISABLE_SEMANTIC_INDEXING env var and redeploy', colors.reset);
}

async function printFinalReport(healthData: unknown): Promise<void> {
  log('\n' + '═'.repeat(60), colors.green);
  log('📋 DEPLOYMENT COMPLETE', colors.green);
  log('═'.repeat(60), colors.green);

  if (healthData && typeof healthData === 'object') {
    const data = healthData as Record<string, unknown>;
    log('\n📊 Current Status:', colors.cyan);
    log(`   Health: ${data.status || 'unknown'}`, colors.reset);

    if (data.metrics && typeof data.metrics === 'object') {
      const metrics = data.metrics as Record<string, number>;
      log(`   Indexed: ${metrics.indexedCount || 0} documents`, colors.reset);
      log(`   Errors: ${metrics.errorCount || 0}`, colors.reset);
    }
  }

  log('\n📡 Monitoring:', colors.cyan);
  log(`   Health: ${CONFIG.healthEndpoint}`, colors.reset);
  log(`   Metrics: ${CONFIG.metricsEndpoint}`, colors.reset);
  log(`   Logs: pnpm ops:logs | grep semantic`, colors.reset);

  log('\n🔧 Manual Operations:', colors.cyan);
  log('   Trigger cleanup: curl -X POST ' + CONFIG.cleanupEndpoint, colors.reset);
  log('   Re-run backfill: npx tsx scripts/backfill-semantic-index.ts', colors.reset);

  log('\n' + '═'.repeat(60), colors.green);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const options: DeployOptions = {
    skipDeploy: args.includes('--skip-deploy'),
    skipBackfill: args.includes('--skip-backfill'),
    dryRun: args.includes('--dry-run'),
    batchSize: CONFIG.backfillBatchSize,
    domain: undefined,
    force: args.includes('--force'),
    rollback: args.includes('--rollback'),
  };

  // Parse batch size
  const batchIdx = args.indexOf('--batch-size');
  if (batchIdx !== -1 && args[batchIdx + 1]) {
    options.batchSize = parseInt(args[batchIdx + 1], 10);
  }

  // Parse domain
  const domainIdx = args.indexOf('--domain');
  if (domainIdx !== -1 && args[domainIdx + 1]) {
    options.domain = args[domainIdx + 1];
  }

  // Print header
  log('\n' + '═'.repeat(60), colors.bright);
  log('🚀 SEMANTIC DATA STORE DEPLOYMENT', colors.bright);
  log('═'.repeat(60), colors.bright);

  if (options.dryRun) {
    logWarning('DRY RUN MODE - No changes will be made');
  }

  // Handle rollback mode
  if (options.rollback) {
    await enableRollback();
    return;
  }

  const totalSteps = 6;
  let currentStep = 0;

  // Step 1: Prerequisites
  logStep(++currentStep, totalSteps, 'Checking prerequisites');
  const prereqOk = await checkPrerequisites(options.skipDeploy);
  if (!prereqOk) {
    process.exit(1);
  }

  // Step 2: Deploy code
  if (!options.skipDeploy) {
    logStep(++currentStep, totalSteps, 'Deploying code changes');
    if (!options.force && !options.dryRun) {
      const proceed = await confirm('Deploy code changes now?');
      if (!proceed) {
        logWarning('Deployment skipped - use --skip-deploy to skip this step');
        options.skipDeploy = true;
      }
    }
    if (!options.skipDeploy) {
      await deployCode(options.dryRun);
    }
  } else {
    logStep(++currentStep, totalSteps, 'Skipping code deployment (--skip-deploy)');
  }

  // Step 3: Verify health
  logStep(++currentStep, totalSteps, 'Verifying health endpoints');
  const { healthy, data: healthData } = await verifyHealth(CONFIG.healthEndpoint);
  if (healthy) {
    logSuccess('Health check passed');
  } else {
    logWarning('Health check failed - endpoint may not be deployed yet');
    if (!options.force) {
      const proceed = await confirm('Continue anyway?');
      if (!proceed) {
        logError('Deployment aborted');
        process.exit(1);
      }
    }
  }

  // Step 4: Backfill
  if (!options.skipBackfill) {
    logStep(++currentStep, totalSteps, 'Running data backfill');
    await runBackfill(options);
  } else {
    logStep(++currentStep, totalSteps, 'Skipping backfill (--skip-backfill)');
  }

  // Step 5: TTL Cleanup
  logStep(++currentStep, totalSteps, 'Running TTL cleanup');
  await runTTLCleanup(CONFIG.cleanupEndpoint, options.dryRun);

  // Step 6: Final verification
  logStep(++currentStep, totalSteps, 'Final health verification');
  const { healthy: finalHealthy, data: finalHealthData } = await verifyHealth(CONFIG.healthEndpoint);
  if (finalHealthy) {
    logSuccess('Final health check passed');
  } else {
    logWarning('Final health check inconclusive');
  }

  // Print report
  await printFinalReport(finalHealthData || healthData);
}

main().catch((error) => {
  logError(`Deployment failed: ${error.message}`);
  process.exit(1);
});
