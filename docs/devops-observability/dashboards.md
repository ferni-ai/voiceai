# DevOps Dashboards

This document describes the dashboard system for monitoring CI/CD health.

## Dashboard Overview

The DevOps dashboard provides real-time visibility into CI/CD metrics:

![Dashboard Preview](../../assets/devops-dashboard-preview.png)

### Key Metrics Displayed

| Metric | Description | Threshold |
|--------|-------------|-----------|
| Total Runs | Workflow runs in last 7 days | - |
| Minutes Used | CI minutes consumed | - |
| Est. Monthly | Projected monthly usage | < 3,000 |
| Budget Usage | Percentage of 3,000 min budget | < 100% |

### Workflow Table

Each workflow shows:
- **Runs**: Number of executions
- **Minutes**: Total minutes consumed
- **Avg**: Average duration per run
- **Success Rate**: Percentage of successful runs
- **Trend**: 📈 improving, ➡️ stable, 📉 declining

### Alert Levels

| Level | Color | Trigger |
|-------|-------|---------|
| Critical | Red | Budget > 100%, Success < 70% |
| Warning | Yellow | Budget > 80%, Success < 85% |
| Info | Blue | Informational notices |

## Generating the Dashboard

### Locally

```bash
# Set GitHub token
export GITHUB_TOKEN=your_token_here

# Generate dashboard
npx tsx scripts/devops/generate_dashboard.ts

# Open in browser
open ./dashboard/index.html
```

### Via GitHub Actions

```bash
# Manual trigger
gh workflow run devops-dashboard.yml

# With GitHub Pages publish
gh workflow run devops-dashboard.yml --field publish=true

# Check status
gh run list --workflow=devops-dashboard.yml
```

### Via Ferni CLI

```bash
# Generate dashboard
ferni ops dashboard

# Generate and open
ferni ops dashboard --open

# Publish to GitHub Pages
ferni ops dashboard --publish
```

## Automation

### Daily Generation

The `devops-dashboard.yml` workflow runs daily at 6 AM UTC:
1. Collects metrics from GitHub Actions API
2. Generates HTML dashboard
3. Uploads as artifact (always)
4. Deploys to GitHub Pages (if configured)
5. Sends Slack alert if critical issues

### Triggering After CI Metrics

The dashboard also regenerates when `ci-metrics.yml` completes:

```yaml
on:
  workflow_run:
    workflows: ["CI Metrics Collection"]
    types: [completed]
```

## Customization

### Changing Budget

Edit `scripts/devops/generate_dashboard.ts`:

```typescript
const budgetMinutes = 3000; // Change this value
```

### Adding Workflows to Ignore

Some workflows might not be relevant for minute tracking:

```typescript
const ignoredWorkflows = [
  'dependabot',
  'stale',
];
```

### Styling

The dashboard uses CSS variables for theming:

```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --accent: #e94560;
  --success: #4ade80;
  --warning: #fbbf24;
  --critical: #ef4444;
}
```

## GitHub Pages Deployment

To enable automatic publishing to GitHub Pages:

1. Go to repository Settings → Pages
2. Set Source to "GitHub Actions"
3. The dashboard will be available at:
   `https://<username>.github.io/<repo>/`

## Troubleshooting

### "GITHUB_TOKEN required" Error

Ensure the token is set:
```bash
export GITHUB_TOKEN=$(gh auth token)
```

### Empty Workflow Data

Workflows with no runs in the last 7 days are filtered out. Check:
```bash
gh run list --limit 10
```

### Dashboard Not Updating

Check the workflow status:
```bash
gh run list --workflow=devops-dashboard.yml
gh run view <run-id>
```

## Integration with Ferni CLI

The dashboard is accessible via the Ferni CLI:

```bash
# View current CI metrics
ferni ops metrics

# Generate dashboard
ferni ops dashboard

# View alerts only
ferni ops alerts
```

See `apps/cli/src/commands/ops/` for implementation.
