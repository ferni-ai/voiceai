#!/usr/bin/env npx tsx
/**
 * GitHub Actions Self-Hosted Runner Management
 *
 * Manages the self-hosted GitHub Actions runner on GCE.
 *
 * Usage:
 *   ferni runner status           # Show runner status
 *   ferni runner restart          # Restart the runner service
 *   ferni runner logs             # View runner logs
 *   ferni runner ssh              # SSH into the runner VM
 *   ferni runner setup            # Setup a new runner (interactive)
 *
 * Note: Uses execSync for CLI commands (gcloud, gh) with hardcoded safe values only.
 * No user input is interpolated into shell commands.
 */

import { spawn } from 'child_process';
import { runnerStatus } from './runner-status.js';
import { runnerRestart } from './runner-restart.js';
import { runnerLogs } from './runner-logs.js';

const CONFIG = {
  gceInstance: 'github-runner',
  gceZone: 'us-central1-a',
  sshUser: 'runner',
};

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function printHelp(): void {
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           FERNI RUNNER MANAGEMENT                          ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni runner <command> [options]

${colors.cyan}COMMANDS${colors.reset}
  ${colors.bold}status${colors.reset}              Show runner and GCE instance status
    --json           Output as JSON

  ${colors.bold}restart${colors.reset}             Restart the runner service
    --force          Force stop + start instead of restart

  ${colors.bold}logs${colors.reset}                View runner service logs
    --follow, -f     Stream logs in real-time
    --lines, -n      Number of lines to show (default: 50)

  ${colors.bold}ssh${colors.reset}                 SSH into the runner VM

${colors.cyan}EXAMPLES${colors.reset}
  ferni runner status
  ferni runner restart --force
  ferni runner logs --follow
  ferni runner ssh

${colors.cyan}RUNNER DETAILS${colors.reset}
  VM Name:     ${CONFIG.gceInstance}
  Zone:        ${CONFIG.gceZone}
  Labels:      self-hosted, Linux, X64, gce

${colors.cyan}COST${colors.reset}
  ~$25/month (e2-medium) vs per-minute GitHub Actions billing
`);
}

async function runnerSSH(): Promise<void> {
  // Safe: CONFIG values are hardcoded
  const child = spawn('gcloud', [
    'compute', 'ssh',
    `${CONFIG.sshUser}@${CONFIG.gceInstance}`,
    `--zone=${CONFIG.gceZone}`,
  ], { stdio: 'inherit' });

  child.on('exit', (code) => process.exit(code || 0));
}

export async function runner(command: string, options: Record<string, unknown> = {}): Promise<void> {
  switch (command) {
    case 'status':
      await runnerStatus({ json: options.json as boolean });
      break;
    case 'restart':
      await runnerRestart({ force: options.force as boolean });
      break;
    case 'logs':
      await runnerLogs({
        follow: options.follow as boolean,
        lines: options.lines as number,
      });
      break;
    case 'ssh':
      await runnerSSH();
      break;
    case 'help':
    default:
      printHelp();
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const options: Record<string, unknown> = {};
  if (args.includes('--json')) options.json = true;
  if (args.includes('--force')) options.force = true;
  if (args.includes('--follow') || args.includes('-f')) options.follow = true;

  const linesIdx = args.findIndex((a) => a === '--lines' || a === '-n');
  if (linesIdx >= 0) options.lines = parseInt(args[linesIdx + 1], 10);

  runner(command, options).catch(console.error);
}
