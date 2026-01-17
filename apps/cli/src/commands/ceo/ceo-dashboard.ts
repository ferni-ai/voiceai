#!/usr/bin/env npx tsx
/**
 * CEO Dashboard - Real-time company health overview
 *
 * Integrates with:
 * - CEO Coaching Storage (Firestore) for personal metrics
 * - Other executive commands for company-wide metrics
 */

import {
  getUserId,
  getPendingDecisions,
  getPriorities,
  getActiveBlockers,
  getRecentWins,
  getEnergyTrend,
  type CEODecision,
  type CEOPriority,
  type CEOBlocker,
  type CEOWin,
} from './storage-client.js';

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

interface DashboardData {
  companyHealth: number;
  leaderMetrics: {
    energy: { current: number; weekAvg: number; trend: 'up' | 'down' | 'stable' };
    winsThisWeek: number;
    pendingDecisions: number;
    activeBlockers: number;
    priorities: number;
  };
  metrics: {
    revenue: { current: number; target: number; trend: 'up' | 'down' | 'flat' };
    users: { current: number; growth: number };
    nps: number;
    runway: number;
  };
  alerts: Array<{ severity: 'high' | 'medium' | 'low'; message: string; source: string }>;
  executiveSummary: string[];
  rawData: {
    decisions: CEODecision[];
    priorities: CEOPriority[];
    blockers: CEOBlocker[];
    wins: CEOWin[];
  };
}

async function fetchDashboardData(): Promise<DashboardData> {
  const alerts: DashboardData['alerts'] = [];
  const executiveSummary: string[] = [];

  // Try to fetch real data from Firestore
  let decisions: CEODecision[] = [];
  let priorities: CEOPriority[] = [];
  let blockers: CEOBlocker[] = [];
  let wins: CEOWin[] = [];
  let energyTrend: { current?: number; weekAverage?: number; trend: 'up' | 'down' | 'stable' } = { trend: 'stable' };
  let hasRealData = false;

  try {
    const userId = await getUserId();
    if (userId) {
      hasRealData = true;
      [decisions, priorities, blockers, wins, energyTrend] = await Promise.all([
        getPendingDecisions().catch(() => []),
        getPriorities().catch(() => []),
        getActiveBlockers().catch(() => []),
        getRecentWins(7).catch(() => []),
        getEnergyTrend().catch(() => ({ trend: 'stable' as const })),
      ]);
    }
  } catch {
    // No user configured - use mock data
  }

  // Generate alerts from real data
  if (hasRealData) {
    if (decisions.length > 0) {
      alerts.push({
        severity: decisions.length > 3 ? 'high' : 'medium',
        message: `${decisions.length} pending decision${decisions.length !== 1 ? 's' : ''} awaiting action`,
        source: 'CEO',
      });
    }
    if (blockers.length > 0) {
      alerts.push({
        severity: blockers.length > 2 ? 'high' : 'medium',
        message: `${blockers.length} active blocker${blockers.length !== 1 ? 's' : ''} to address`,
        source: 'CEO',
      });
    }
    if (energyTrend.current !== undefined && energyTrend.current < 5) {
      alerts.push({
        severity: 'medium',
        message: `Energy level at ${energyTrend.current}/10 - consider recovery time`,
        source: 'CEO',
      });
    }

    // Generate executive summary from real data
    if (wins.length > 0) {
      executiveSummary.push(`${wins.length} win${wins.length !== 1 ? 's' : ''} logged this week`);
    }
    const activePriorities = priorities.filter(p => p.status === 'active');
    if (activePriorities.length > 0) {
      executiveSummary.push(`${activePriorities.length} active priorit${activePriorities.length !== 1 ? 'ies' : 'y'} in focus`);
    }
    if (energyTrend.trend === 'up') {
      executiveSummary.push('Energy trending upward this week');
    }
    if (decisions.length === 0 && blockers.length === 0) {
      executiveSummary.push('No pending decisions or blockers - clear path forward');
    }
  } else {
    // Fallback mock data for when Firestore isn't configured
    alerts.push(
      { severity: 'medium', message: 'Tech debt score increased 5%', source: 'CTO' },
      { severity: 'low', message: '3 vendor contracts expiring in 30 days', source: 'CSCO' },
    );
    executiveSummary.push(
      'Revenue on track for Q1 targets',
      'User growth accelerating (+12.5% MoM)',
      'NPS healthy at 72 (industry avg: 45)',
      '18 months runway at current burn',
    );
  }

  // Calculate company health score based on real data
  let companyHealth = 87; // Base score
  if (hasRealData) {
    // Adjust based on blockers (each blocker reduces score by 3)
    companyHealth -= blockers.length * 3;
    // Adjust based on pending decisions (many pending = slower velocity)
    companyHealth -= Math.min(decisions.length * 2, 10);
    // Boost from wins
    companyHealth += Math.min(wins.length * 2, 10);
    // Energy factor
    if (energyTrend.current !== undefined) {
      companyHealth += (energyTrend.current - 5) * 2; // +/- 10 based on energy
    }
    companyHealth = Math.max(0, Math.min(100, companyHealth));
  }

  return {
    companyHealth,
    leaderMetrics: {
      energy: {
        current: energyTrend.current ?? 7,
        weekAvg: energyTrend.weekAverage ?? 7,
        trend: energyTrend.trend,
      },
      winsThisWeek: wins.length,
      pendingDecisions: decisions.length,
      activeBlockers: blockers.length,
      priorities: priorities.filter(p => p.status === 'active').length,
    },
    metrics: {
      // These would come from other data sources (Stripe, analytics, etc.)
      revenue: { current: 125000, target: 150000, trend: 'up' },
      users: { current: 2450, growth: 12.5 },
      nps: 72,
      runway: 18,
    },
    alerts,
    executiveSummary,
    rawData: { decisions, priorities, blockers, wins },
  };
}

