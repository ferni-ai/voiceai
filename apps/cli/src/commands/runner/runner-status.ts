#!/usr/bin/env npx tsx
/**
 * GitHub Actions Self-Hosted Runner Status
 *
 * Shows status of self-hosted runners for the repository.
 *
 * Usage:
 *   ferni runner status           # Show all runners
 *   ferni runner status --json    # JSON output
 *
 * Note: Uses execSync for CLI commands (gcloud, gh) with hardcoded safe values only.
 * No user input is interpolated into shell commands.
 */

import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  repo: 'ferni-ai/voiceai',
  gceInstance: 'github-runner',
  gceZone: 'us-central1-a',
  sshUser: 'runner',
};

// ============================================================================
// COLORS & LOGGING
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
  magenta: '\x1b[35m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) =>
    console.log(`\n${colors.bold}${colors.blue}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// UTILITIES
// ============================================================================

// Safe exec wrapper - only used with hardcoded commands, no user input
function execSafe(cmd: string, options: { silent?: boolean } = {}): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
    });
  } catch {
    return '';
  }
}

interface Runner {
  id: number;
  name: string;
  status: 'online' | 'offline';
  busy: boolean;
  labels: string[];
}

interface RunnerStats {
  runners: Runner[];
  totalOnline: number;
  totalBusy: number;
  totalOffline: number;
}

function getRunnerStatus(): RunnerStats {
  try {
    // Safe: CONFIG.repo is hardcoded, not user input
    const output = execSafe(
      `gh api repos/${CONFIG.repo}/actions/runners --jq '.runners[] | {id, name, status, busy, labels: [.labels[].name]}'`,
      { silent: true }
    );

    const runners: Runner[] = output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    return {
      runners,
      totalOnline: runners.filter((r) => r.status === 'online').length,
      totalBusy: runners.filter((r) => r.busy).length,
      totalOffline: runners.filter((r) => r.status === 'offline').length,
    };
  } catch {
    return { runners: [], totalOnline: 0, totalBusy: 0, totalOffline: 0 };
  }
}

interface GCEStatus {
  isRunning: boolean;
  ip: string;
  machineType: string;
  zone: string;
}

function getGCEStatus(): GCEStatus {
  try {
    // Safe: CONFIG values are hardcoded, not user input
    const output = execSafe(
      `gcloud compute instances describe ${CONFIG.gceInstance} --zone=${CONFIG.gceZone} --format='json(status,networkInterfaces[0].accessConfigs[0].natIP,machineType)'`,
      { silent: true }
    );
    const data = JSON.parse(output);
    return {
      isRunning: data.status === 'RUNNING',
      ip: data.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP || 'N/A',
      machineType: data.machineType?.split('/').pop() || 'unknown',
      zone: CONFIG.gceZone,
    };
  } catch {
    return { isRunning: false, ip: 'N/A', machineType: 'unknown', zone: CONFIG.gceZone };
  }
}

function getServiceStatus(): { isActive: boolean; uptime: string } {
  try {
    // Safe: CONFIG values are hardcoded, not user input
    const output = execSafe(
      `gcloud compute ssh ${CONFIG.sshUser}@${CONFIG.gceInstance} --zone=${CONFIG.gceZone} --command="systemctl is-active actions.runner.* 2>/dev/null && systemctl show actions.runner.* --property=ActiveEnterTimestamp 2>/dev/null | head -1"`,
      { silent: true }
    );
    const lines = output.trim().split('\n');
    const isActive = lines[0] === 'active';
    const timestamp = lines[1]?.replace('ActiveEnterTimestamp=', '') || '';

    let uptime = 'unknown';
    if (timestamp) {
      const startTime = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      uptime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    return { isActive, uptime };
  } catch {
    return { isActive: false, uptime: 'unknown' };
  }
}

// ============================================================================
// MAIN
// ============================================================================

export async function runnerStatus(options: { json?: boolean }): Promise<void> {
  if (options.json) {
    const status = getRunnerStatus();
    const gce = getGCEStatus();
    console.log(JSON.stringify({ ...status, gce }, null, 2));
    return;
  }

  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           GITHUB ACTIONS RUNNER STATUS                     ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  // GitHub Runner Status
  log.step('GitHub Runners');
  const status = getRunnerStatus();

  if (status.runners.length === 0) {
    log.warn('No self-hosted runners found');
  } else {
    for (const runner of status.runners) {
      const statusIcon = runner.status === 'online'
        ? `${colors.green}●${colors.reset}`
        : `${colors.red}●${colors.reset}`;
      const busyIcon = runner.busy
        ? `${colors.yellow}(busy)${colors.reset}`
        : `${colors.dim}(idle)${colors.reset}`;

      console.log(`  ${statusIcon} ${colors.bold}${runner.name}${colors.reset} ${busyIcon}`);
      console.log(`    Labels: ${runner.labels.join(', ')}`);
    }

    console.log(`
  ${colors.cyan}Summary:${colors.reset}
    Online: ${colors.green}${status.totalOnline}${colors.reset}
    Busy:   ${colors.yellow}${status.totalBusy}${colors.reset}
    Offline: ${colors.red}${status.totalOffline}${colors.reset}
`);
  }

  // GCE Instance Status
  log.step('GCE Instance');
  const gce = getGCEStatus();
  const gceStatusIcon = gce.isRunning
    ? `${colors.green}●${colors.reset}`
    : `${colors.red}●${colors.reset}`;

  console.log(`  ${gceStatusIcon} ${colors.bold}${CONFIG.gceInstance}${colors.reset}`);
  console.log(`    Status: ${gce.isRunning ? `${colors.green}RUNNING${colors.reset}` : `${colors.red}STOPPED${colors.reset}`}`);
  console.log(`    IP: ${gce.ip}`);
  console.log(`    Type: ${gce.machineType}`);
  console.log(`    Zone: ${gce.zone}`);

  // Service Status
  if (gce.isRunning) {
    log.step('Runner Service');
    const service = getServiceStatus();
    const serviceIcon = service.isActive
      ? `${colors.green}●${colors.reset}`
      : `${colors.red}●${colors.reset}`;

    console.log(`  ${serviceIcon} systemd service`);
    console.log(`    Status: ${service.isActive ? `${colors.green}active${colors.reset}` : `${colors.red}inactive${colors.reset}`}`);
    console.log(`    Uptime: ${service.uptime}`);
  }

  // Commands hint
  console.log(`
${colors.dim}─────────────────────────────────────────────────────────────
Commands:
  ferni runner restart     # Restart the runner service
  ferni runner logs        # View runner logs
  ferni runner ssh         # SSH into the runner VM
─────────────────────────────────────────────────────────────${colors.reset}
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  runnerStatus({ json: args.includes('--json') }).catch(console.error);
}
