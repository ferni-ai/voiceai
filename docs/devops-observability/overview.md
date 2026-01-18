# DevOps Observability Overview

This document describes the observability tooling for CI/CD.

## Quick Start

```bash
# Generate dashboard locally
GITHUB_TOKEN=xxx npx tsx scripts/devops/generate_dashboard.ts

# Open dashboard
open ./dashboard/index.html

# Trigger dashboard workflow
gh workflow run devops-dashboard.yml --field publish=true
```

## Components

### DevOps Dashboard

**Location:** `scripts/devops/generate_dashboard.ts`

Generates an interactive HTML dashboard showing:
- Budget usage (minutes used vs limit)
- Workflow breakdown (runs, duration, success rate)
- Alerts (over-budget, low success rate)
- Trend indicators

**Output:**
- `dashboard/index.html` - Interactive HTML dashboard
- `dashboard/metrics.json` - Raw metrics data

**Workflow:** `.github/workflows/devops-dashboard.yml`
- Runs daily at 6 AM UTC
- Publishes to GitHub Pages (if enabled)
- Sends Slack alerts on critical issues

### CI Metrics Collector

**Location:** `scripts/devops/collect_ci_metrics.ts`

Collects GitHub Actions metrics using the Octokit API:
- Workflow run counts
- Duration statistics
- Success/failure rates
- Minute usage by workflow

**Usage:**
```bash
# Run locally
GITHUB_TOKEN=xxx npx tsx scripts/devops/collect_ci_metrics.ts

# Run via workflow
gh workflow run ci-metrics.yml
```

**Output:**
- JSON metrics for programmatic use
- Markdown report for GitHub Summary
- Slack notification (if configured)

### CI Metrics Workflow

**Location:** `.github/workflows/ci-metrics.yml`

Scheduled workflow that runs weekly:
- Collects metrics using the collector script
- Posts summary to GitHub Actions
- Alerts if over budget
- Optionally sends Slack notification

**Schedule:** Monday 9 AM UTC

**Manual trigger:**
```bash
gh workflow run ci-metrics.yml --field notify_slack=true
```

## Metrics Tracked

### Workflow-Level Metrics

| Metric | Description |
|--------|-------------|
| `total_runs` | Number of runs in period |
| `successful_runs` | Runs that completed successfully |
| `failed_runs` | Runs that failed |
| `cancelled_runs` | Runs that were cancelled |
| `success_rate` | Percentage of successful runs |
| `avg_duration_minutes` | Average run duration |
| `total_minutes` | Total minutes consumed |

### Aggregate Metrics

| Metric | Description |
|--------|-------------|
| `total_workflow_runs` | Total runs across all workflows |
| `total_minutes_used` | Total minutes in period |
| `estimated_monthly_minutes` | Projected monthly usage |

## Alerting

### Over-Budget Warning

When estimated monthly minutes exceed 3,000:
- GitHub Actions warning annotation
- Slack notification (if webhook configured)
- Non-zero exit code

### Slack Integration

Configure `SLACK_WEBHOOK_URL` secret for notifications:
- Weekly summary (if enabled)
- Over-budget alerts (automatic)

## Dashboards

### GitHub Actions Summary

Each ci-metrics run produces a summary visible in the GitHub Actions UI:

```markdown
## CI Metrics Report

**Period:** 2026-01-11 to 2026-01-18

### Summary
| Metric | Value |
|--------|-------|
| Total Workflow Runs | 150 |
| Total Minutes Used | 520 |
| Estimated Monthly Minutes | 2,228 |
| Budget (3,000 min/month) | 74% |

### Workflow Breakdown
...
```

### Artifacts

Metrics are saved as artifacts for historical analysis:
- `metrics.json` - Raw JSON data
- `metrics-output.txt` - Full output
- Retention: 90 days

## Future Enhancements

### Planned

1. **Trend analysis** - Week-over-week comparison
2. **Failure categorization** - Group failures by type
3. **Cost attribution** - Minutes per team/feature

### Considered

1. **Grafana dashboard** - Visual metrics display
2. **PagerDuty integration** - Critical alerts
3. **Custom metrics** - Test duration, coverage trends