function renderHealthScore(score: number): string {
  const color = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
  const bar = '█'.repeat(Math.floor(score / 5)) + '░'.repeat(20 - Math.floor(score / 5));
  return `${color}${bar}${colors.reset} ${score}%`;
}

function renderTrend(trend: 'up' | 'down' | 'flat' | 'stable'): string {
  switch (trend) {
    case 'up': return `${colors.green}↑${colors.reset}`;
    case 'down': return `${colors.red}↓${colors.reset}`;
    case 'flat':
    case 'stable': return `${colors.dim}→${colors.reset}`;
  }
}

function renderEnergyBar(level: number): string {
  const color = level >= 7 ? colors.green : level >= 4 ? colors.yellow : colors.red;
  const filled = '●'.repeat(level);
  const empty = '○'.repeat(10 - level);
  return `${color}${filled}${colors.dim}${empty}${colors.reset}`;
}

function renderSeverity(severity: 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'high': return `${colors.red}●${colors.reset}`;
    case 'medium': return `${colors.yellow}●${colors.reset}`;
    case 'low': return `${colors.dim}●${colors.reset}`;
  }
}

export async function ceoDashboard(options: { json?: boolean }): Promise<void> {
  const data = await fetchDashboardData();

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const lm = data.leaderMetrics;

  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           CEO DASHBOARD - COMPANY HEALTH                   ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Overall Health${colors.reset}
${renderHealthScore(data.companyHealth)}

${colors.bold}${colors.cyan}Leader Status${colors.reset} ${colors.dim}(from Firestore)${colors.reset}
┌───────────────────┬────────────────────────────────┐
│ Energy            │ ${renderEnergyBar(lm.energy.current)} ${lm.energy.current}/10 ${renderTrend(lm.energy.trend)} │
│ Wins This Week    │ ${colors.green}${lm.winsThisWeek}${colors.reset}                              │
│ Active Priorities │ ${colors.blue}${lm.priorities}${colors.reset}                              │
│ Pending Decisions │ ${lm.pendingDecisions > 0 ? colors.yellow : colors.green}${lm.pendingDecisions}${colors.reset}                              │
│ Active Blockers   │ ${lm.activeBlockers > 0 ? colors.red : colors.green}${lm.activeBlockers}${colors.reset}                              │
└───────────────────┴────────────────────────────────┘

${colors.bold}Key Metrics${colors.reset}
┌─────────────────┬────────────────────┬─────────┐
│ Metric          │ Value              │ Trend   │
├─────────────────┼────────────────────┼─────────┤
│ Revenue         │ $${(data.metrics.revenue.current / 1000).toFixed(0)}k / $${(data.metrics.revenue.target / 1000).toFixed(0)}k    │ ${renderTrend(data.metrics.revenue.trend)}       │
│ Active Users    │ ${data.metrics.users.current.toLocaleString()}              │ ${renderTrend('up')} +${data.metrics.users.growth}% │
│ NPS Score       │ ${data.metrics.nps}                 │ ${renderTrend('up')}       │
│ Runway          │ ${data.metrics.runway} months          │ ${renderTrend('flat')}       │
└─────────────────┴────────────────────┴─────────┘

${colors.bold}Executive Summary${colors.reset}
${data.executiveSummary.length === 0 ? `  ${colors.dim}No activity yet${colors.reset}` : data.executiveSummary.map(item => `  ${colors.green}✓${colors.reset} ${item}`).join('\n')}

${colors.bold}Active Alerts${colors.reset}
${data.alerts.length === 0 ? `  ${colors.dim}No active alerts${colors.reset}` : data.alerts.map(alert => `  ${renderSeverity(alert.severity)} [${alert.source}] ${alert.message}`).join('\n')}

${colors.dim}Last updated: ${new Date().toLocaleString()}${colors.reset}
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  ceoDashboard({ json: args.includes('--json') }).catch(console.error);
}
