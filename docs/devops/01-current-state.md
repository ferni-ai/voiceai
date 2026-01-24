# CI/CD Current State Inventory

> **Date**: 2026-01-24
> **Total Workflows**: 36
> **Monthly Minutes Budget**: 3,000
> **Estimated Current Usage**: ~2,200/month (after recent optimizations)

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Total workflows | 36 | High complexity |
| With path filters | 18 (50%) | Needs expansion |
| With concurrency control | 6 (17%) | Major gap |
| Using composite action | 4 (11%) | Major gap |
| Self-hosted runner jobs | 12 | Good (cost savings) |
| PR gate duration | ~10 min | Acceptable |

## Workflow Inventory

### Tier 1: Core CI (High Impact)

| Workflow | Trigger | Runner | Duration | Path Filters | Concurrency | Composite |
|----------|---------|--------|----------|--------------|-------------|-----------|
| `ci.yml` | push/PR main,develop | self-hosted | ~10 min | ✅ | ✅ | ✅ |
| `staging.yml` | PR to main | ubuntu-latest | ~12 min | ❌ | ❌ | ❌ |
| `deploy-production.yml` | push main | ubuntu-latest | ~15 min | ❌ | ❌ | ❌ |
| `deploy-gce.yml` | manual/workflow_call | self-hosted | ~10 min | ❌ | ✅ | ❌ |

### Tier 2: Quality & Testing

| Workflow | Trigger | Runner | Duration | Path Filters | Concurrency |
|----------|---------|--------|----------|--------------|-------------|
| `agent-e2e.yml` | push/PR | ubuntu-latest | ~8 min | ✅ | ✅ |
| `e2e-tests.yml` | PR | ubuntu-latest | ~15 min | ✅ | ❌ |
| `data-layer-e2e.yml` | push/PR | ubuntu-latest | ~5 min | ✅ | ❌ |
| `stage-direction-tests.yml` | push/PR | ubuntu-latest | ~3 min | ✅ | ❌ |
| `bth-benchmarks.yml` | weekly/PR | ubuntu-latest | ~5 min | ✅ | ❌ |

### Tier 3: Design System & Frontend

| Workflow | Trigger | Runner | Duration | Path Filters | Concurrency |
|----------|---------|--------|----------|--------------|-------------|
| `design-system.yml` | push/PR | ubuntu-latest | ~5 min | ✅ | ❌ |
| `chromatic.yml` | push/PR | ubuntu-latest | ~3 min | ✅ | ❌ |
| `token-check.yml` | push/PR | ubuntu-latest | ~2 min | ✅ | ❌ |
| `lighthouse-ci.yml` | weekly/PR | ubuntu-latest | ~4 min | ✅ | ❌ |
| `performance-budget.yml` | PR | ubuntu-latest | ~3 min | ✅ | ❌ |
| `brand-compliance.yml` | push/PR | ubuntu-latest | ~2 min | ✅ | ❌ |

### Tier 4: Native/Platform Builds

| Workflow | Trigger | Runner | Duration | Path Filters | Concurrency |
|----------|---------|--------|----------|--------------|-------------|
| `build-apps.yml` | push/manual | macos-latest | ~20 min | ❌ | ✅ |
| `rust-native.yml` | push/PR | ubuntu-latest | ~5 min | ✅ | ❌ |

### Tier 5: Security & Monitoring

| Workflow | Trigger | Runner | Duration | Path Filters | Concurrency |
|----------|---------|--------|----------|--------------|-------------|
| `security-scan.yml` | daily/PR | ubuntu-latest | ~3 min | ✅ | ❌ |
| `cost-alerts.yml` | daily | ubuntu-latest | ~1 min | ❌ | ❌ |
| `uptime-monitor.yml` | manual | ubuntu-latest | ~30 sec | ❌ | ❌ |
| `error-alerting.yml` | manual | ubuntu-latest | ~1 min | ❌ | ❌ |
| `incident-response.yml` | manual | ubuntu-latest | ~2 min | ❌ | ❌ |

### Tier 6: Deploy & Release

| Workflow | Trigger | Runner | Duration | Path Filters | Concurrency |
|----------|---------|--------|----------|--------------|-------------|
| `deploy-firebase.yml` | push/manual | ubuntu-latest | ~5 min | ❌ | ❌ |
| `deploy-worker.yml` | push/manual | ubuntu-latest | ~8 min | ✅ | ❌ |
| `auto-deploy.yml` | push/manual | ubuntu-latest | ~5 min | ❌ | ✅ |
| `rollback.yml` | manual | ubuntu-latest | ~3 min | ❌ | ❌ |
| `feature-rollout.yml` | manual | ubuntu-latest | ~2 min | ❌ | ❌ |

### Tier 7: Automation & Ops

| Workflow | Trigger | Runner | Duration | Path Filters | Concurrency |
|----------|---------|--------|----------|--------------|-------------|
| `ai-automation.yml` | PR | ubuntu-latest | ~3 min | ❌ | ❌ |
| `ci-metrics.yml` | weekly/manual | ubuntu-latest | ~2 min | ❌ | ❌ |
| `devops-dashboard.yml` | hourly/manual | ubuntu-latest | ~2 min | ❌ | ✅ |
| `changelog.yml` | push/manual | ubuntu-latest | ~2 min | ❌ | ❌ |
| `dev-blog-changelog.yml` | manual | ubuntu-latest | ~2 min | ❌ | ❌ |
| `sdk-publish.yml` | push/manual | ubuntu-latest | ~5 min | ✅ | ❌ |
| `sync-template-repo.yml` | push/manual | ubuntu-latest | ~2 min | ✅ | ❌ |
| `i18n-check.yml` | push/PR | ubuntu-latest | ~2 min | ✅ | ❌ |
| `reusable-design-system.yml` | workflow_call | ubuntu-latest | ~3 min | N/A | N/A |

