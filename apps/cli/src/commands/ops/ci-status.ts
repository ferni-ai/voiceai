#!/usr/bin/env npx tsx
/**
 * CI Status Command
 *
 * Quick one-liner status for CI health monitoring.
 * Designed to track the impact of concurrency changes.
 *
 * Usage:
 *   ferni ci status              # Quick one-liner status
 *   ferni ci status --compare    # Week-over-week comparison
 *   ferni ci status --json       # JSON output for scripts
 *
 * Environment:
 *   GITHUB_TOKEN - Required for API access
 */

import { config } from 'dotenv';
import { execSync } from 'child_process';

config();

interface CommandOptions {
  compare?: boolean;
  json?: boolean;
}

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  run_attempt: number;
  timing?: {
    job_runs?: Array<{
      job_id: number;
      duration_ms: number;
    }>;
  };
}

interface WorkflowRunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

interface StatusMetrics {
  today: {
    runs: number;
    minutes: number;
    failures: number;
    cancelled: number;
  };
  thisWeek: {
    runs: number;
    minutes: number;
    failures: number;
    cancelled: number;
    avgMinutesPerRun: number;
  };
  lastWeek?: {
    runs: number;
    minutes: number;
    failures: number;
    cancelled: number;
    avgMinutesPerRun: number;
  };
  budget: {
    used: number;
    limit: number;
    percentage: number;
    projected: number;
  };
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const BUDGET_MINUTES = 3000; // Monthly budget

function log(message: string, color?: keyof typeof COLORS): void {
  const colorCode = color ? COLORS[color] : '';
  console.log(`${colorCode}${message}${COLORS.reset}`);
}

function checkGitHubToken(): string | null {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  try {
    const token = execSync('gh auth token', { encoding: 'utf-8' }).trim();
    if (token) {
      return token;
    }
  } catch {
    // gh CLI not available or not authenticated
  }

  return null;
}

async function fetchWorkflowRuns(
  token: string,
  since: Date,
  until?: Date
): Promise<WorkflowRun[]> {
  const owner = 'ferni-ai';
  const repo = 'voiceai';
  const runs: WorkflowRun[] = [];
  let page = 1;
  const perPage = 100;

  const sinceStr = since.toISOString();
  const untilDate = until || new Date();

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=${perPage}&page=${page}&created=>${sinceStr.split('T')[0]}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = (await response.json()) as WorkflowRunsResponse;

    for (const run of data.workflow_runs) {
      const runDate = new Date(run.created_at);
      if (runDate >= since && runDate <= untilDate) {
        runs.push(run);
      }
    }

    if (data.workflow_runs.length < perPage) {
      break;
    }

    // Stop if we've gone past our date range
    const oldestInBatch = new Date(
      data.workflow_runs[data.workflow_runs.length - 1].created_at
    );
    if (oldestInBatch < since) {
      break;
    }

    page++;

    // Safety limit
    if (page > 10) break;
  }

  return runs;
}

function estimateMinutes(runs: WorkflowRun[]): number {
  // Estimate based on completed runs
  // Average run time: ~5 minutes based on historical data
  const AVG_MINUTES_PER_RUN = 5;
  const completed = runs.filter(
    (r) => r.status === 'completed' && r.conclusion !== 'cancelled'
  );
  return completed.length * AVG_MINUTES_PER_RUN;
}

function analyzeRuns(runs: WorkflowRun[]): {
  runs: number;
  minutes: number;
  failures: number;
  cancelled: number;
  avgMinutesPerRun: number;
} {
  const completed = runs.filter((r) => r.status === 'completed');
  const failures = completed.filter((r) => r.conclusion === 'failure').length;
  const cancelled = runs.filter(
    (r) => r.status === 'completed' && r.conclusion === 'cancelled'
  ).length;
  const minutes = estimateMinutes(runs);

  return {
    runs: runs.length,
    minutes,
    failures,
    cancelled,
    avgMinutesPerRun: runs.length > 0 ? Math.round(minutes / runs.length) : 0,
  };
}

async function getMetrics(token: string, compare: boolean): Promise<StatusMetrics> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(lastWeekStart.getDate() - 14);

  // Fetch this week's runs
  const thisWeekRuns = await fetchWorkflowRuns(token, weekStart);

  // Filter today's runs
  const todayRuns = thisWeekRuns.filter(
    (r) => new Date(r.created_at) >= todayStart
  );

  // Analyze
  const today = analyzeRuns(todayRuns);
  const thisWeek = analyzeRuns(thisWeekRuns);

  // Calculate budget
  const daysInMonth = 30;
  const daysElapsed = now.getDate();
  const projectedMonthly = Math.round(
    (thisWeek.minutes / 7) * daysInMonth
  );

  const metrics: StatusMetrics = {
    today,
    thisWeek,
    budget: {
      used: thisWeek.minutes,
      limit: BUDGET_MINUTES,
      percentage: Math.round((projectedMonthly / BUDGET_MINUTES) * 100),
      projected: projectedMonthly,
    },
  };

  // Optionally fetch last week for comparison
  if (compare) {
    const lastWeekRuns = await fetchWorkflowRuns(
      token,
      lastWeekStart,
      weekStart
    );
    metrics.lastWeek = analyzeRuns(lastWeekRuns);
  }

  return metrics;
}

