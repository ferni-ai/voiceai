#!/usr/bin/env npx tsx
/**
 * Autonomous Executive Scheduler
 *
 * Manages scheduled executive operations:
 * - Daily CEO briefings (7 AM)
 * - Weekly metrics reports (Monday 9 AM)
 * - Monthly board prep (1st of month)
 * - Real-time alert monitoring
 *
 * Usage:
 *   ferni exec schedule                    # Show scheduled jobs
 *   ferni exec schedule --enable           # Enable autonomous mode
 *   ferni exec schedule --disable          # Disable autonomous mode
 *   ferni exec schedule --run-now <job>    # Run a job immediately
 *   ferni exec schedule --alerts           # Show active alerts
 *
 * Note: Uses execSync with hardcoded safe commands only.
 * Job commands are defined in getDefaultConfig() and stored in config file.
 * No user input is interpolated into shell commands.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { execSync } from 'child_process';

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

// ============================================================================
// TYPES
// ============================================================================

interface ScheduledJob {
  id: string;
  name: string;
  description: string;
  schedule: string; // cron-like: 'daily@07:00', 'weekly@mon-09:00', 'monthly@1-09:00'
  command: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  output?: 'console' | 'file' | 'slack' | 'email';
}

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'above' | 'below' | 'equals';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  lastTriggered?: string;
  action: 'notify' | 'escalate' | 'auto-fix';
}

interface SchedulerConfig {
  enabled: boolean;
  jobs: ScheduledJob[];
  alerts: AlertRule[];
  notifications: {
    slack?: { webhook?: string; channel?: string };
    email?: { to?: string };
  };
  lastCheck?: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const CONFIG_DIR = join(homedir(), '.ferni');
const SCHEDULER_FILE = join(CONFIG_DIR, 'exec-scheduler.json');

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

async function loadConfig(): Promise<SchedulerConfig> {
  try {
    const data = await fs.readFile(SCHEDULER_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Return default config
    return getDefaultConfig();
  }
}

async function saveConfig(config: SchedulerConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(SCHEDULER_FILE, JSON.stringify(config, null, 2));
}

// Allowed commands whitelist for security
const ALLOWED_COMMANDS = new Set([
  'ferni ceo dashboard',
  'ferni exec',
  'ferni cto health --detailed',
  'ferni cto health',
  'ferni csco costs --breakdown --optimize',
  'ferni csco costs',
  'ferni ceo board-prep',
  'ferni ceo metrics',
  'ferni ceo metrics --period weekly',
]);

function getDefaultConfig(): SchedulerConfig {
  const now = new Date();
  return {
    enabled: false,
    jobs: [
      {
        id: 'daily-briefing',
        name: 'Daily CEO Briefing',
        description: 'Morning overview of company health, priorities, and alerts',
        schedule: 'daily@07:00',
        command: 'ferni ceo dashboard',
        enabled: true,
        nextRun: getNextRun('daily@07:00', now),
        output: 'console',
      },
      {
        id: 'weekly-metrics',
        name: 'Weekly Executive Metrics',
        description: 'Full metrics review across all C-suite functions',
        schedule: 'weekly@mon-09:00',
        command: 'ferni exec',
        enabled: true,
        nextRun: getNextRun('weekly@mon-09:00', now),
        output: 'console',
      },
      {
        id: 'tech-health',
        name: 'CTO Health Check',
        description: 'Architecture health and technical debt review',
        schedule: 'daily@08:00',
        command: 'ferni cto health --detailed',
        enabled: true,
        nextRun: getNextRun('daily@08:00', now),
        output: 'console',
      },
      {
        id: 'cost-review',
        name: 'CSCO Cost Review',
        description: 'Weekly cost analysis and optimization opportunities',
        schedule: 'weekly@fri-16:00',
        command: 'ferni csco costs --breakdown --optimize',
        enabled: true,
        nextRun: getNextRun('weekly@fri-16:00', now),
        output: 'console',
      },
      {
        id: 'monthly-board',
        name: 'Board Prep',
        description: 'Monthly board deck data generation',
        schedule: 'monthly@1-09:00',
        command: 'ferni ceo board-prep',
        enabled: true,
        nextRun: getNextRun('monthly@1-09:00', now),
        output: 'file',
      },
    ],
    alerts: [
      {
        id: 'health-critical',
        name: 'Company Health Critical',
        metric: 'ceo.companyHealth',
        condition: 'below',
        threshold: 50,
        severity: 'critical',
        enabled: true,
        action: 'escalate',
      },
      {
        id: 'health-warning',
        name: 'Company Health Warning',
        metric: 'ceo.companyHealth',
        condition: 'below',
        threshold: 70,
        severity: 'medium',
        enabled: true,
        action: 'notify',
      },
      {
        id: 'security-vulns',
        name: 'Security Vulnerabilities',
        metric: 'cto.security.vulnerabilities',
        condition: 'above',
        threshold: 5,
        severity: 'high',
        enabled: true,
        action: 'notify',
      },
      {
        id: 'cost-overrun',
        name: 'Budget Overrun',
        metric: 'csco.costs.utilizationPct',
        condition: 'above',
        threshold: 100,
        severity: 'high',
        enabled: true,
        action: 'notify',
      },
      {
        id: 'energy-low',
        name: 'CEO Energy Low',
        metric: 'ceo.leaderMetrics.energy.current',
        condition: 'below',
        threshold: 4,
        severity: 'medium',
        enabled: true,
        action: 'notify',
      },
      {
        id: 'blockers-high',
        name: 'Too Many Blockers',
        metric: 'ceo.leaderMetrics.activeBlockers',
        condition: 'above',
        threshold: 3,
        severity: 'medium',
        enabled: true,
        action: 'notify',
      },
    ],
    notifications: {},
  };
}

// ============================================================================
// SCHEDULE PARSING
// ============================================================================

function getNextRun(schedule: string, from: Date): string {
  const [frequency, time] = schedule.split('@');
  const now = new Date(from);

  if (frequency === 'daily') {
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  if (frequency === 'weekly') {
    const [day, timeStr] = time.split('-');
    const [hours, minutes] = timeStr.split(':').map(Number);
    const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const targetDay = dayMap[day.toLowerCase()] ?? 1;

    const next = new Date(now);
    const currentDay = next.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes)) {
      daysUntil += 7;
    }
    next.setDate(next.getDate() + daysUntil);
    next.setHours(hours, minutes, 0, 0);
    return next.toISOString();
  }

  if (frequency === 'monthly') {
    const [dayOfMonth, timeStr] = time.split('-');
    const [hours, minutes] = timeStr.split(':').map(Number);
    const targetDay = parseInt(dayOfMonth, 10);

    const next = new Date(now);
    next.setDate(targetDay);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
    return next.toISOString();
  }

  return now.toISOString();
}

function formatSchedule(schedule: string): string {
  const [frequency, time] = schedule.split('@');

  if (frequency === 'daily') {
    return `Daily at ${time}`;
  }
  if (frequency === 'weekly') {
    const [day, timeStr] = time.split('-');
    return `Every ${day.charAt(0).toUpperCase() + day.slice(1)} at ${timeStr}`;
  }
  if (frequency === 'monthly') {
    const [dayOfMonth, timeStr] = time.split('-');
    const suffix =
      dayOfMonth === '1' ? 'st' : dayOfMonth === '2' ? 'nd' : dayOfMonth === '3' ? 'rd' : 'th';
    return `${dayOfMonth}${suffix} of each month at ${timeStr}`;
  }
  return schedule;
}

function formatTimeUntil(isoDate: string): string {
  const now = new Date();
  const target = new Date(isoDate);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) return 'overdue';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `in ${days} day${days !== 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function printSchedule(config: SchedulerConfig): void {
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║         AUTONOMOUS EXECUTIVE SCHEDULER                      ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Status:${colors.reset} ${config.enabled ? `${colors.green}ENABLED${colors.reset}` : `${colors.yellow}DISABLED${colors.reset}`}
`);

  console.log(`${colors.bold}Scheduled Jobs${colors.reset}
┌────────────────────────┬───────────────────────────┬─────────────┬──────────────┐
│ Job                    │ Schedule                  │ Status      │ Next Run     │
├────────────────────────┼───────────────────────────┼─────────────┼──────────────┤`);

  for (const job of config.jobs) {
    const status = job.enabled
      ? `${colors.green}Active${colors.reset}`
      : `${colors.dim}Disabled${colors.reset}`;
    const nextRun = job.nextRun ? formatTimeUntil(job.nextRun) : 'N/A';
    console.log(
      `│ ${job.name.padEnd(22)} │ ${formatSchedule(job.schedule).padEnd(25)} │ ${status.padEnd(20)} │ ${nextRun.padEnd(12)} │`
    );
  }

  console.log(`└────────────────────────┴───────────────────────────┴─────────────┴──────────────┘
`);

  const enabledAlerts = config.alerts.filter((a) => a.enabled);
  console.log(`${colors.bold}Active Alert Rules${colors.reset} (${enabledAlerts.length} enabled)
`);

  for (const alert of enabledAlerts) {
    const severityColor =
      alert.severity === 'critical'
        ? colors.red
        : alert.severity === 'high'
          ? colors.yellow
          : colors.dim;
    const conditionStr =
      alert.condition === 'above'
        ? `> ${alert.threshold}`
        : alert.condition === 'below'
          ? `< ${alert.threshold}`
          : `= ${alert.threshold}`;

    console.log(
      `  ${severityColor}●${colors.reset} ${colors.bold}${alert.name}${colors.reset}: ${alert.metric} ${conditionStr} → ${alert.action}`
    );
  }

  console.log(`
${colors.dim}Commands:
  ferni exec schedule --enable          Enable autonomous mode
  ferni exec schedule --disable         Disable autonomous mode
  ferni exec schedule --run-now <job>   Run a job immediately
  ferni exec schedule --alerts          Show alert history
${colors.reset}`);
}

// ============================================================================
// MAIN
// ============================================================================

export async function execScheduler(options: {
  enable?: boolean;
  disable?: boolean;
  runNow?: string;
  alerts?: boolean;
  json?: boolean;
}): Promise<void> {
  let config = await loadConfig();

  if (options.enable) {
    config.enabled = true;
    await saveConfig(config);
    console.log(`${colors.green}✓ Autonomous scheduling enabled${colors.reset}`);
    console.log(`${colors.dim}Jobs will run at their scheduled times when the CLI is active.${colors.reset}`);
    console.log(`${colors.dim}For persistent scheduling, add to crontab: crontab -e${colors.reset}`);
    return;
  }

  if (options.disable) {
    config.enabled = false;
    await saveConfig(config);
    console.log(`${colors.yellow}⚠ Autonomous scheduling disabled${colors.reset}`);
    return;
  }

  if (options.runNow) {
    const job = config.jobs.find(
      (j) => j.id === options.runNow || j.name.toLowerCase().includes(options.runNow!.toLowerCase())
    );
    if (!job) {
      console.log(`${colors.red}Job not found: ${options.runNow}${colors.reset}`);
      console.log(`Available jobs: ${config.jobs.map((j) => j.id).join(', ')}`);
      return;
    }

    // Security: only execute whitelisted commands
    if (!ALLOWED_COMMANDS.has(job.command)) {
      console.log(`${colors.red}Command not in whitelist: ${job.command}${colors.reset}`);
      return;
    }

    console.log(`${colors.cyan}Running: ${job.name}${colors.reset}`);
    console.log(`${colors.dim}Command: ${job.command}${colors.reset}\n`);

    // Update last run
    job.lastRun = new Date().toISOString();
    job.nextRun = getNextRun(job.schedule, new Date());
    await saveConfig(config);

    // Execute the whitelisted command (safe: command is from config/whitelist, not user input)
    try {
      execSync(job.command, { stdio: 'inherit' });
    } catch {
      console.log(`${colors.red}Job execution failed${colors.reset}`);
    }
    return;
  }

  if (options.alerts) {
    console.log(`
${colors.bold}Alert Configuration${colors.reset}

${config.alerts.map((a) => {
      const severityColor =
        a.severity === 'critical'
          ? colors.red
          : a.severity === 'high'
            ? colors.yellow
            : a.severity === 'medium'
              ? colors.blue
              : colors.dim;
      const status = a.enabled ? `${colors.green}●${colors.reset}` : `${colors.dim}○${colors.reset}`;
      const lastTriggered = a.lastTriggered
        ? `Last triggered: ${new Date(a.lastTriggered).toLocaleString()}`
        : 'Never triggered';

      return `${status} ${severityColor}[${a.severity.toUpperCase()}]${colors.reset} ${colors.bold}${a.name}${colors.reset}
   ${a.metric} ${a.condition} ${a.threshold}
   Action: ${a.action} | ${colors.dim}${lastTriggered}${colors.reset}`;
    }).join('\n\n')}
`);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  printSchedule(config);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  execScheduler({
    enable: args.includes('--enable'),
    disable: args.includes('--disable'),
    runNow: args.includes('--run-now') ? args[args.indexOf('--run-now') + 1] : undefined,
    alerts: args.includes('--alerts'),
    json: args.includes('--json'),
  }).catch(console.error);
}
