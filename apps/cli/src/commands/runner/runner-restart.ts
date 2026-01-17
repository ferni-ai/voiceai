#!/usr/bin/env npx tsx
/**
 * Restart GitHub Actions Self-Hosted Runner Service
 *
 * Usage:
 *   ferni runner restart          # Restart the runner service
 *   ferni runner restart --force  # Force restart (stop + start)
 *
 * Note: Uses execSync for CLI commands (gcloud) with hardcoded safe values only.
 * No user input is interpolated into shell commands.
 */

import { execSync } from 'child_process';

const CONFIG = {
  gceInstance: 'github-runner',
  gceZone: 'us-central1-a',
  sshUser: 'runner',
  serviceName: 'actions.runner.ferni-ai-voiceai.github-runner-gce',
};

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) =>
    console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// Safe SSH wrapper - only used with hardcoded CONFIG values
function ssh(cmd: string): void {
  execSync(
    `gcloud compute ssh ${CONFIG.sshUser}@${CONFIG.gceInstance} --zone=${CONFIG.gceZone} --command="${cmd.replace(/"/g, '\\"')}"`,
    { stdio: 'inherit' }
  );
}

export async function runnerRestart(options: { force?: boolean }): Promise<void> {
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           RESTART GITHUB RUNNER                            ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  log.info(`Instance: ${CONFIG.gceInstance}`);
  log.info(`Service: ${CONFIG.serviceName}`);

  if (options.force) {
    log.step('Force Restarting Runner');
    log.info('Stopping service...');
    ssh(`sudo systemctl stop ${CONFIG.serviceName}`);
    log.info('Starting service...');
    ssh(`sudo systemctl start ${CONFIG.serviceName}`);
  } else {
    log.step('Restarting Runner');
    ssh(`sudo systemctl restart ${CONFIG.serviceName}`);
  }

  // Wait for service to come up
  log.info('Waiting for service to start...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Check status
  log.step('Checking Status');
  try {
    ssh(`sudo systemctl status ${CONFIG.serviceName} --no-pager`);
    log.success('Runner service restarted successfully!');
  } catch {
    log.error('Runner service may not have started correctly');
    log.info('Check logs with: ferni runner logs');
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  runnerRestart({ force: args.includes('--force') }).catch(console.error);
}
