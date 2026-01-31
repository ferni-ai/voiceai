# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD automation.

## CI Health Gate

The `ci-health-gate.yml` workflow is a **circuit breaker** that prevents wasted compute when CI is broken.

### How It Works

1. Checks recent CI run history (default: last 2 hours)
2. If failures exceed threshold (default: 3), blocks new runs
3. Prevents cascade of failing jobs that waste compute credits

### Integration

Add as a prerequisite job to any expensive workflow:

```yaml
jobs:
  health-gate:
    name: CI Health Gate
    uses: ./.github/workflows/ci-health-gate.yml
    with:
      failure-threshold: 3      # Block after 3 failures
      lookback-hours: 2         # Check last 2 hours
      bypass-label: 'ci:force-run'  # PR label to bypass

  build:
    name: Build
    needs: [health-gate]
    if: always() && (needs.health-gate.outputs.status == 'healthy' || needs.health-gate.outputs.status == 'degraded' || needs.health-gate.outputs.status == 'bypassed')
    runs-on: ubuntu-latest
    steps:
      # Your build steps...
```

### Bypass Options

When you need to force-run CI despite failures:

1. **PR Label**: Add `ci:force-run` label to your PR
2. **Commit Message**: Include `[ci:force]` in your commit message

### Status Values

| Status | Description | Action |
|--------|-------------|--------|
| `healthy` | All recent runs successful | Proceed normally |
| `degraded` | Some failures, but below threshold | Proceed with caution |
| `blocked` | Too many failures | Blocked (fix CI first) |
| `bypassed` | Bypass triggered | Proceed (admin override) |

## Key Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to main/develop | Lint, typecheck, test, build |
| `deploy-production.yml` | Push to main | Deploy to production |
| `rust-native.yml` | Changes to Rust code | Build native modules |
| `performance-budget.yml` | PR with frontend changes | Bundle size checks |
| `design-system.yml` | Changes to design tokens | Token validation |

## Composite Actions

Located in `.github/actions/`:

| Action | Purpose |
|--------|---------|
| `setup-node-pnpm` | Consistent Node.js + pnpm setup with dependency caching |

## Best Practices

1. **Path Filters**: Only run workflows when relevant files change
2. **Concurrency**: Use `concurrency` to cancel redundant runs
3. **Caching**: Use composite actions for consistent caching
4. **Health Gate**: Use for expensive jobs to prevent waste
5. **Timeouts**: Set reasonable `timeout-minutes` on all jobs
