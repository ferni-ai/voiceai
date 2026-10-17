#!/usr/bin/env npx tsx
/**
 * `ferni deploy`: what is left of it.
 *
 * Web deploys (UI server, app, landing) run only through the GitHub workflows,
 * and the voice agent only through the deploy-agent skill (Seth, 2026-10-17).
 * For those targets this prints the command that does the job and exits 1.
 * It still deploys the async workers (ferni-async), which have no other path.
 */

import { findProjectRoot } from '../../utils/project-root.js';
import { AGENT_DEPLOY_MOVED } from '../../utils/livekit-agent.js';
import { ChildProcess, execSync, spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = findProjectRoot();

const CONFIG = {
  // GCP Settings
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',
};

/** Targets the CLI no longer deploys, and the workflow run that does. */
const WEB_DEPLOYS: Readonly<Record<string, readonly string[]>> = {
  ui: ['gh workflow run deploy-production.yml --ref main -f service=ui-server'],
  frontend: ['gh workflow run deploy-firebase.yml --ref main -f target=app'],
  landing: ['gh workflow run deploy-firebase.yml --ref main -f target=landing'],
  all: [
    'gh workflow run deploy-production.yml --ref main -f service=ui-server',
    'gh workflow run deploy-firebase.yml --ref main -f target=both',
  ],
};

function printWebDeployMoved(target: string): void {
  log.error(
    `The CLI no longer deploys "${target}". Web deploys run only through GitHub workflows,`
  );
  log.info('which deploy main on every push. To redeploy main by hand:');
  for (const cmd of WEB_DEPLOYS[target]) console.log(`  ${cmd}`);
}

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

interface DeployOptions {
  dryRun: boolean;
  verbose: boolean;
  skipGitCheck: boolean;
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
${colors.bold}${colors.cyan}FERNI DEPLOY${colors.reset}

${colors.bold}Usage:${colors.reset}  ferni deploy async [--dry-run] [--verbose] [--skip-git-check]

  ${colors.green}async${colors.reset}      Deploy the async workers (ferni-async) to Cloud Run

  Not here any more:
    ui, frontend, landing, all   GitHub workflows (main deploys on every push)
    agent                        .claude/skills/deploy-agent/SKILL.md
    brand, intelligence          removed (no live target)
`);
}

async function main() {
  const args = process.argv.slice(2);
  const options: DeployOptions = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    skipGitCheck: args.includes('--skip-git-check'),
  };
  const target = args.find((arg) => !arg.startsWith('-'));

  if (!target || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // All before preflight: preflight runs `gcloud config set project`.
  if (target === 'agent') {
    log.error(AGENT_DEPLOY_MOVED);
    process.exit(1);
  }
  if (WEB_DEPLOYS[target]) {
    printWebDeployMoved(target);
    process.exit(1);
  }
  if (target !== 'async' && target !== 'workers') {
    log.error(`Unknown or removed target: ${target}`);
    printHelp();
    process.exit(1);
  }

  if (options.dryRun) {
    log.warn('DRY RUN - No changes will be made');
  } else if (!preflightChecks(options)) {
    process.exit(1);
  }

  if (!(await deployAsync(options))) {
    log.error('Async workers deployment failed');
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Deployment failed: ${error.message}`);
  process.exit(1);
});
