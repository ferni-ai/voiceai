#!/usr/bin/env npx tsx

/**
 * DevOps Dashboard Generator
 *
 * Generates an HTML dashboard from CI metrics for monitoring.
 *
 * Usage:
 *   npx tsx scripts/devops/generate_dashboard.ts
 *
 * Environment:
 *   GITHUB_TOKEN - Required for API access
 *   GITHUB_REPOSITORY - Optional, defaults to current repo
 *   OUTPUT_DIR - Optional, defaults to ./dashboard
 */

import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

interface WorkflowMetrics {
  name: string;
  workflow_id: number;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  cancelled_runs: number;
  success_rate: number;
  avg_duration_minutes: number;
  total_minutes: number;
  last_run: string | null;
  trend: 'up' | 'down' | 'stable';
}

interface DashboardData {
  generated_at: string;
  period_start: string;
  period_end: string;
  total_workflow_runs: number;
  total_minutes_used: number;
  estimated_monthly_minutes: number;
  budget_minutes: number;
  budget_percentage: number;
  workflows: WorkflowMetrics[];
  alerts: Alert[];
}

interface Alert {
  level: 'info' | 'warning' | 'critical';
  message: string;
  workflow?: string;
}

async function collectMetrics(): Promise<DashboardData> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const repository = process.env.GITHUB_REPOSITORY || 'sethdford/voiceai';
  const [owner, repo] = repository.split('/');
  const budgetMinutes = 3000;

  const octokit = new Octokit({ auth: token });

  // Get date range (last 7 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  console.log(`Collecting metrics for ${owner}/${repo}...`);

  // Get all workflows
  const { data: workflows } = await octokit.actions.listRepoWorkflows({
    owner,
    repo,
  });

  const workflowMetrics: WorkflowMetrics[] = [];
  const alerts: Alert[] = [];

  for (const workflow of workflows.workflows) {
    // Get runs for this workflow in the date range
    const { data: runs } = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflow.id,
      created: `>=${startDate.toISOString().split('T')[0]}`,
      per_page: 100,
    });

    if (runs.workflow_runs.length === 0) {
      continue;
    }

    let totalDuration = 0;
    let successful = 0;
    let failed = 0;
    let cancelled = 0;

    for (const run of runs.workflow_runs) {
      if (run.created_at && run.updated_at) {
        const created = new Date(run.created_at);
        const updated = new Date(run.updated_at);
        const durationMs = updated.getTime() - created.getTime();
        totalDuration += durationMs / 1000 / 60;
      }

      if (run.conclusion === 'success') {
        successful++;
      } else if (run.conclusion === 'failure') {
        failed++;
      } else if (run.conclusion === 'cancelled') {
        cancelled++;
      }
    }

    const totalRuns = runs.workflow_runs.length;
    const avgDuration = totalRuns > 0 ? totalDuration / totalRuns : 0;
    const successRate = totalRuns > 0 ? (successful / totalRuns) * 100 : 0;

    // Determine trend (simplified - would need historical data for real trend)
    const trend: 'up' | 'down' | 'stable' = successRate >= 90 ? 'up' : successRate >= 70 ? 'stable' : 'down';

    workflowMetrics.push({
      name: workflow.name,
      workflow_id: workflow.id,
      total_runs: totalRuns,
      successful_runs: successful,
      failed_runs: failed,
      cancelled_runs: cancelled,
      success_rate: Math.round(successRate * 10) / 10,
      avg_duration_minutes: Math.round(avgDuration * 10) / 10,
      total_minutes: Math.round(totalDuration * 10) / 10,
      last_run: runs.workflow_runs[0]?.created_at || null,
      trend,
    });

    // Generate alerts
    if (successRate < 70 && totalRuns > 5) {
      alerts.push({
        level: 'critical',
        message: `${workflow.name} has ${successRate.toFixed(1)}% success rate`,
        workflow: workflow.name,
      });
    } else if (successRate < 85 && totalRuns > 5) {
      alerts.push({
        level: 'warning',
        message: `${workflow.name} success rate dropped to ${successRate.toFixed(1)}%`,
        workflow: workflow.name,
      });
    }
  }

  // Sort by total minutes
  workflowMetrics.sort((a, b) => b.total_minutes - a.total_minutes);

  const totalRuns = workflowMetrics.reduce((sum, w) => sum + w.total_runs, 0);
  const totalMinutes = workflowMetrics.reduce((sum, w) => sum + w.total_minutes, 0);
  const estimatedMonthly = (totalMinutes / 7) * 30;
  const budgetPercentage = (estimatedMonthly / budgetMinutes) * 100;

  // Budget alerts
  if (budgetPercentage > 100) {
    alerts.unshift({
      level: 'critical',
      message: `CI minutes over budget: ${Math.round(estimatedMonthly)} / ${budgetMinutes} (${Math.round(budgetPercentage)}%)`,
    });
  } else if (budgetPercentage > 80) {
    alerts.unshift({
      level: 'warning',
      message: `CI minutes approaching budget: ${Math.round(estimatedMonthly)} / ${budgetMinutes} (${Math.round(budgetPercentage)}%)`,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    period_start: startDate.toISOString().split('T')[0],
    period_end: endDate.toISOString().split('T')[0],
    total_workflow_runs: totalRuns,
    total_minutes_used: Math.round(totalMinutes),
    estimated_monthly_minutes: Math.round(estimatedMonthly),
    budget_minutes: budgetMinutes,
    budget_percentage: Math.round(budgetPercentage),
    workflows: workflowMetrics,
    alerts,
  };
}

function generateHTML(data: DashboardData): string {
  const alertsHTML = data.alerts
    .map(
      (alert) => `
      <div class="alert alert-${alert.level}">
        <span class="alert-icon">${alert.level === 'critical' ? '🚨' : alert.level === 'warning' ? '⚠️' : 'ℹ️'}</span>
        <span class="alert-message">${alert.message}</span>
      </div>
    `
    )
    .join('');

  const workflowsHTML = data.workflows
    .slice(0, 15)
    .map(
      (w) => `
      <tr>
        <td>${w.name}</td>
        <td>${w.total_runs}</td>
        <td>${w.total_minutes}</td>
        <td>${w.avg_duration_minutes}</td>
        <td class="success-rate ${w.success_rate >= 90 ? 'good' : w.success_rate >= 70 ? 'warning' : 'bad'}">
          ${w.success_rate}%
        </td>
        <td>${w.trend === 'up' ? '📈' : w.trend === 'down' ? '📉' : '➡️'}</td>
      </tr>
    `
    )
    .join('');

  const budgetClass = data.budget_percentage > 100 ? 'critical' : data.budget_percentage > 80 ? 'warning' : 'good';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ferni DevOps Dashboard</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-card: #0f3460;
      --text-primary: #eaeaea;
      --text-secondary: #a0a0a0;
      --accent: #e94560;
      --success: #4ade80;
      --warning: #fbbf24;
      --critical: #ef4444;
      --info: #60a5fa;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      padding: 2rem;
    }

    .container { max-width: 1400px; margin: 0 auto; }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--bg-card);
    }

    h1 { font-size: 1.75rem; font-weight: 600; }

    .timestamp {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .metric-card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 1.5rem;
    }

    .metric-label {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .metric-value {
      font-size: 2rem;
      font-weight: 700;
    }

    .metric-value.good { color: var(--success); }
    .metric-value.warning { color: var(--warning); }
    .metric-value.critical { color: var(--critical); }

    .budget-bar {
      margin-top: 1rem;
      background: var(--bg-secondary);
      border-radius: 4px;
      height: 8px;
      overflow: hidden;
    }

    .budget-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }

    .budget-fill.good { background: var(--success); }
    .budget-fill.warning { background: var(--warning); }
    .budget-fill.critical { background: var(--critical); }

    .alerts-section {
      margin-bottom: 2rem;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 0.5rem;
    }

    .alert-critical { background: rgba(239, 68, 68, 0.2); border-left: 4px solid var(--critical); }
    .alert-warning { background: rgba(251, 191, 36, 0.2); border-left: 4px solid var(--warning); }
    .alert-info { background: rgba(96, 165, 250, 0.2); border-left: 4px solid var(--info); }

    .workflows-section {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 1.5rem;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
    }

    th {
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 0.875rem;
      border-bottom: 1px solid var(--bg-card);
    }

    td { border-bottom: 1px solid var(--bg-card); }

    tr:last-child td { border-bottom: none; }

    .success-rate.good { color: var(--success); }
    .success-rate.warning { color: var(--warning); }
    .success-rate.bad { color: var(--critical); }

    .footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--bg-card);
      color: var(--text-secondary);
      font-size: 0.875rem;
      text-align: center;
    }

    @media (max-width: 768px) {
      body { padding: 1rem; }
      .metrics-grid { grid-template-columns: 1fr 1fr; }
      .metric-value { font-size: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🚀 Ferni DevOps Dashboard</h1>
      <div class="timestamp">
        Generated: ${new Date(data.generated_at).toLocaleString()}<br>
        Period: ${data.period_start} to ${data.period_end}
      </div>
    </header>

    <section class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Runs (7 days)</div>
        <div class="metric-value">${data.total_workflow_runs}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Minutes Used (7 days)</div>
        <div class="metric-value">${data.total_minutes_used}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Est. Monthly Minutes</div>
        <div class="metric-value ${budgetClass}">${data.estimated_monthly_minutes}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Budget Usage</div>
        <div class="metric-value ${budgetClass}">${data.budget_percentage}%</div>
        <div class="budget-bar">
          <div class="budget-fill ${budgetClass}" style="width: ${Math.min(data.budget_percentage, 100)}%"></div>
        </div>
      </div>
    </section>

    ${
      data.alerts.length > 0
        ? `
    <section class="alerts-section">
      <h2 class="section-title">⚡ Alerts</h2>
      ${alertsHTML}
    </section>
    `
        : ''
    }

    <section class="workflows-section">
      <h2 class="section-title">📊 Workflow Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Workflow</th>
            <th>Runs</th>
            <th>Minutes</th>
            <th>Avg (min)</th>
            <th>Success Rate</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          ${workflowsHTML}
        </tbody>
      </table>
    </section>

    <footer class="footer">
      <p>Ferni AI • CI/CD Dashboard • Budget: ${data.budget_minutes} min/month</p>
      <p>Run <code>npx tsx scripts/devops/generate_dashboard.ts</code> to refresh</p>
    </footer>
  </div>
</body>
</html>`;
}

async function main() {
  try {
    const outputDir = process.env.OUTPUT_DIR || './dashboard';

    // Collect metrics
    const data = await collectMetrics();

    // Generate HTML
    const html = generateHTML(data);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write files
    const htmlPath = path.join(outputDir, 'index.html');
    const jsonPath = path.join(outputDir, 'metrics.json');

    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

    console.log(`\n✅ Dashboard generated successfully!`);
    console.log(`   HTML: ${htmlPath}`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`\n   Open in browser: file://${path.resolve(htmlPath)}`);

    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`   Total runs: ${data.total_workflow_runs}`);
    console.log(`   Minutes used: ${data.total_minutes_used}`);
    console.log(`   Est. monthly: ${data.estimated_monthly_minutes} / ${data.budget_minutes} (${data.budget_percentage}%)`);

    if (data.alerts.length > 0) {
      console.log(`\n⚠️  Alerts: ${data.alerts.length}`);
      data.alerts.forEach((a) => console.log(`   - [${a.level}] ${a.message}`));
    }
  } catch (error) {
    console.error('Failed to generate dashboard:', error);
    process.exit(1);
  }
}

main();