function formatDelta(current: number, previous: number, inverse = false): string {
  if (previous === 0) return '';

  const delta = current - previous;
  const pct = Math.round((delta / previous) * 100);

  if (delta === 0) return ` (→)`;

  const sign = delta > 0 ? '+' : '';
  const isGood = inverse ? delta < 0 : delta > 0;
  const color = isGood ? COLORS.green : COLORS.red;

  return ` ${color}(${sign}${pct}%)${COLORS.reset}`;
}

function displayStatus(metrics: StatusMetrics, compare: boolean): void {
  // One-liner summary
  const budgetColor =
    metrics.budget.percentage > 100
      ? 'red'
      : metrics.budget.percentage > 80
        ? 'yellow'
        : 'green';
  const statusIcon =
    metrics.budget.percentage > 100 ? '⚠️' : metrics.budget.percentage > 80 ? '⚡' : '✓';

  log(
    `\n${statusIcon} CI: ${metrics.budget.projected}/${BUDGET_MINUTES} min projected (${metrics.budget.percentage}%)` +
      ` | ${metrics.today.runs} runs today | ${metrics.thisWeek.failures} failures this week`,
    budgetColor
  );

  if (compare && metrics.lastWeek) {
    log('\n📊 Week-over-Week Comparison:', 'cyan');
    log('');
    log('                  This Week   Last Week   Change');
    log('─────────────────────────────────────────────────');

    log(
      `Runs:             ${metrics.thisWeek.runs.toString().padStart(8)}   ${metrics.lastWeek.runs.toString().padStart(9)}   ${formatDelta(metrics.thisWeek.runs, metrics.lastWeek.runs, true)}`
    );
    log(
      `Minutes:          ${metrics.thisWeek.minutes.toString().padStart(8)}   ${metrics.lastWeek.minutes.toString().padStart(9)}   ${formatDelta(metrics.thisWeek.minutes, metrics.lastWeek.minutes, true)}`
    );
    log(
      `Avg min/run:      ${metrics.thisWeek.avgMinutesPerRun.toString().padStart(8)}   ${metrics.lastWeek.avgMinutesPerRun.toString().padStart(9)}   ${formatDelta(metrics.thisWeek.avgMinutesPerRun, metrics.lastWeek.avgMinutesPerRun, true)}`
    );
    log(
      `Failures:         ${metrics.thisWeek.failures.toString().padStart(8)}   ${metrics.lastWeek.failures.toString().padStart(9)}   ${formatDelta(metrics.thisWeek.failures, metrics.lastWeek.failures, true)}`
    );
    log(
      `Cancelled:        ${metrics.thisWeek.cancelled.toString().padStart(8)}   ${metrics.lastWeek.cancelled.toString().padStart(9)}   ${formatDelta(metrics.thisWeek.cancelled, metrics.lastWeek.cancelled)}`
    );
    log('');

    // Impact summary
    const minutesSaved = metrics.lastWeek.minutes - metrics.thisWeek.minutes;
    if (minutesSaved > 0) {
      log(
        `🎉 Saved ${minutesSaved} minutes this week (${Math.round((minutesSaved / metrics.lastWeek.minutes) * 100)}% reduction)`,
        'green'
      );
    } else if (minutesSaved < 0) {
      log(
        `📈 Used ${-minutesSaved} more minutes this week (${Math.round((-minutesSaved / metrics.lastWeek.minutes) * 100)}% increase)`,
        'yellow'
      );
    }

    // Cancellation effectiveness
    if (metrics.thisWeek.cancelled > metrics.lastWeek.cancelled) {
      const extraCancelled =
        metrics.thisWeek.cancelled - metrics.lastWeek.cancelled;
      log(
        `♻️  ${extraCancelled} more runs cancelled (concurrency working!)`,
        'green'
      );
    }
  }

  log('');
}

export async function runCIStatus(options: CommandOptions): Promise<void> {
  const token = checkGitHubToken();

  if (!token) {
    log('❌ GitHub token required', 'red');
    log('\nSet GITHUB_TOKEN or authenticate with gh CLI:', 'dim');
    log('  export GITHUB_TOKEN=your_token', 'dim');
    log('  gh auth login', 'dim');
    process.exit(1);
  }

  try {
    const metrics = await getMetrics(token, options.compare || false);

    if (options.json) {
      console.log(JSON.stringify(metrics, null, 2));
      return;
    }

    displayStatus(metrics, options.compare || false);
  } catch (error) {
    log(`❌ Failed to fetch CI status: ${error}`, 'red');
    process.exit(1);
  }
}

// CLI entry point when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options: CommandOptions = {
    compare: args.includes('--compare'),
    json: args.includes('--json'),
  };

  runCIStatus(options).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
