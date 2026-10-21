# CI Workflow Inventory

This document provides a complete inventory of all GitHub Actions workflows in the Ferni monorepo.

## Summary

| Category | Count | Total Est. Monthly Minutes |
|----------|-------|---------------------------|
| Core CI | 1 | ~2,200 (optimized) |
| Deploy | 5 | ~500 |
| Quality | 6 | ~300 |
| Scheduled | 4 | ~100 |
| **Total** | **16** | **~3,100** |

## Core CI Workflows

### ci.yml (Primary)

**Purpose:** Main CI pipeline - lint, test, build, security scan

| Property | Value |
|----------|-------|
| Trigger | Push/PR to main, develop (with path filters) |
| Runner | Self-hosted (GCE) |
| Jobs | 11 parallel jobs |
| Duration | ~10 min (optimized from ~22 min) |
| Monthly Runs | ~200 |

**Jobs:**
- `lint` - TypeScript type check + ESLint
- `test-unit` - Unit tests with coverage
- `test-integration` - Integration tests
- `test-agi-features` - AGI feature tests
- `build` - Backend + design system + frontend
- `security` - Dependency audit + secret scan
- `code-quality` - Unified audit metrics
- `quality-gates` - Blocking quality thresholds
- `validation` - Voice and integration validation
- `frontend-quality` - Frontend-specific checks
- `dependencies` - Outdated dependency check

**Optimizations Applied:**
- Path filters (70% reduction in unnecessary runs)
- Concurrency control (cancel-in-progress)
- Composite action (DRY setup)
- pnpm v10 standardization

## Deploy Workflows

### deploy-production.yml

**Purpose:** Blue-green deployment to production

| Property | Value |
|----------|-------|
| Trigger | push to main whose tree the merge queue tested; CI success on a push to main (workflow_run); manual |
| Runner | ubuntu-24.04, one job |
| Duration | ~15 min |

### deploy-firebase.yml

**Purpose:** Deploy frontend to Firebase Hosting

| Property | Value |
|----------|-------|
| Trigger | Manual |
| Runner | ubuntu-latest |
| Duration | ~5 min |

### build.yml

**Purpose:** The required `Build & Test` check. Builds the backend, design system, web app and UI server image, then starts the image and waits for `/health`.

| Property | Value |
|----------|-------|
| Trigger | Merge queue (on PRs it's skipped and reports success, #1250) |
| Runner | `CI_PR_RUNNER` / `CI_RUNNER` |

### staging.yml

**Purpose:** Cloud Run preview of a PR (`staging-pr-<n>`). Nothing required runs here.

| Property | Value |
|----------|-------|
| Trigger | PR with the `preview` label (adding it deploys, pushes redeploy), or manual |
| Runner | ubuntu-latest |

### deploy-worker.yml

**Purpose:** Deploy background workers

| Property | Value |
|----------|-------|
| Trigger | Manual |
| Runner | ubuntu-latest |
| Duration | ~8 min |

## Quality Workflows

### design-system.yml

**Purpose:** Validate design tokens, build packages

| Property | Value |
|----------|-------|
| Trigger | Push/PR touching design-system/* |
| Runner | ubuntu-latest |
| Duration | ~5 min |

### chromatic.yml

**Purpose:** Visual regression testing with Chromatic

| Property | Value |
|----------|-------|
| Trigger | Push/PR touching design-system/* |
| Runner | ubuntu-latest |
| Duration | ~3 min |

### bth-benchmarks.yml

**Purpose:** Better-Than-Human capability benchmarks

| Property | Value |
|----------|-------|
| Trigger | Weekly, PR touching BTH code |
| Runner | ubuntu-latest |
| Duration | ~5 min |

### lighthouse-ci.yml

**Purpose:** Accessibility and performance audits

| Property | Value |
|----------|-------|
| Trigger | Weekly, PR touching promo/* |
| Runner | ubuntu-latest |
| Duration | ~4 min |

### security-scan.yml

**Purpose:** Dependency and code security scanning

| Property | Value |
|----------|-------|
| Trigger | Daily, PR touching code |
| Runner | ubuntu-latest |
| Duration | ~3 min |

### token-check.yml

**Purpose:** Validate design token drift

| Property | Value |
|----------|-------|
| Trigger | PR touching design-system/* |
| Runner | ubuntu-latest |
| Duration | ~2 min |

## Scheduled Workflows

### ci-metrics.yml

**Purpose:** Weekly CI metrics collection and reporting

| Property | Value |
|----------|-------|
| Trigger | Weekly (Monday 9 AM UTC), manual |
| Runner | ubuntu-latest |
| Duration | ~2 min |

### error-alerting.yml

**Purpose:** Monitor and alert on error patterns

| Property | Value |
|----------|-------|
| Trigger | Scheduled |
| Runner | ubuntu-latest |
| Duration | ~1 min |

### uptime-monitor.yml

**Purpose:** Health check monitoring

| Property | Value |
|----------|-------|
| Trigger | Every 5 min |
| Runner | ubuntu-latest |
| Duration | ~30 sec |

### cost-alerts.yml

**Purpose:** GCP cost monitoring and alerts

| Property | Value |
|----------|-------|
| Trigger | Daily |
| Runner | ubuntu-latest |
| Duration | ~1 min |

## Optimization Status

| Workflow | Path Filters | Concurrency | Composite Action | pnpm v10 |
|----------|-------------|-------------|------------------|----------|
| ci.yml | ✅ | ✅ | ✅ | ✅ |
| design-system.yml | ✅ | ❌ | ❌ | ✅ |
| chromatic.yml | ✅ | ❌ | ❌ | ✅ |
| bth-benchmarks.yml | ✅ | ❌ | ❌ | ✅ |
| lighthouse-ci.yml | ✅ | ❌ | ✅ | ✅ |
| security-scan.yml | ✅ | ❌ | ✅ | ✅ |

## Next Steps

1. Add concurrency control to remaining workflows
2. Migrate remaining workflows to use composite action
3. Consider consolidating quality workflows
4. Evaluate Nx for affected-only testing
