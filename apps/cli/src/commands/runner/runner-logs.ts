#!/usr/bin/env npx tsx
/**
 * View GitHub Actions Self-Hosted Runner Logs
 *
 * Usage:
 *   ferni runner logs           # View recent logs
 *   ferni runner logs --follow  # Stream logs in real-time
 *   ferni runner logs --lines 100  # Show last 100 lines
 *
 * Note: Uses execSync for CLI commands (gcloud) with hardcoded safe values only.
 * No user input is interpolated into shell commands - lines is validated as number.
 */

import { execSync } from 'child_process';

const CONFIG = {
  gceInstance: 'github-runner',
  gceZone: 'us-central1-a',
  sshUser: 'runner',
  serviceName: 'actions.runner.ferni-ai-voiceai.github-runner-gce',
};

export async function runnerLogs(options: { follow?: boolean; lines?: number }): Promise<void> {
  // Validate lines is a safe number
  const lines = Math.max(1, Math.min(options.lines || 50, 10000));
  const followFlag = options.follow ? '-f' : '';

  // Safe: CONFIG values are hardcoded, lines is validated as a number
  const cmd = `gcloud compute ssh ${CONFIG.sshUser}@${CONFIG.gceInstance} --zone=${CONFIG.gceZone} --command="sudo journalctl -u ${CONFIG.serviceName} -n ${lines} ${followFlag} --no-pager"`;

  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    // User may Ctrl+C to exit follow mode
    process.exit(0);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const follow = args.includes('--follow') || args.includes('-f');
  const linesIdx = args.findIndex((a) => a === '--lines' || a === '-n');
  const lines = linesIdx >= 0 ? parseInt(args[linesIdx + 1], 10) : undefined;

  runnerLogs({ follow, lines }).catch(console.error);
}