## PR vs Main vs Staging Behavior

```
                    ┌─────────────────┐
                    │   Pull Request  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   ┌─────────┐         ┌──────────┐        ┌───────────┐
   │ ci.yml  │         │ staging  │        │ Quality   │
   │ (gate)  │         │ preview  │        │ Workflows │
   └────┬────┘         └────┬─────┘        └─────┬─────┘
        │                   │                    │
        │ ~10 min           │ ~12 min            │ ~5-15 min
        │                   │                    │
        └───────────────────┴────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Merge to Main  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   ┌─────────┐         ┌──────────┐        ┌───────────┐
   │ ci.yml  │         │ deploy-  │        │ changelog │
   │ (full)  │         │production│        │ auto-     │
   └─────────┘         └──────────┘        │ deploy    │
                                           └───────────┘
```

## Cost Drivers Analysis

### Top 5 Minute Consumers (Estimated Monthly)

| Workflow | Runs/Month | Min/Run | Total Min | % of Budget |
|----------|------------|---------|-----------|-------------|
| ci.yml | ~60 | 10 | 600 | 20% |
| staging.yml | ~80 | 12 | 960 | 32% |
| build-apps.yml | ~10 | 20 | 200 | 7% |
| deploy-production.yml | ~30 | 15 | 450 | 15% |
| e2e-tests.yml | ~40 | 15 | 600 | 20% |
| **Total** | | | **2,810** | **94%** |

### Cost Inefficiencies Identified

| Issue | Impact | Fix |
|-------|--------|-----|
| staging.yml runs on ALL PRs | ~500 wasted min/month | Add path filters |
| No concurrency on staging.yml | Duplicate runs pile up | Add cancel-in-progress |
| build-apps.yml runs on every push | ~100 wasted min/month | Trigger only on tags/releases |
| 30 workflows without concurrency | Race conditions, waste | Add concurrency groups |
| Design system built 3x per deploy | ~30 min/deploy wasted | Use reusable workflow |

## Complexity Hotspots for Agents

| Hotspot | Why It's Hard for Agents | Mitigation |
|---------|--------------------------|------------|
| 36 workflow files | Hard to know which runs | Document trigger rules |
| Inconsistent setup | Some use composite, most don't | Standardize all workflows |
| Flaky e2e-tests | Non-deterministic failures | Quarantine or fix flaky tests |
| Long staging deploys | Slow feedback | Add fast PR gate check |
| Manual deploy workflows | Agents can't trigger | Auto-deploy on green main |

## Self-Hosted Runner Analysis

| Runner | Location | Jobs Using It | Benefits |
|--------|----------|---------------|----------|
| `self-hosted, Linux, X64, gce` | GCE VM | ci.yml (12 jobs), deploy-gce.yml | $0 minutes cost |

**Recommendation**: Migrate more workflows to self-hosted runner to reduce GitHub Actions billing.

## Caching Analysis

### Current Cache Usage

| Cache | Key Strategy | Scope | Hit Rate (Est.) |
|-------|--------------|-------|-----------------|
| node_modules | `pnpm-lock.yaml` hash | Per-workflow run | ~90% |
| pnpm store | Automatic via action | Per-job | ~80% |
| Build artifacts | None | N/A | 0% |
| Rust target | `Cargo.lock` hash | Per-workflow | ~70% |

### Cache Gaps

| Gap | Impact | Fix |
|-----|--------|-----|
| No build artifact reuse | Rebuild on each deploy | Upload/download artifacts |
| Cache not shared across workflows | Duplicate installs | Use shared cache keys |
| No remote caching (Turborepo/Nx) | Full rebuilds | Evaluate remote cache |

## Optimization Status Matrix

| Optimization | ci.yml | staging | deploy-prod | Others |
|--------------|--------|---------|-------------|--------|
| Path filters | ✅ | ❌ | ❌ | 50% |
| Concurrency | ✅ | ❌ | ❌ | 17% |
| Composite action | ✅ | ❌ | ❌ | 11% |
| Self-hosted | ✅ | ❌ | ❌ | 3% |
| Build caching | ✅ | ❌ | ❌ | 10% |

## Key Findings

### What Works Well

1. **ci.yml is well-optimized** - path filters, concurrency, shared cache, self-hosted
2. **Self-hosted runner** - saves significant billing minutes
3. **Composite action exists** - ready for broader adoption
4. **Path filters on quality workflows** - prevents unnecessary runs

### Biggest Pain Points

1. **30/36 workflows lack concurrency** - causes pile-ups and wasted minutes
2. **staging.yml runs on ALL PRs** - no path filtering
3. **Inconsistent setup** - only 4 workflows use composite action
4. **No affected-only builds** - entire monorepo rebuilds on changes
5. **build-apps.yml too aggressive** - builds iOS on every push

### Immediate Opportunities

| Opportunity | Effort | Impact | Blocked By |
|-------------|--------|--------|------------|
| Add concurrency to all workflows | Low | ~20% savings | Nothing |
| Add path filters to staging.yml | Low | ~30% savings | Nothing |
| Migrate more jobs to self-hosted | Medium | ~40% savings | Runner capacity |
| Use reusable design system workflow | Medium | ~5% savings | Nothing |
| Evaluate Nx/Turborepo | High | ~50% savings | Time investment |

---

*Generated from automated analysis of `.github/workflows/*.yml`*
