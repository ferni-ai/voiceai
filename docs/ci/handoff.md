# CI/CD Handoff Document

This document provides context for anyone taking over CI/CD maintenance.

## Quick Start

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Primary CI pipeline |
| `.github/actions/setup-node-pnpm/action.yml` | Shared setup composite action |
| `.github/workflows/ci-metrics.yml` | Weekly metrics collection |
| `scripts/devops/collect_ci_metrics.ts` | Metrics collector script |
| `docs/ci/` | This documentation |

### Common Tasks

#### Run CI locally
```bash
pnpm quality        # Full quality check
pnpm typecheck      # TypeScript only
pnpm test           # Unit tests
pnpm build          # Build all
```

#### Check CI status
```bash
gh run list --workflow=ci.yml
gh run view <run-id>
```

#### View CI metrics
```bash
npx tsx scripts/devops/collect_ci_metrics.ts
```

#### Trigger workflow manually
```bash
gh workflow run ci.yml
gh workflow run ci-metrics.yml --field notify_slack=true
```

## Architecture

### Workflow Hierarchy

```
ci.yml (primary)
├── lint
├── test-unit
├── test-integration
├── test-agi-features
├── build (depends on above)
├── security
├── code-quality
├── quality-gates
├── validation
├── frontend-quality
└── dependencies

deploy-production.yml
├── Uses reusable-design-system.yml
└── Deploys to GCE/Firebase

ci-metrics.yml (scheduled)
└── Collects and reports metrics
```

### Composite Action

`.github/actions/setup-node-pnpm/action.yml` is used by all workflows:

```yaml
- name: Setup Node.js and pnpm
  uses: ./.github/actions/setup-node-pnpm
  with:
    node-version: '20'      # Optional, defaults to 20
    pnpm-version: '10'      # Optional, defaults to 10
    install-deps: 'true'    # Optional, defaults to true
    frozen-lockfile: 'false' # Optional, use true for CI
```

### Path Filters

ci.yml only runs when these paths change:
- `src/**`
- `apps/**`
- `packages/**`
- `design-system/**`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig*.json`
- `.github/workflows/ci.yml`
- `.github/actions/**`

## Troubleshooting

### CI not running on push

**Symptoms:** Push to main/develop but CI doesn't trigger

**Causes:**
1. Only docs/config files changed (path filters working correctly)
2. Workflow file syntax error
3. GitHub Actions outage

**Resolution:**
1. Check if changes match path filters
2. Validate workflow YAML: `gh workflow view ci.yml`
3. Check GitHub Status: https://www.githubstatus.com/

### CI taking too long

**Symptoms:** CI runs exceed 15 minutes

**Causes:**
1. Node modules not cached
2. Multiple CI runs piling up
3. Slow tests

**Resolution:**
1. Verify pnpm cache is working (check cache hit rate)
2. Ensure concurrency is configured
3. Profile slow tests: `pnpm test -- --reporter=verbose`

### pnpm install fails

**Symptoms:** "ERR_PNPM_FROZEN_LOCKFILE" or dependency errors

**Causes:**
1. Lock file out of sync
2. Local file: dependencies not fixed
3. pnpm version mismatch

**Resolution:**
1. Regenerate lockfile: `pnpm install`
2. Check composite action is fixing local deps
3. Verify pnpm version matches across workflows

### Self-hosted runner issues

**Symptoms:** Jobs stuck in queue or failing on self-hosted

**Causes:**
1. Runner offline
2. Disk full
3. Docker issues

**Resolution:**
```bash
# Check runner status
ferni runner status

# Restart runner
ferni runner restart

# Clean up disk
ferni disk clean
```

## Contacts

| Area | Contact |
|------|---------|
| CI/CD | DevOps team |
| GitHub Actions | GitHub Support |
| Self-hosted runner | Platform team |

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-18 | Initial DevOps refactor | Claude |
| | - Added path filters to ci.yml | |
| | - Added concurrency control | |
| | - Standardized pnpm to v10 | |
| | - Created composite action | |
| | - Created observability tooling | |
