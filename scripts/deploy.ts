#!/usr/bin/env npx tsx
/**
 * Unified Deployment CLI
 *
 * Single entry point for all deployments.
 * Replaces: deploy-gcp.sh, deploy-ui.sh, deploy-all.sh, deploy-brand.sh
 *
 * Usage:
 *   npx tsx scripts/deploy.ts                # Show help
 *   npx tsx scripts/deploy.ts ui             # Deploy UI only
 *   npx tsx scripts/deploy.ts agent          # Deploy voice agent
 *   npx tsx scripts/deploy.ts all            # Deploy everything
 *   npx tsx scripts/deploy.ts brand          # Deploy brand assets
 *   npx tsx scripts/deploy.ts --dry-run ui   # Preview what would be deployed
 *
 * Or via npm:
 *   npm run deploy ui
 *   npm run deploy agent
 *   npm run deploy all
 */

import { ChildProcess, execSync, spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);

const CONFIG = {
  // GCP Settings
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',

  // Service names
  services: {
    agent: process.env.AGENT_SERVICE_NAME || 'voiceai-agent',
    ui: process.env.UI_SERVICE_NAME || 'john-bogle-ui',
  },

  // Build files
  cloudbuildAgent: 'cloudbuild.yaml',
  cloudbuildUi: 'cloudbuild-ui.yaml',

  // Persona
  personaId: process.env.PERSONA_ID || 'ferni',
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
// DEPLOYMENT FUNCTIONS
// ============================================================================

interface DeployOptions {
  dryRun: boolean;
  skipBuild: boolean;
  verbose: boolean;
  async: boolean;
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

async function deployAgent(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING VOICE AGENT');

  if (options.dryRun) {
    log.info(`Would build: gcloud builds submit --config ${CONFIG.cloudbuildAgent} .`);
    log.info(`Would deploy: gcloud run deploy ${CONFIG.services.agent} ...`);
    return true;
  }

  // Build secrets string
  const secrets = [
    'GOOGLE_API_KEY=google-api-key:latest',
    'CARTESIA_API_KEY=cartesia-api-key:latest',
    'LIVEKIT_URL=livekit-url:latest',
    'LIVEKIT_API_KEY=livekit-api-key:latest',
    'LIVEKIT_API_SECRET=livekit-api-secret:latest',
    // Security secrets (required in production)
    'ADMIN_KEY=admin-api-key:latest',
    'LOG_HASH_SECRET=log-hash-secret:latest',
    'EVALOPS_ADMIN_KEY=evalops-admin-key:latest',
  ];

  // Check for optional secrets (only in sync mode - async skips this)
  if (!options.async) {
    const optionalSecrets = [
      ['alpha-vantage-key', 'ALPHA_VANTAGE_API_KEY'],
      ['finnhub-api-key', 'FINNHUB_API_KEY'],
      ['sendgrid-api-key', 'SENDGRID_API_KEY'],
      ['fred-api-key', 'FRED_API_KEY'],
    ];

    for (const [secretName, envVar] of optionalSecrets) {
      try {
        exec(`gcloud secrets describe ${secretName}`, { silent: true });
        secrets.push(`${envVar}=${secretName}:latest`);
      } catch {
        // Secret doesn't exist, skip
      }
    }
  }

  const buildCmd = `gcloud builds submit --config ${CONFIG.cloudbuildAgent} . --quiet`;
  const deployCmd = [
    `gcloud run deploy ${CONFIG.services.agent}`,
    `--image gcr.io/${CONFIG.projectId}/bogle-voice-agent:latest`,
    `--region ${CONFIG.region}`,
    '--platform managed',
    '--allow-unauthenticated',
    '--memory 4Gi', // Increased for faster startup and better performance
    '--cpu 4', // Increased for faster startup
    '--cpu-boost', // Extra CPU during container startup
    '--timeout 3600',
    '--concurrency 1',
    '--min-instances 0', // Set to 1 for warm starts (costs ~$30/month)
    '--max-instances 20',
    `--set-env-vars "NODE_ENV=production,PERSONA_ID=${CONFIG.personaId},GOOGLE_CLOUD_PROJECT=${CONFIG.projectId}"`,
    `--set-secrets "${secrets.join(',')}"`,
    '--quiet',
  ].join(' ');

  if (options.async) {
    const logFile = getLogFilePath('agent');
    const fullCmd = `${buildCmd} && ${deployCmd}`;

    log.info('Starting async deployment...');
    spawnAsync(fullCmd, logFile);

    console.log(`
${colors.green}✓${colors.reset} Agent deployment started in background!

${colors.bold}Monitor progress:${colors.reset}
  ${colors.cyan}tail -f ${logFile}${colors.reset}

${colors.bold}Or check Cloud Build:${colors.reset}
  ${colors.cyan}gcloud builds list --limit=1${colors.reset}

${colors.bold}You'll see the deployment in:${colors.reset}
  ${colors.cyan}https://console.cloud.google.com/cloud-build/builds?project=${CONFIG.projectId}${colors.reset}
`);
    return true;
  }

  // Synchronous deployment (original behavior)
  log.info('Building container image...');
  exec(buildCmd);

  log.info('Deploying to Cloud Run...');
  exec(deployCmd);

  const url = getServiceUrl(CONFIG.services.agent);
  log.success(`Voice Agent deployed: ${url}`);
  return true;
}

async function deployUi(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING FRONTEND UI');

  if (options.dryRun) {
    log.info(`Would build: gcloud builds submit --config ${CONFIG.cloudbuildUi} .`);
    log.info(`Would deploy: gcloud run deploy ${CONFIG.services.ui} ...`);
    return true;
  }

  // Build the full command sequence
  const buildCmd = `gcloud builds submit --config ${CONFIG.cloudbuildUi} . --quiet`;
  const deployCmd = [
    `gcloud run deploy ${CONFIG.services.ui}`,
    `--image gcr.io/${CONFIG.projectId}/${CONFIG.services.ui}:latest`,
    `--region ${CONFIG.region}`,
    '--platform managed',
    '--allow-unauthenticated',
    '--memory 512Mi',
    '--cpu 1',
    '--timeout 300',
    '--min-instances 0',
    '--max-instances 10',
    '--set-env-vars "NODE_ENV=production"',
    '--set-secrets "LIVEKIT_URL=livekit-url:latest,LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest,GITHUB_MARKETPLACE_TOKEN=github-marketplace-token:latest,ADMIN_API_KEYS=admin-api-key:latest,ADMIN_KEY=admin-api-key:latest,LOG_HASH_SECRET=log-hash-secret:latest,EVALOPS_ADMIN_KEY=evalops-admin-key:latest"',
    '--quiet',
  ].join(' ');

  if (options.async) {
    const logFile = getLogFilePath('ui');
    const fullCmd = `${buildCmd} && ${deployCmd}`;

    log.info('Starting async deployment...');
    spawnAsync(fullCmd, logFile);

    console.log(`
${colors.green}✓${colors.reset} UI deployment started in background!

${colors.bold}Monitor progress:${colors.reset}
  ${colors.cyan}tail -f ${logFile}${colors.reset}

${colors.bold}Or check Cloud Build:${colors.reset}
  ${colors.cyan}gcloud builds list --limit=1${colors.reset}

${colors.bold}You'll see the deployment in:${colors.reset}
  ${colors.cyan}https://console.cloud.google.com/cloud-build/builds?project=${CONFIG.projectId}${colors.reset}
`);
    return true;
  }

  // Synchronous deployment (original behavior)
  log.info('Building container image...');
  exec(buildCmd);

  log.info('Deploying to Cloud Run...');
  exec(deployCmd);

  const url = getServiceUrl(CONFIG.services.ui);
  log.success(`Frontend UI deployed: ${url}`);
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
  exec(`gsutil -m cp design-system/brand/*.html gs://${bucketName}/`);
  exec(`gsutil -m cp design-system/brand/*.md gs://${bucketName}/`);
  exec(`gsutil -m cp design-system/dist/tokens.css gs://${bucketName}/`);
  exec(`gsutil -m cp -r design-system/assets/* gs://${bucketName}/assets/`);

  log.success(
    `Brand assets deployed to: https://storage.googleapis.com/${bucketName}/brand-book.html`
  );
  return true;
}

async function deployFrontend(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING FRONTEND TO FIREBASE HOSTING');

  const frontendDir = join(PROJECT_ROOT, 'frontend-typescript');

  if (!existsSync(frontendDir)) {
    log.warn('Frontend directory not found: frontend-typescript');
    return false;
  }

  if (options.dryRun) {
    log.info('Would deploy frontend to Firebase Hosting (ferni-prod + johnb-app)');
    return true;
  }

  // Build frontend first
  if (!options.skipBuild) {
    log.info('Building frontend...');
    exec(`cd ${frontendDir} && npm run build`);
  }

  // Deploy to BOTH Firebase Hosting sites
  log.info('Deploying to Firebase Hosting (ferni-prod + johnb-app)...');
  exec(
    `cd ${frontendDir} && firebase deploy --only hosting:ferni-prod,hosting:johnb-app --project ${CONFIG.projectId}`
  );

  log.success('Frontend deployed to:');
  log.success('  - https://ferni-prod.web.app');
  log.success('  - https://app.ferni.ai (johnb-2025)');
  return true;
}

async function deployLanding(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING LANDING PAGE');

  const landingDir = join(PROJECT_ROOT, 'promo/ferni-website');

  if (!existsSync(landingDir)) {
    log.warn('Landing page directory not found: promo/ferni-website');
    return false;
  }

  if (options.dryRun) {
    log.info('Would deploy landing page via Firebase or Cloud Storage');
    return true;
  }

  // Try Firebase first
  if (checkCommand('firebase')) {
    log.info('Deploying via Firebase Hosting...');
    exec(`cd ${landingDir} && firebase deploy --only hosting --project ${CONFIG.projectId}`);
    log.success('Landing page deployed via Firebase');
  } else {
    // Fall back to Cloud Storage
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

async function deployJoel(options: DeployOptions): Promise<boolean> {
  log.step('DEPLOYING JOEL DICKSON');

  const joelConfig = {
    agentService: 'joel-dickson-agent',
    uiService: 'joel-dickson-ui',
    personaId: 'joel-dickson',
  };

  if (options.dryRun) {
    log.info(`Would deploy Joel agent: ${joelConfig.agentService}`);
    log.info(`Would deploy Joel UI: ${joelConfig.uiService}`);
    return true;
  }

  // Build agent
  log.info('Building Joel agent container...');
  exec(
    `gcloud builds submit --tag gcr.io/${CONFIG.projectId}/${joelConfig.agentService}:latest . --quiet`
  );

  // Deploy agent
  log.info('Deploying Joel agent...');
  const agentSecrets = [
    'GOOGLE_API_KEY=google-api-key:latest',
    'CARTESIA_API_KEY=cartesia-api-key:latest',
    'LIVEKIT_URL=livekit-url:latest',
    'LIVEKIT_API_KEY=livekit-api-key:latest',
    'LIVEKIT_API_SECRET=livekit-api-secret:latest',
  ];

  exec(
    [
      `gcloud run deploy ${joelConfig.agentService}`,
      `--image gcr.io/${CONFIG.projectId}/${joelConfig.agentService}:latest`,
      `--region ${CONFIG.region}`,
      '--platform managed',
      '--allow-unauthenticated',
      '--memory 2Gi',
      '--cpu 2',
      '--timeout 3600',
      '--concurrency 1',
      '--min-instances 0',
      '--max-instances 20',
      `--set-env-vars "NODE_ENV=production,PERSONA_ID=${joelConfig.personaId},GOOGLE_CLOUD_PROJECT=${CONFIG.projectId},MUSIC_ENABLED=true"`,
      `--set-secrets "${agentSecrets.join(',')}"`,
      '--quiet',
    ].join(' \\\n  ')
  );

  const agentUrl = getServiceUrl(joelConfig.agentService);
  log.success(`Joel agent deployed: ${agentUrl}`);

  // Build UI
  log.info('Building Joel UI...');
  exec(`gcloud builds submit --config cloudbuild-joel-ui.yaml . --quiet`);

  // Deploy UI
  log.info('Deploying Joel UI...');
  const uiSecrets = [
    'LIVEKIT_URL=livekit-url:latest',
    'LIVEKIT_API_KEY=livekit-api-key:latest',
    'LIVEKIT_API_SECRET=livekit-api-secret:latest',
  ];

  exec(
    [
      `gcloud run deploy ${joelConfig.uiService}`,
      `--image gcr.io/${CONFIG.projectId}/${joelConfig.uiService}:latest`,
      `--region ${CONFIG.region}`,
      '--platform managed',
      '--allow-unauthenticated',
      '--memory 512Mi',
      '--cpu 1',
      '--timeout 300',
      '--min-instances 0',
      '--max-instances 10',
      '--set-env-vars "NODE_ENV=production,AGENT_NAME=voice-agent,TOKEN_SERVER_PORT=8080"',
      `--set-secrets "${uiSecrets.join(',')}"`,
      '--quiet',
    ].join(' \\\n  ')
  );

  const uiUrl = getServiceUrl(joelConfig.uiService);
  log.success(`Joel UI deployed: ${uiUrl}`);

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

// ============================================================================
// PREFLIGHT CHECKS
// ============================================================================

function preflightChecks(): boolean {
  log.step('PREFLIGHT CHECKS');

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
  ${colors.green}agent${colors.reset}      Deploy voice agent to Cloud Run
  ${colors.green}brand${colors.reset}      Deploy brand assets to Cloud Storage
  ${colors.green}landing${colors.reset}    Deploy landing page (Firebase/Cloud Storage)
  ${colors.green}joel${colors.reset}       Deploy Joel Dickson (agent + UI)
  ${colors.green}evolution${colors.reset}  Deploy evolution scheduler Cloud Function
  ${colors.green}all${colors.reset}        Deploy everything (agent, ui, frontend, landing)

${colors.bold}Options:${colors.reset}
  --async       Run deployment in background (don't wait for completion)
  --dry-run     Show what would be deployed without making changes
  --skip-build  Skip local build steps
  --verbose     Show detailed output
  --help, -h    Show this help

${colors.bold}Environment Variables:${colors.reset}
  GCP_PROJECT_ID    Google Cloud project (default: johnb-2025)
  GCP_REGION        Deployment region (default: us-central1)
  PERSONA_ID        Default persona (default: ferni)

${colors.bold}Examples:${colors.reset}
  npm run deploy ui              # Deploy UI (wait for completion)
  npm run deploy:ui:async        # Deploy UI in background (don't wait!)
  npm run deploy all             # Deploy everything
  npm run deploy -- --dry-run ui # Preview UI deployment
  npm run deploy -- --async ui   # Deploy UI async via flags
  GCP_PROJECT_ID=my-project npm run deploy agent
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
  if (!options.dryRun && !preflightChecks()) {
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

    case 'joel':
      success = await deployJoel(options);
      break;

    case 'evolution':
      success = await deployEvolution(options);
      break;

    case 'all':
      if (options.async) {
        // In async mode, start all deployments in parallel
        await deployAgent(options);
        await deployUi(options);
        await deployFrontend(options);
        await deployLanding(options);
        log.info('All deployments started in background');
        success = true;
      } else {
        success =
          (await deployAgent(options)) &&
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
  Agent URL:   ${getServiceUrl(CONFIG.services.agent) || '(not deployed)'}
  UI URL:      ${getServiceUrl(CONFIG.services.ui) || '(not deployed)'}

${colors.bold}Next Steps:${colors.reset}
  • Test: curl <SERVICE_URL>/health
  • Logs: gcloud run services logs read <SERVICE_NAME> --region ${CONFIG.region}
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
