#!/usr/bin/env npx tsx
/**
 * Unified Deployment Script
 *
 * RECOMMENDED: Use the Ferni CLI instead of calling this directly:
 *   ferni deploy            # Interactive menu
 *   ferni deploy agent      # Voice agent to LiveKit Cloud (dev; --prod for production)
 *   ferni deploy ui         # UI backend to Cloud Run
 *   ferni deploy frontend   # Frontend to Firebase
 *   ferni deploy all        # Deploy everything
 *
 * This script is called by the Ferni CLI - use `ferni deploy` for best experience.
 */

import { findProjectRoot } from '../../utils/project-root.js';
import {
  LIVEKIT_AGENTS,
  isLkInstalled,
  lkAgentArgs,
  parseAgentStatus,
  prepareAgentDockerfile,
  resolveAgentEnv,
  runLkAgent,
  type AgentEnv,
} from '../../utils/livekit-agent.js';
import { ChildProcess, execSync, spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { healthCheck, smokeTestFrontend } from './url-checks.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = findProjectRoot();

const CONFIG = {
  // GCP Settings
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',

  // Cloud Run services (the voice agent is on LiveKit Cloud, see deployAgent)
  services: {
    ui: process.env.UI_SERVICE_NAME || 'john-bogle-ui',
  },

  cloudbuildUi: 'cloudbuild-ui.yaml',
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

function checkCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getServiceUrl(serviceName: string): string {
  try {
    return exec(
      `gcloud run services describe ${serviceName} --region ${CONFIG.region} --format 'value(status.url)'`,
      { silent: true }
    ).trim();
  } catch {
    return '';
  }
}

// ============================================================================
// BLUE-GREEN DEPLOYMENT HELPERS
// ============================================================================

interface BlueGreenResult {
  success: boolean;
  revisionName?: string;
  revisionUrl?: string;
  error?: string;
}

/**
 * Get the URL for a specific revision tag (e.g., "green")
 */
function getRevisionUrlByTag(serviceName: string, tag: string): string {
  try {
    // Format: https://green---service-name-xxx-uc.a.run.app
    const baseUrl = getServiceUrl(serviceName);
    if (!baseUrl) return '';

    // Extract the domain parts and construct tagged URL
    const url = new URL(baseUrl);
    const host = url.host;
    const taggedHost = `${tag}---${host}`;
    return `https://${taggedHost}`;
  } catch {
    return '';
  }
}

/**
 * Get the latest revision name for a service
 */
function getLatestRevision(serviceName: string): string {
  try {
    return exec(
      `gcloud run revisions list --service=${serviceName} --region=${CONFIG.region} --limit=1 --format='value(name)'`,
      { silent: true }
    ).trim();
  } catch {
    return '';
  }
}

/**
 * Shift traffic to a specific revision (100%)
 */
function shiftTraffic(serviceName: string, revisionName: string): boolean {
  try {
    exec(
      `gcloud run services update-traffic ${serviceName} --region=${CONFIG.region} --to-revisions=${revisionName}=100 --quiet`,
      { silent: false }
    );
    return true;
  } catch (error) {
    log.error(`Failed to shift traffic: ${error}`);
    return false;
  }
}

/**
 * Remove a revision tag
 */
function removeTag(serviceName: string, tag: string): void {
  try {
    exec(
      `gcloud run services update-traffic ${serviceName} --region=${CONFIG.region} --remove-tags=${tag} --quiet`,
      { silent: true }
    );
  } catch {
    // Tag might not exist, ignore
  }
}

// ============================================================================
// DEPLOYMENT FUNCTIONS
// ============================================================================

interface DeployOptions {
  dryRun: boolean;
  skipBuild: boolean;
  verbose: boolean;
  async: boolean;
  skipGitCheck: boolean;
  agentEnv: AgentEnv;
}

// ============================================================================
// ASYNC DEPLOYMENT HELPERS
// ============================================================================

const LOGS_DIR = join(PROJECT_ROOT, '.deploy-logs');

function getLogFilePath(target: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(LOGS_DIR, `${target}-${timestamp}.log`);
}

function ensureLogsDir(): void {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function spawnAsync(cmd: string, logFile: string): ChildProcess {
  ensureLogsDir();
  const logStream = createWriteStream(logFile, { flags: 'a' });

  // Write header
  logStream.write(`\n${'='.repeat(60)}\n`);
  logStream.write(`Deployment started: ${new Date().toISOString()}\n`);
  logStream.write(`Command: ${cmd}\n`);
  logStream.write(`${'='.repeat(60)}\n\n`);

  const child = spawn('bash', ['-c', cmd], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  child.on('exit', (code) => {
    logStream.write(`\n${'='.repeat(60)}\n`);
    logStream.write(`Deployment finished: ${new Date().toISOString()}\n`);
    logStream.write(`Exit code: ${code}\n`);
    logStream.write(`${'='.repeat(60)}\n`);
    logStream.end();
  });

  child.unref();
  return child;
}

/**
 * The voice agent runs on LiveKit Cloud agents, never Cloud Run: Cloud Run has
 * no UDP, and a worker there steals jobs from the real agent (2026-02-24
 * outage). Production must be chosen with --prod, so a bare deploy hits dev.
 */
async function deployAgent(options: DeployOptions): Promise<boolean> {
  const target = LIVEKIT_AGENTS[options.agentEnv];
  log.step(`DEPLOYING VOICE AGENT TO LIVEKIT CLOUD (${target.project}, ${target.agentId})`);

  const deployCmd = `lk ${lkAgentArgs('deploy', target).join(' ')}`;
  if (options.dryRun) {
    log.info('Would copy docker/Dockerfile.agent to ./Dockerfile (lk builds ./Dockerfile)');
    log.info(`Would run: ${deployCmd}`);
    log.info(`Would check: lk ${lkAgentArgs('status', target).join(' ')}`);
    return true;
  }

  if (!isLkInstalled()) {
    log.error('The LiveKit CLI (lk) is required: brew install livekit-cli');
    return false;
  }
  if (options.async) {
    log.warn('--async is not supported for the agent; deploying in the foreground');
  }

  const dockerfile = prepareAgentDockerfile(PROJECT_ROOT);
  if (!dockerfile.ok) {
    log.error(dockerfile.reason);
    return false;
  }

  try {
    log.info(`Running: ${deployCmd}`);
    if (!runLkAgent(PROJECT_ROOT, 'deploy', target).ok) {
      log.error(
        `lk agent deploy failed. Logs: ferni logs agent${options.agentEnv === 'prod' ? '' : ' --dev'}`
      );
      return false;
    }
  } finally {
    if (dockerfile.created) rmSync(join(PROJECT_ROOT, 'Dockerfile'));
  }

  const status = parseAgentStatus(
    runLkAgent(PROJECT_ROOT, 'status', target, { capture: true }).output,
    target.agentId
  );
  log.success(`Agent ${target.agentId} status: ${status ?? 'unknown (run lk agent status)'}`);
  return true;
}

async function deployUi(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING FRONTEND UI (BLUE-GREEN)');

  if (options.dryRun) {
    log.info(`Would build: gcloud builds submit --config ${CONFIG.cloudbuildUi} .`);
    log.info(`Would deploy with --no-traffic --tag=green`);
    log.info(`Would health check green revision`);
    log.info(`Would shift 100% traffic if healthy`);
    return true;
  }

  const serviceName = CONFIG.services.ui;

  // Build the full command sequence
  const buildCmd = `gcloud builds submit --config ${CONFIG.cloudbuildUi} . --quiet`;

  // Deploy with --no-traffic and --tag=green for blue-green
  const deployCmd = [
    `gcloud run deploy ${serviceName}`,
    `--image gcr.io/${CONFIG.projectId}/${serviceName}:latest`,
    `--region ${CONFIG.region}`,
    '--platform managed',
    '--allow-unauthenticated',
    '--memory 512Mi',
    '--cpu 1',
    '--timeout 300',
    '--min-instances 0',
    '--max-instances 10',
    '--vpc-connector ferni-redis-connector',
    '--set-env-vars "^@^NODE_ENV=production@ALLOWED_ORIGINS=https://app.ferni.ai,https://ferni.ai,https://ferni-prod.web.app,https://developers.ferni.ai,https://marketplace.ferni.ai,https://www.ferni.ai@ALLOW_LEGACY_X_USER_ID_AUTH=true@TWILIO_STREAM_WEBHOOK_URL=wss://john-bogle-ui-bmopaivmsq-uc.a.run.app/stream"',
    '--set-secrets "LIVEKIT_URL=livekit-url:latest,LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest,GITHUB_MARKETPLACE_TOKEN=github-marketplace-token:latest,ADMIN_API_KEYS=admin-api-key:latest,ADMIN_KEY=admin-api-key:latest,LOG_HASH_SECRET=log-hash-secret:latest,EVALOPS_ADMIN_KEY=evalops-admin-key:latest,REDIS_URL=redis-url:latest,TWITTER_CLIENT_ID=twitter-client-id:latest,TWITTER_CLIENT_SECRET=twitter-client-secret:latest,LINKEDIN_CLIENT_ID=linkedin-client-id:latest,LINKEDIN_CLIENT_SECRET=linkedin-client-secret:latest,GOOGLE_CALENDAR_CLIENT_ID=google-calendar-client-id:latest,GOOGLE_CALENDAR_CLIENT_SECRET=google-calendar-client-secret:latest,TWILIO_ACCOUNT_SID=twilio-account-sid:latest,TWILIO_AUTH_TOKEN=twilio-auth-token:latest,TWILIO_PHONE_NUMBER=twilio-phone-number:latest,GOOGLE_API_KEY=google-api-key:latest,CARTESIA_API_KEY=cartesia-api-key:latest"',
    '--no-traffic', // Blue-green: deploy without receiving traffic
    '--tag green', // Tag for easy identification
    '--quiet',
  ].join(' ');

  if (options.async) {
    // Async mode: Build script that does full blue-green
    const logFile = getLogFilePath('ui');
    const blueGreenScript = `
      set -e
      echo "🔵 BLUE-GREEN DEPLOYMENT: ${serviceName}"
      echo ""
      echo "Step 1/4: Building container image..."
      ${buildCmd}

      echo ""
      echo "Step 2/4: Deploying to Cloud Run (no traffic)..."
      ${deployCmd}

      echo ""
      echo "Step 3/4: Health checking new revision..."
      REVISION=$(gcloud run revisions list --service=${serviceName} --region=${CONFIG.region} --limit=1 --format='value(name)')
      GREEN_URL="https://green---${serviceName}-1031920444452.${CONFIG.region}.run.app/health"

      MAX_RETRIES=10
      RETRY_DELAY=5

      for i in $(seq 1 $MAX_RETRIES); do
        echo "  Health check attempt $i/$MAX_RETRIES..."
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GREEN_URL" --max-time 10 || echo "000")

        if [ "$HTTP_CODE" = "200" ]; then
          echo "  ✅ Health check passed (HTTP $HTTP_CODE)"
          break
        fi

        if [ "$i" = "$MAX_RETRIES" ]; then
          echo "  ❌ Health check failed after $MAX_RETRIES attempts"
          echo "  Keeping traffic on previous revision"
          gcloud run services update-traffic ${serviceName} --region=${CONFIG.region} --remove-tags=green --quiet || true
          exit 1
        fi

        echo "  ⏳ Waiting \${RETRY_DELAY}s before retry (HTTP \$HTTP_CODE)..."
        sleep \$RETRY_DELAY
      done

      echo ""
      echo "Step 4/4: Shifting 100% traffic to new revision..."
      gcloud run services update-traffic ${serviceName} --region=${CONFIG.region} --to-revisions=$REVISION=100 --quiet

      echo ""
      echo "🟢 BLUE-GREEN DEPLOYMENT COMPLETE"
      echo "  Revision: $REVISION"
      echo "  URL: $(gcloud run services describe ${serviceName} --region=${CONFIG.region} --format='value(status.url)')"

      # Clean up green tag
      gcloud run services update-traffic ${serviceName} --region=${CONFIG.region} --remove-tags=green --quiet || true
    `;

    log.info('Starting async blue-green deployment...');
    spawnAsync(blueGreenScript, logFile);

    console.log(`
${colors.green}✓${colors.reset} Blue-green deployment started in background!

${colors.bold}What's happening:${colors.reset}
  1. Build container image
  2. Deploy new revision (no traffic)
  3. Health check new revision
  4. If healthy → shift 100% traffic
  5. If unhealthy → keep old version

${colors.bold}Monitor progress:${colors.reset}
  ${colors.cyan}tail -f ${logFile}${colors.reset}

${colors.bold}Or check Cloud Build:${colors.reset}
  ${colors.cyan}gcloud builds list --limit=1${colors.reset}
`);
    return true;
  }

  // Synchronous blue-green deployment
  log.info('Building container image...');
  exec(buildCmd);

  log.info('Deploying to Cloud Run (no traffic)...');
  exec(deployCmd);

  // Get the new revision name
  const newRevision = getLatestRevision(serviceName);
  if (!newRevision) {
    log.error('Failed to get new revision name');
    return false;
  }
  log.info(`New revision: ${newRevision}`);

  // Health check the green revision
  log.info('Health checking new revision...');
  const greenUrl = getRevisionUrlByTag(serviceName, 'green');
  const healthUrl = `${greenUrl}/health`;
  log.info(`Checking: ${healthUrl}`);

  const health = await healthCheck(healthUrl, { maxRetries: 10, retryDelay: 5000 });

  if (!health.healthy) {
    log.error(`Health check failed: ${health.error}`);
    log.warn('Keeping traffic on previous revision');
    removeTag(serviceName, 'green');
    return false;
  }

  log.success(`Health check passed (HTTP ${health.statusCode})`);

  // Shift 100% traffic to new revision
  log.info('Shifting 100% traffic to new revision...');
  if (!shiftTraffic(serviceName, newRevision)) {
    log.error('Failed to shift traffic');
    return false;
  }

  // Clean up green tag
  removeTag(serviceName, 'green');

  const url = getServiceUrl(serviceName);
  log.success(`Blue-green deployment complete: ${url}`);
  return true;
}

async function deployBrand(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING BRAND ASSETS');

  const bucketName = `ferni-brand-${CONFIG.projectId}`;

  if (options.dryRun) {
    log.info(`Would upload to: gs://${bucketName}/`);
    return true;
  }

  // First build the design system to ensure assets are up to date
  log.info('Building design system assets...');
  exec('npm run build:design-system');

  // Check if bucket exists
  try {
    exec(`gsutil ls gs://${bucketName}`, { silent: true });
  } catch {
    log.info('Creating bucket...');
    exec(`gsutil mb -l ${CONFIG.region} -p ${CONFIG.projectId} gs://${bucketName}`);
    exec(`gsutil web set -m brand-book.html gs://${bucketName}`);
    exec(`gsutil iam ch allUsers:objectViewer gs://${bucketName}`);
  }

  // Upload brand files
  log.info('Uploading brand assets...');
  exec(`gsutil -m cp design-system/docs/brand/*.html gs://${bucketName}/`);
  exec(`gsutil -m cp design-system/docs/brand/*.md gs://${bucketName}/`);
  exec(`gsutil -m cp design-system/dist/tokens.css gs://${bucketName}/`);
  exec(`gsutil -m cp -r design-system/assets/* gs://${bucketName}/assets/`);

  log.success(
    `Brand assets deployed to: https://storage.googleapis.com/${bucketName}/brand-book.html`
  );
  return true;
}

async function deployFrontend(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING FRONTEND TO FIREBASE HOSTING (BLUE-GREEN)');

  const frontendDir = join(PROJECT_ROOT, 'apps/web');

  if (!existsSync(frontendDir)) {
    log.warn('Frontend directory not found: apps/web');
    return false;
  }

  if (options.dryRun) {
    log.info('Would build frontend');
    log.info('Would deploy to preview channel');
    log.info('Would health check preview URL');
    log.info('Would browser smoke test preview URL');
    log.info('Would promote to live if healthy');
    return true;
  }

  // Build frontend first
  if (!options.skipBuild) {
    log.info('Building frontend...');
    exec(`cd ${frontendDir} && npm run build`);
  }

  // Step 1: Deploy to preview channel (blue-green)
  log.info('Step 1/3: Deploying to preview channel...');
  const channelId = `preview-${Date.now()}`;
  let previewUrl = '';

  try {
    const previewOutput = exec(
      `cd ${frontendDir} && firebase hosting:channel:deploy ${channelId} --only ferni-prod --project ${CONFIG.projectId} --json`,
      { silent: true }
    );
    const previewData = JSON.parse(previewOutput);
    previewUrl = previewData.result?.['ferni-prod']?.url || '';
    if (previewUrl) {
      log.success(`Preview deployed: ${previewUrl}`);
    }
  } catch {
    log.warn('Could not get preview URL, continuing with direct deploy');
  }

  // Step 2: Health check preview (if we got a URL)
  if (previewUrl) {
    const deletePreviewChannel = () => {
      log.info('Cleaning up preview channel...');
      try {
        exec(
          `cd ${frontendDir} && firebase hosting:channel:delete ${channelId} --force --project ${CONFIG.projectId}`,
          { silent: true }
        );
      } catch {
        // Ignore cleanup errors
      }
    };

    log.info('Step 2/3: Health checking preview...');
    const health = await healthCheck(previewUrl, { maxRetries: 5, retryDelay: 3000 });

    if (!health.healthy) {
      log.error(`Preview health check failed: ${health.error}`);
      deletePreviewChannel();
      return false;
    }
    log.success(`Preview health check passed (HTTP ${health.statusCode})`);

    log.info('Smoke testing preview in a browser...');
    if (!smokeTestFrontend(PROJECT_ROOT, previewUrl)) {
      log.error('Preview browser smoke test failed, not promoting');
      deletePreviewChannel();
      return false;
    }
    log.success('Preview browser smoke test passed');
  } else {
    log.info('Step 2/3: Skipping preview health check (no preview URL)');
  }

  // Step 3: Promote to live
  log.info('Step 3/3: Promoting to live...');
  exec(
    `cd ${frontendDir} && firebase deploy --only hosting:ferni-prod,hosting:johnb-app --project ${CONFIG.projectId}`
  );

  // Clean up preview channel
  if (previewUrl) {
    try {
      exec(
        `cd ${frontendDir} && firebase hosting:channel:delete ${channelId} --force --project ${CONFIG.projectId}`,
        { silent: true }
      );
    } catch {
      // Ignore cleanup errors
    }
  }

  log.success('Frontend deployed to:');
  log.success('  - https://ferni-prod.web.app');
  log.success('  - https://app.ferni.ai (johnb-2025)');
  return true;
}

/** The landing site. Never ferni-prod, which serves the app. */
const LANDING_SITE = 'ferni-landing';

async function deployLanding(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING LANDING PAGE (BLUE-GREEN)');

  const landingDir = join(PROJECT_ROOT, 'apps/website/ferni-website');

  if (!existsSync(landingDir)) {
    log.warn('Landing page directory not found: apps/website/ferni-website');
    return false;
  }

  if (options.dryRun) {
    log.info(`Would deploy to a preview channel of ${LANDING_SITE}`);
    log.info('Would health check preview URL');
    log.info(`Would promote to live: firebase deploy --only hosting:${LANDING_SITE}`);
    return true;
  }

  if (!options.skipBuild) {
    log.info('Building landing page...');
    exec(`cd ${landingDir} && pnpm run build:prod`);
  }

  // Try Firebase with blue-green
  if (checkCommand('firebase')) {
    // Step 1: Deploy to preview channel
    log.info('Step 1/3: Deploying to preview channel...');
    const channelId = `landing-preview-${Date.now()}`;
    let previewUrl = '';

    try {
      const previewOutput = exec(
        `cd ${landingDir} && firebase hosting:channel:deploy ${channelId} --only ${LANDING_SITE} --project ${CONFIG.projectId} --json`,
        { silent: true }
      );
      const previewData = JSON.parse(previewOutput);
      // Extract URL from the first site in the result
      const sites = previewData.result || {};
      const siteKeys = Object.keys(sites);
      if (siteKeys.length > 0) {
        previewUrl = sites[siteKeys[0]]?.url || '';
      }
      if (previewUrl) {
        log.success(`Preview deployed: ${previewUrl}`);
      }
    } catch {
      log.warn('Could not get preview URL, continuing with direct deploy');
    }

    // Step 2: Health check preview
    if (previewUrl) {
      log.info('Step 2/3: Health checking preview...');
      const health = await healthCheck(previewUrl, { maxRetries: 5, retryDelay: 3000 });

      if (!health.healthy) {
        log.error(`Preview health check failed: ${health.error}`);
        log.info('Cleaning up preview channel...');
        try {
          exec(`cd ${landingDir} && firebase hosting:channel:delete ${channelId} --site ${LANDING_SITE} --force --project ${CONFIG.projectId}`, { silent: true });
        } catch {
          // Ignore cleanup errors
        }
        return false;
      }
      log.success(`Preview health check passed (HTTP ${health.statusCode})`);
    } else {
      log.info('Step 2/3: Skipping preview health check (no preview URL)');
    }

    // Step 3: Promote to live
    log.info('Step 3/3: Promoting to live...');
    exec(
      `cd ${landingDir} && firebase deploy --only hosting:${LANDING_SITE} --project ${CONFIG.projectId}`
    );

    // Clean up preview channel
    if (previewUrl) {
      try {
        exec(`cd ${landingDir} && firebase hosting:channel:delete ${channelId} --site ${LANDING_SITE} --force --project ${CONFIG.projectId}`, { silent: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    log.success('Landing page deployed via Firebase (https://ferni.ai)');
  } else {
    // Fall back to Cloud Storage (no blue-green)
    log.warn('Firebase not available, using direct Cloud Storage deploy');
    const bucketName = `ferni-landing-${CONFIG.projectId}`;

    try {
      exec(`gsutil ls gs://${bucketName}`, { silent: true });
    } catch {
      log.info('Creating bucket...');
      exec(`gsutil mb -l ${CONFIG.region} gs://${bucketName}`);
      exec(`gsutil web set -m index.html gs://${bucketName}`);
      exec(`gsutil iam ch allUsers:objectViewer gs://${bucketName}`);
    }

    log.info('Uploading files...');
    exec(`gsutil -m cp -r ${landingDir}/* gs://${bucketName}/`);
    log.success(
      `Landing page deployed to: https://storage.googleapis.com/${bucketName}/index.html`
    );
  }

  return true;
}

async function deployEvolution(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING EVOLUTION SCHEDULER');

  if (options.dryRun) {
    log.info('Would deploy evolution scheduler Cloud Function');
    return true;
  }

  const functionsDir = join(PROJECT_ROOT, 'functions');

  if (!existsSync(functionsDir)) {
    log.error('Functions directory not found');
    return false;
  }

  // Install and build
  log.info('Installing dependencies...');
  exec('npm install', { cwd: functionsDir });

  log.info('Building TypeScript...');
  exec('npm run build', { cwd: functionsDir });

  // Create Pub/Sub topic
  log.info('Creating Pub/Sub topic...');
  exec(
    `gcloud pubsub topics create evolution-trigger --project=${CONFIG.projectId} 2>/dev/null || true`,
    { silent: true }
  );

  // Deploy Pub/Sub triggered function
  log.info('Deploying Cloud Function (Pub/Sub trigger)...');
  exec(
    [
      'gcloud functions deploy evolutionScheduler',
      '--runtime=nodejs20',
      '--trigger-topic=evolution-trigger',
      '--entry-point=evolutionScheduler',
      '--timeout=540s',
      '--memory=1GB',
      `--region=${CONFIG.region}`,
      `--project=${CONFIG.projectId}`,
      `--set-env-vars="GOOGLE_CLOUD_PROJECT=${CONFIG.projectId}"`,
      '--quiet',
    ].join(' \\\n  '),
    { cwd: functionsDir }
  );

  // Deploy HTTP triggered function
  log.info('Deploying Cloud Function (HTTP trigger)...');
  exec(
    [
      'gcloud functions deploy evolutionSchedulerHttp',
      '--runtime=nodejs20',
      '--trigger-http',
      '--entry-point=evolutionSchedulerHttp',
      '--timeout=540s',
      '--memory=1GB',
      `--region=${CONFIG.region}`,
      `--project=${CONFIG.projectId}`,
      '--allow-unauthenticated',
      `--set-env-vars="GOOGLE_CLOUD_PROJECT=${CONFIG.projectId}"`,
      '--quiet',
    ].join(' \\\n  '),
    { cwd: functionsDir }
  );

  // Create Cloud Scheduler job
  log.info('Creating Cloud Scheduler job...');
  exec(
    `gcloud scheduler jobs delete daily-evolution --location=${CONFIG.region} --quiet 2>/dev/null || true`,
    { silent: true }
  );
  exec(
    [
      'gcloud scheduler jobs create pubsub daily-evolution',
      '--schedule="0 3 * * *"',
      '--topic=evolution-trigger',
      '--message-body="{}"',
      '--time-zone="America/New_York"',
      `--location=${CONFIG.region}`,
      `--project=${CONFIG.projectId}`,
    ].join(' \\\n  ')
  );

  log.success('Evolution scheduler deployed');
  console.log(`
The system will now automatically:
  • Run daily at 3:00 AM ET
  • Process learning signals from all conversations
  • Make all personas smarter over time

Manual trigger:
  curl -X POST https://${CONFIG.region}-${CONFIG.projectId}.cloudfunctions.net/evolutionSchedulerHttp
`);

  return true;
}

async function deployAsync(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING ASYNC WORKERS (Outreach Processing)');

  if (options.dryRun) {
    log.info('Would build and deploy async workers to Cloud Run');
    log.info('Would configure Pub/Sub subscription');
    log.info('Would configure Cloud Scheduler');
    return true;
  }

  const asyncDir = join(PROJECT_ROOT, 'apps', 'async');

  if (!existsSync(asyncDir)) {
    log.error('Async workers not found at apps/async');
    return false;
  }

  // Typecheck + prebuild (daily-outreach bundle needs monorepo sources)
  log.info('Typechecking async workers...');
  try {
    exec('pnpm --dir apps/async typecheck', { silent: true });
    log.success('Typecheck passed');
  } catch {
    log.error('Typecheck failed - fix errors before deploying');
    return false;
  }

  log.info('Building async workers (includes daily-outreach bundle)...');
  try {
    exec('pnpm --dir apps/async build:fast');
    log.success('Async build complete');
  } catch {
    log.error('Async build failed - fix errors before deploying');
    return false;
  }

  // Submit Cloud Build — use custom _IMAGE_TAG (built-in COMMIT_SHA is empty on manual submit)
  const imageTag = exec('git rev-parse --short HEAD', { silent: true }).trim() || 'latest';
  log.info('Submitting Cloud Build...');
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(
      'gcloud',
      [
        'builds',
        'submit',
        'apps/async',
        `--config=${join(PROJECT_ROOT, 'cloudbuild-async.yaml')}`,
        `--project=${CONFIG.projectId}`,
        `--substitutions=_IMAGE_TAG=${imageTag}`,
      ],
      {
        cwd: PROJECT_ROOT,
        stdio: options.verbose ? 'inherit' : 'pipe',
      }
    );

    if (!options.verbose && child.stdout) {
      const logPath = join(PROJECT_ROOT, '.deploy-logs');
      if (!existsSync(logPath)) {
        mkdirSync(logPath, { recursive: true });
      }
      const logFile = createWriteStream(join(logPath, 'async.log'));
      child.stdout.pipe(logFile);
      child.stderr?.pipe(logFile);
    }

    child.on('exit', (code) => {
      if (code === 0) {
        log.success('Async workers deployed to Cloud Run!');
        log.success('Pub/Sub subscription configured');
        log.success('Cloud Scheduler configured');
        console.log(`
Async workers are now running:
  • Pub/Sub: outreach-triggers -> /process-trigger
  • Scheduler: Every 5 min -> /process-batch

Test with:
  curl https://ferni-async-xxx.run.app/health
`);
        resolve(true);
      } else {
        log.error(`Async workers deployment failed with code ${code}`);
        log.info('Check logs: .deploy-logs/async.log');
        resolve(false);
      }
    });

    child.on('error', (err) => {
      log.error(`Async workers deployment error: ${err.message}`);
      resolve(false);
    });
  });
}

async function deployIntelligence(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING INTELLIGENCE WORKER (Pattern Detection, Predictive Analytics)');

  if (options.dryRun) {
    log.info('Would build and deploy intelligence worker to Cloud Run');
    log.info('Would configure Pub/Sub subscription');
    return true;
  }

  const intelligenceDir = join(PROJECT_ROOT, 'apps', 'intelligence-worker');

  if (!existsSync(intelligenceDir)) {
    log.error('Intelligence worker not found at apps/intelligence-worker');
    return false;
  }

  // Typecheck before deploying
  log.info('Typechecking intelligence worker...');
  try {
    exec('pnpm typecheck', { cwd: intelligenceDir });
    log.success('Typecheck passed');
  } catch {
    log.error('Typecheck failed - fix errors before deploying');
    return false;
  }

  // Submit Cloud Build
  log.info('Submitting Cloud Build...');
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(
      'gcloud',
      [
        'builds',
        'submit',
        `--config=cloudbuild-intelligence.yaml`,
        `--project=${CONFIG.projectId}`,
      ],
      {
        cwd: PROJECT_ROOT,
        stdio: options.verbose ? 'inherit' : 'pipe',
      }
    );

    if (!options.verbose && child.stdout) {
      const logPath = join(PROJECT_ROOT, '.deploy-logs');
      if (!existsSync(logPath)) {
        mkdirSync(logPath, { recursive: true });
      }
      const logFile = createWriteStream(join(logPath, 'intelligence.log'));
      child.stdout.pipe(logFile);
      child.stderr?.pipe(logFile);
    }

    child.on('exit', (code) => {
      if (code === 0) {
        log.success('Intelligence worker deployed to Cloud Run!');
        log.success('Pub/Sub subscription configured');
        console.log(`
Intelligence worker is now running:
  • Pub/Sub: intelligence-events -> /pubsub/push
  • Handles: Pattern detection, Predictive intelligence, Key moments, Trust recording

Test with:
  gcloud pubsub topics publish intelligence-events --message='{"eventType":"test","payload":{}}'
`);
        resolve(true);
      } else {
        log.error(`Intelligence worker deployment failed with code ${code}`);
        log.info('Check logs: .deploy-logs/intelligence.log');
        resolve(false);
      }
    });

    child.on('error', (err) => {
      log.error(`Intelligence worker deployment error: ${err.message}`);
      resolve(false);
    });
  });
}

// ============================================================================
// PREFLIGHT CHECKS
// ============================================================================

function preflightChecks(options: DeployOptions): boolean {
  log.step('PREFLIGHT CHECKS');

  // Check for uncommitted changes (REQUIRED - no dirty deploys!)
  if (!options.skipGitCheck) {
    try {
      const gitStatus = exec('git status --porcelain', { silent: true }).trim();
      if (gitStatus) {
        log.error('Uncommitted changes detected! Commit your changes before deploying.');
        log.info('');
        log.info('Uncommitted files:');
        gitStatus
          .split('\n')
          .slice(0, 10)
          .forEach((line) => {
            log.info(`  ${line}`);
          });
        if (gitStatus.split('\n').length > 10) {
          log.info(`  ... and ${gitStatus.split('\n').length - 10} more`);
        }
        log.info('');
        log.info('To commit your changes:');
        log.info('  git add -A && git commit -m "your message"');
        log.info('');
        log.info('Or to bypass (not recommended):');
        log.info('  npm run deploy -- --skip-git-check <target>');
        return false;
      }
      log.success('Working directory clean');

      // Also check if we're ahead of remote
      try {
        exec('git fetch --quiet', { silent: true });
        const behindAhead = exec('git rev-list --left-right --count HEAD...@{upstream}', {
          silent: true,
        }).trim();
        const [behind, ahead] = behindAhead.split('\t').map(Number);
        if (ahead > 0) {
          log.warn(`${ahead} commit(s) not pushed. Consider: git push`);
        }
        if (behind > 0) {
          log.warn(`${behind} commit(s) behind remote. Consider: git pull`);
        }
      } catch {
        // No upstream or fetch failed - not critical
      }
    } catch {
      log.warn('Could not check git status');
    }
  } else {
    log.warn('Skipping git check (--skip-git-check)');
  }

  // Check gcloud
  if (!checkCommand('gcloud')) {
    log.error('gcloud CLI is required. Install from: https://cloud.google.com/sdk/docs/install');
    return false;
  }
  log.success('gcloud CLI installed');

  // Check authentication
  try {
    const account = exec('gcloud auth list --filter=status:ACTIVE --format="value(account)"', {
      silent: true,
    }).trim();
    if (!account) {
      log.error('Not authenticated. Run: gcloud auth login');
      return false;
    }
    log.success(`Authenticated as: ${account}`);
  } catch {
    log.error('Failed to check authentication');
    return false;
  }

  // Set project
  exec(`gcloud config set project ${CONFIG.projectId} --quiet`, { silent: true });
  log.success(`Project: ${CONFIG.projectId}`);

  // Check required secrets
  const requiredSecrets = [
    'google-api-key',
    'cartesia-api-key',
    'livekit-url',
    'livekit-api-key',
    'livekit-api-secret',
  ];
  let allSecretsPresent = true;

  log.info('Checking required secrets...');
  for (const secret of requiredSecrets) {
    try {
      exec(`gcloud secrets describe ${secret}`, { silent: true });
      log.success(`  ${secret}`);
    } catch {
      log.error(`  ${secret} - MISSING`);
      allSecretsPresent = false;
    }
  }

  if (!allSecretsPresent) {
    log.warn('Some secrets are missing. Deployment may fail.');
  }

  return true;
}

// ============================================================================
// CLI
// ============================================================================

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}FERNI DEPLOYMENT CLI${colors.reset}

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/deploy.ts <target> [options]
  npm run deploy <target> [options]

${colors.bold}Targets:${colors.reset}
  ${colors.green}ui${colors.reset}         Deploy UI backend to Cloud Run (APIs)
  ${colors.green}frontend${colors.reset}   Deploy frontend to Firebase Hosting (app.ferni.ai)
  ${colors.green}agent${colors.reset}      Deploy voice agent to LiveKit Cloud (dev agent; --prod for production)
  ${colors.green}brand${colors.reset}      Deploy brand assets to Cloud Storage
  ${colors.green}landing${colors.reset}    Deploy landing page (Firebase/Cloud Storage)
  ${colors.green}evolution${colors.reset}  Deploy evolution scheduler Cloud Function
  ${colors.green}workers${colors.reset}    Deploy async workers to Cloud Run (outreach processing)
  ${colors.green}all${colors.reset}        Deploy ui, frontend, landing (and the production agent with --prod)

${colors.bold}Options:${colors.reset}
  --async           Run deployment in background (don't wait for completion)
  --dry-run         Show what would be deployed without making changes
  --skip-build      Skip local build steps
  --skip-git-check  Allow deploy with uncommitted changes (not recommended)
  --verbose         Show detailed output
  --prod / --dev    Agent target: ferni-prod (livekit.prod-cloud.toml) or ferni-dev (livekit.toml, default)
  --help, -h        Show this help

${colors.bold}Safety:${colors.reset}
  All deploys require committed code. Uncommitted changes will be rejected.
  Cloud Run deploys are blue-green: health check before traffic shift.
  The agent deploy goes to ferni-dev unless --prod is given.

${colors.bold}Environment Variables:${colors.reset}
  GCP_PROJECT_ID    Google Cloud project (default: johnb-2025)
  GCP_REGION        Deployment region (default: us-central1)

${colors.bold}Examples:${colors.reset}
  npm run deploy ui              # Deploy UI (wait for completion)
  npm run deploy:ui:async        # Deploy UI in background (don't wait!)
  npm run deploy all             # Deploy everything
  npm run deploy -- --dry-run ui # Preview UI deployment
  npm run deploy -- --async ui   # Deploy UI async via flags
  ferni deploy agent --dry-run   # Preview a dev agent deploy
  ferni deploy agent --prod      # Deploy the production agent
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse options
  const options: DeployOptions = {
    dryRun: args.includes('--dry-run'),
    skipBuild: args.includes('--skip-build'),
    verbose: args.includes('--verbose'),
    async: args.includes('--async'),
    skipGitCheck: args.includes('--skip-git-check'),
    agentEnv: resolveAgentEnv(args, 'dev'),
  };

  // Get target (non-option argument)
  const targets = args.filter((arg) => !arg.startsWith('--') && !arg.startsWith('-'));

  if (targets.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const target = targets[0];

  // Banner
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI DEPLOYMENT${colors.reset}                                           ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  Target: ${colors.green}${target}${colors.reset}                                               ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  if (options.dryRun) {
    log.warn('DRY RUN - No changes will be made');
  }

  // Run preflight checks
  if (!options.dryRun && !preflightChecks(options)) {
    process.exit(1);
  }

  // Deploy based on target
  let success = true;

  switch (target) {
    case 'ui':
      success = await deployUi(options);
      break;

    case 'agent':
      success = await deployAgent(options);
      break;

    case 'brand':
      success = await deployBrand(options);
      break;

    case 'landing':
      success = await deployLanding(options);
      break;

    case 'frontend':
      success = await deployFrontend(options);
      break;

    case 'evolution':
      success = await deployEvolution(options);
      break;

    case 'async':
    case 'workers': // Legacy alias
      success = await deployAsync(options);
      break;

    case 'intelligence':
      success = await deployIntelligence(options);
      break;

    case 'all':
      if (options.agentEnv !== 'prod') {
        log.warn('Skipping the voice agent; add --prod to deploy the production agent too');
      }
      if (options.async) {
        // In async mode, start all deployments in parallel
        if (options.agentEnv === 'prod') await deployAgent(options);
        await deployUi(options);
        await deployFrontend(options);
        await deployLanding(options);
        log.info('All deployments started in background');
        success = true;
      } else {
        success =
          (options.agentEnv !== 'prod' || (await deployAgent(options))) &&
          (await deployUi(options)) &&
          (await deployFrontend(options)) &&
          (await deployLanding(options));
      }
      break;

    default:
      log.error(`Unknown target: ${target}`);
      printHelp();
      process.exit(1);
  }

  // Summary
  log.step('DEPLOYMENT COMPLETE');

  if (success) {
    log.success('All deployments successful!');
    console.log(`
${colors.bold}Services:${colors.reset}
  UI URL:      ${getServiceUrl(CONFIG.services.ui) || '(not deployed)'}
  Voice agent: LiveKit Cloud (ferni status agent)

${colors.bold}Next Steps:${colors.reset}
  • Test: curl <SERVICE_URL>/health
  • Logs: ferni logs ui, ferni logs agent
`);
  } else {
    log.error('Some deployments failed');
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Deployment failed: ${error.message}`);
  process.exit(1);
});
