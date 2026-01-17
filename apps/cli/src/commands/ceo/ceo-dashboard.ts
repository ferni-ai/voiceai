#!/usr/bin/env npx tsx
/**
 * CEO Dashboard - Real-time company health overview
 */

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
  metrics: {
    revenue: { current: number; target: number; trend: 'up' | 'down' | 'flat' };
    users: { current: number; growth: number };
    nps: number;
    runway: number;
  };
  alerts: Array<{ severity: 'high' | 'medium' | 'low'; message: string; source: string }>;
  executiveSummary: string[];
}

async function fetchDashboardData(): Promise<DashboardData> {
  // TODO: Integrate with real data sources
  // This would pull from: CTO metrics, CPO metrics, CMO metrics, CSCO metrics
  return {
    companyHealth: 87,
    metrics: {
      revenue: { current: 125000, target: 150000, trend: 'up' },
      users: { current: 2450, growth: 12.5 },
      nps: 72,
      runway: 18,
    },
    alerts: [
      { severity: 'medium', message: 'Tech debt score increased 5%', source: 'CTO' },
      { severity: 'low', message: '3 vendor contracts expiring in 30 days', source: 'CSCO' },
    ],
    executiveSummary: [
      'Revenue on track for Q1 targets',
      'User growth accelerating (+12.5% MoM)',
      'NPS healthy at 72 (industry avg: 45)',
      '18 months runway at current burn',
    ],
  };
}

function renderHealthScore(score: number): string {
  const color = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
  const bar = '█'.repeat(Math.floor(score / 5)) + '░'.repeat(20 - Math.floor(score / 5));
  return `${color}${bar}${colors.reset} ${score}%`;
}

function renderTrend(trend: 'up' | 'down' | 'flat'): string {
  switch (trend) {
    case 'up': return `${colors.green}↑${colors.reset}`;
    case 'down': return `${colors.red}↓${colors.reset}`;
    case 'flat': return `${colors.dim}→${colors.reset}`;
  }
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

  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           CEO DASHBOARD - COMPANY HEALTH                   ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Overall Health${colors.reset}
${renderHealthScore(data.companyHealth)}

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
${data.executiveSummary.map(item => `  ${colors.green}✓${colors.reset} ${item}`).join('\n')}

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
