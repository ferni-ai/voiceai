# CI Minute Usage Analysis

This document analyzes GitHub Actions minute usage and optimization opportunities.

## Current State (Before Optimization)

| Metric | Value |
|--------|-------|
| Estimated Monthly Minutes | ~5,400 |
| Budget | 3,000 |
| Over Budget | 80% |

### Primary Cost Drivers

1. **ci.yml with no path filters** (~70% of waste)
   - Runs on ANY push to main/develop
   - Including docs-only, config-only changes
   - Each run: 22 minutes × 11 jobs

2. **11 independent `pnpm install`** (~18 min overhead/run)
   - Each job does full dependency install
   - No shared setup or node_modules caching

3. **Design system built 3 times** (~6 min waste/deploy)
   - Once in ci.yml
   - Once in deploy workflows
   - Once in design-system.yml

4. **No concurrency control**
   - Multiple CI runs can pile up
   - Old runs not cancelled when new ones start

## Optimizations Applied

### P0 - Path Filters (ci.yml)

```yaml
paths:
  - 'src/**'
  - 'apps/**'
  - 'packages/**'
  - 'design-system/**'
  - 'package.json'
  - 'pnpm-lock.yaml'
  - 'tsconfig*.json'
  - '.github/workflows/ci.yml'
```

**Impact:** ~70% reduction in unnecessary runs

### P0 - Concurrency Control

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Impact:** Prevents parallel runs, cancels old runs

### P0 - pnpm v10 Standardization

All workflows now use pnpm v10 with `pnpm/action-setup@v4`

**Impact:** Consistent build behavior, no version drift

### P1 - Composite Action

`.github/actions/setup-node-pnpm/action.yml` encapsulates:
- pnpm setup
- Node.js setup with caching
- Local dependency fixes
- Dependency installation

**Impact:** DRY, consistent setup across all jobs

## Expected Savings

| Optimization | Estimated Savings |
|--------------|-------------------|
| Path filters | 1,000-1,200 min/month |
| Concurrency | 200-400 min/month |
| Composite action | 300-500 min/month |
| **Total** | **1,500-2,100 min/month** |

## Post-Optimization Projection

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| ci.yml runs | ~200/month | ~60/month | -70% |
| ci.yml duration | 22 min | 10 min | -55% |
| Monthly minutes | ~5,400 | ~2,200 | -60% |
| Budget usage | 180% | 73% | Under budget |

## Monitoring

Weekly metrics are collected via `ci-metrics.yml`:
- Total runs by workflow
- Duration trends
- Success rates
- Minute usage

Run manually:
```bash
npx tsx scripts/devops/collect_ci_metrics.ts
```

## Future Optimizations

### Not Yet Implemented

1. **Shared cache across jobs** (P1-2)
   - Use actions/cache to share node_modules
   - Potential additional 5-10 min savings per run

2. **Reusable design system workflow** (P1-3)
   - Build once, download artifact
   - Eliminates duplicate builds

3. **Conditional macOS builds**
   - Only build macOS on release tags
   - Save ~$1-2 per unnecessary build

### Deferred

1. **Nx for affected testing**
   - Only test changed packages
   - Significant savings but high implementation effort
   - Re-evaluate when package count > 15

2. **Self-hosted runner expansion**
   - Add more runners for parallelism
   - Consider when CI queue times increase
