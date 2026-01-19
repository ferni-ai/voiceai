#!/usr/bin/env npx tsx

/**
 * CI Metrics Collector
 *
 * Collects GitHub Actions workflow metrics including:
 * - Workflow run counts and durations
 * - Success/failure rates
 * - Minute usage by workflow
 *
 * Usage:
 *   npx tsx scripts/devops/collect_ci_metrics.ts
 *
 * Environment:
 *   GITHUB_TOKEN - Required for API access
 *   GITHUB_REPOSITORY - Optional, defaults to current repo
 */

import { Octokit } from '@octokit/rest';

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
}

interface OverallMetrics {
  period_start: string;
  period_end: string;
  total_workflow_runs: number;
  total_minutes_used: number;
  estimated_monthly_minutes: number;
  workflows: WorkflowMetrics[];
}

async function collectMetrics(): Promise<OverallMetrics> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const repository = process.env.GITHUB_REPOSITORY || 'sethdford/voiceai';
  const [owner, repo] = repository.split('/');

  const octokit = new Octokit({ auth: token });

  // Get date range (last 7 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  console.log(`Collecting CI metrics for ${owner}/${repo}`);
  console.log(`Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  console.log('');

  // Get all workflows
  const { data: workflows } = await octokit.actions.listRepoWorkflows({
    owner,
    repo,
  });

  const workflowMetrics: WorkflowMetrics[] = [];

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
      // Calculate duration
      if (run.created_at && run.updated_at) {
        const created = new Date(run.created_at);
        const updated = new Date(run.updated_at);
        const durationMs = updated.getTime() - created.getTime();
        totalDuration += durationMs / 1000 / 60; // Convert to minutes
      }

      // Count by status
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
    });
  }

  // Sort by total minutes (descending)
  workflowMetrics.sort((a, b) => b.total_minutes - a.total_minutes);

  const totalRuns = workflowMetrics.reduce((sum, w) => sum + w.total_runs, 0);
  const totalMinutes = workflowMetrics.reduce((sum, w) => sum + w.total_minutes, 0);
  const estimatedMonthly = (totalMinutes / 7) * 30;

  return {
    period_start: startDate.toISOString().split('T')[0],
    period_end: endDate.toISOString().split('T')[0],
    total_workflow_runs: totalRuns,
    total_minutes_used: Math.round(totalMinutes),
    estimated_monthly_minutes: Math.round(estimatedMonthly),
    workflows: workflowMetrics,
  };
}

function formatMarkdownReport(metrics: OverallMetrics): string {
  let report = `## CI Metrics Report\n\n`;
  report += `**Period:** ${metrics.period_start} to ${metrics.period_end}\n\n`;

  report += `### Summary\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Workflow Runs | ${metrics.total_workflow_runs} |\n`;
  report += `| Total Minutes Used | ${metrics.total_minutes_used} |\n`;
  report += `| Estimated Monthly Minutes | ${metrics.estimated_monthly_minutes} |\n`;
  report += `| Budget (3,000 min/month) | ${Math.round((metrics.estimated_monthly_minutes / 3000) * 100)}% |\n\n`;

  if (metrics.estimated_monthly_minutes > 3000) {
    report += `> ⚠️ **Warning:** Estimated usage (${metrics.estimated_monthly_minutes} min) exceeds the 3,000 minute budget!\n\n`;
  }

  report += `### Workflow Breakdown (Top 10 by Minutes)\n\n`;
  report += `| Workflow | Runs | Minutes | Avg (min) | Success Rate |\n`;
  report += `|----------|------|---------|-----------|-------------|\n`;

  const top10 = metrics.workflows.slice(0, 10);
  for (const workflow of top10) {
    const statusIcon = workflow.success_rate >= 90 ? '✅' : workflow.success_rate >= 70 ? '⚠️' : '❌';
    report += `| ${workflow.name} | ${workflow.total_runs} | ${workflow.total_minutes} | ${workflow.avg_duration_minutes} | ${statusIcon} ${workflow.success_rate}% |\n`;
  }

  report += `\n### Recommendations\n\n`;

  // Add recommendations based on metrics
  const highMinuteWorkflows = metrics.workflows.filter((w) => w.total_minutes > 100);
  if (highMinuteWorkflows.length > 0) {
    report += `- **High-usage workflows:** Consider optimizing ${highMinuteWorkflows.map((w) => w.name).join(', ')}\n`;
  }

  const lowSuccessWorkflows = metrics.workflows.filter((w) => w.success_rate < 80 && w.total_runs > 5);
  if (lowSuccessWorkflows.length > 0) {
    report += `- **Low success rate:** Investigate failures in ${lowSuccessWorkflows.map((w) => w.name).join(', ')}\n`;
  }

  const frequentWorkflows = metrics.workflows.filter((w) => w.total_runs > 50);
  if (frequentWorkflows.length > 0) {
    report += `- **High-frequency workflows:** Review trigger conditions for ${frequentWorkflows.map((w) => w.name).join(', ')}\n`;
  }

  return report;
}

async function main() {
  try {
    const metrics = await collectMetrics();

    // Output JSON for programmatic use
    console.log('=== JSON Metrics ===');
    console.log(JSON.stringify(metrics, null, 2));
    console.log('');

    // Output Markdown for GitHub Step Summary
    console.log('=== Markdown Report ===');
    const report = formatMarkdownReport(metrics);
    console.log(report);

    // Exit with warning if over budget
    if (metrics.estimated_monthly_minutes > 3000) {
      console.error('⚠️ CI minute usage is over budget!');
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to collect metrics:', error);
    process.exit(1);
  }
}

main();
