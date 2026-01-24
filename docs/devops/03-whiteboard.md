# CI/CD Whiteboarding Session

> **Date**: 2026-01-24
> **Participants**: DevOps, Platform, AI Engineering, SRE (simulated multi-agent)
> **Goal**: Converge on target CI/CD architecture decisions

---

## 1. Goals & Success Metrics

### Primary Goals

| Goal | Metric | Current | Target |
|------|--------|---------|--------|
| Fast PR feedback | PR gate duration | ~10 min | < 8 min |
| Cost efficiency | Monthly minutes | ~2,200 | < 2,000 |
| Cache effectiveness | Cache hit rate | ~80% | > 90% |
| Agent success | Agent CI pass rate | Unknown | > 95% |
| Reliability | CI flake rate | Unknown | < 2% |

### Secondary Goals

- Agent-first ergonomics (predictable, documented)
- Rollback within 5 minutes
- Observable (dashboards, alerts)

---

## 2. Pipeline Layers Design

### Layer 1: Fast PR Gate (BLOCKING)

**Trigger**: PR opened/updated to main, develop
**Target Duration**: < 8 minutes
**Runner**: Self-hosted (cost savings)

| Job | Duration | Blocking? |
|-----|----------|-----------|
| lint + typecheck | 2 min | Yes |
| test-unit | 2 min | Yes |
| quality-gates | 1 min | Yes |
| security-scan | 1 min | Yes |
| **Total** | **~6 min** | |

**Decision**: Remove integration tests from PR gate; run on main only.

### Layer 2: Main Branch Build (BLOCKING)

**Trigger**: Push to main
**Target Duration**: < 12 minutes

| Job | Duration | Blocking? |
|-----|----------|-----------|
| All PR gate jobs | 6 min | Yes |
| test-integration | 3 min | Yes |
| test-agi-features | 2 min | Yes |
| build | 3 min | Yes |
| e2e-validation | 3 min | No (warning) |

**Decision**: Integration tests gate main, but e2e-validation is non-blocking (async feedback).

### Layer 3: Staging Deploy

**Trigger**: PR to main (only after PR gate passes)
**Target Duration**: < 10 minutes

**Decision**: Gate staging deploy on PR gate success. No deploy if CI fails.

### Layer 4: Production Deploy

**Trigger**: Push to main (after main build passes)
**Target Duration**: < 15 minutes

**Decision**: Keep current blue-green deploy with health checks.

### Layer 5: Nightly Deep Validation

**Trigger**: Daily at 3 AM UTC
**Target Duration**: < 60 minutes

| Job | Purpose |
|-----|---------|
| Full test suite | All 1,100 tests |
| BTH benchmarks | Capability regression |
| Security deep scan | Full dependency audit |
| Performance budget | Lighthouse, bundle size |
| Build all platforms | iOS, Electron, Rust |

**Decision**: Move expensive jobs (macOS builds, deep scans) to nightly. Don't block PRs.

---

## 3. Affected Build Strategy

### Current State

- Path filters on ci.yml (basic)
- No dependency graph
- No incremental builds

### Decision: Phased Adoption

| Phase | Tooling | Timeline |
|-------|---------|----------|
| Phase 1 | Improve path filters | Immediate |
| Phase 2 | Add Turborepo for caching | 4 weeks |
| Phase 3 | Evaluate Nx (if >30 packages) | Future |

**Rationale**: Turborepo is lower friction than Nx, provides remote caching and affected detection without full buy-in.

### Path Filter Strategy

```yaml
# Tier 1: Fast PR gate - only code changes
paths:
  - 'src/**'
  - 'apps/web/**'
  - 'apps/cli/**'
  - 'packages/**'
  - '*.json'
  - '*.yaml'

# Tier 2: Design system - only design changes
paths:
  - 'design-system/**'
  - 'apps/web/src/config/*.generated.*'

# Tier 3: Platform builds - only platform code
paths:
  - 'apps/ios-native/**'
  - 'apps/rust-*/**'
  - 'apps/electron/**'
```

---

## 4. Caching & Artifact Reuse

### Current Cache Strategy

| Cache | Key | Scope |
|-------|-----|-------|
| node_modules | `pnpm-lock.yaml` hash | Per-run |
| pnpm store | Automatic | Per-job |

### Decision: Enhanced Caching

| Cache | Key | Scope | New? |
|-------|-----|-------|------|
| node_modules | `pnpm-lock.yaml` hash | Shared across jobs | Existing |
| Build artifacts | `src/**` hash | Across workflows | **New** |
| Design system dist | `design-system/**` hash | Across workflows | **New** |
| Rust target | `Cargo.lock` + rust-version | Per-workflow | **New** |
| ONNX models | Version manifest | Global | **New** |

### Artifact Reuse Pattern

```yaml
# Build job uploads
- uses: actions/upload-artifact@v4
  with:
    name: dist-${{ github.sha }}
    path: dist/

# Deploy job downloads
- uses: actions/download-artifact@v4
  with:
    name: dist-${{ github.sha }}
```

**Decision**: Build once, download everywhere. Eliminate duplicate design system builds.

---

## 5. Agent-First Workflow Design

### Agent Contract

| Principle | Implementation |
|-----------|----------------|
| Predictable | Document all triggers, gates, timeouts |
| Fast feedback | < 8 min PR gate |
| Clear errors | Structured error messages with fix hints |
| Self-healing | Auto-retry flaky tests once |
| Observable | Agent success metrics dashboard |

### Agent-Friendly Features

1. **Structured CI output**: JSON summary artifact for agent parsing
2. **Fix suggestions**: Lint errors include auto-fix commands
3. **Flake detection**: Mark tests as flaky, allow agent to retry
4. **Cost awareness**: Show PR cost estimate in comment

### Agent Guardrails

| Guardrail | Implementation |
|-----------|----------------|
| No manual deploys | Auto-deploy on green main |
| No force push | Branch protection |
| No skip CI | `[skip ci]` blocked on main |
| Required checks | PR gate must pass to merge |

---

## 6. Shadow Experiments

### Approved for Implementation

| Experiment | Owner | Timeline | Success Criteria |
|------------|-------|----------|------------------|
| Flake Dashboard | SRE | 2 weeks | Identify top 10 flaky tests |
| Budget Alerting | DevOps | 1 week | Slack alert at 80% budget |
| CI Summary Artifact | Platform | 1 week | JSON file in every run |

### Approved for POC (Non-Production)

| Experiment | Owner | Timeline | Goal |
|------------|-------|----------|------|
| Turborepo POC | Arch | 4 weeks | Measure build speedup |
| Semantic Test Selection | AI | 6 weeks | LLM picks relevant tests |
| Cost-per-PR Comments | DevOps | 3 weeks | Show cost in PR comments |

### Deferred (Not Now)

| Idea | Reason | Revisit When |
|------|--------|--------------|
| Nx adoption | High migration effort | >30 packages |
| Kubernetes runners | Overkill for scale | CI queue >5 min |
| Full GitOps | Infra investment | Team >10 engineers |

---

## 7. Rollback-by-Design

### Current State

- Manual rollback workflow exists
- No auto-rollback on failure
- Rollback takes ~5 min

### Decision: Enhanced Rollback

| Scenario | Action | Timeline |
|----------|--------|----------|
| Health check fails | Auto-rollback to previous | Immediate |
| Error rate spikes | Alert + manual rollback | 2 weeks (monitoring) |
| Deploy timeout | Keep previous version | Existing |

### Rollback Contract

```
deploy-production.yml:
  1. Deploy new version with 0% traffic
  2. Run health check
  3. If pass: shift traffic
  4. If fail: delete new revision, keep old
  5. Monitor error rate for 5 min
  6. If spike: alert Slack, suggest rollback
```

---

## Decisions Summary

### Locked In (Implement Now)

| Decision | Rationale | Owner |
|----------|-----------|-------|
| Add concurrency to all 30 workflows | Prevent pile-ups, save minutes | DevOps |
| Add path filters to staging.yml | 30% savings | DevOps |
| Gate staging on PR gate success | Don't deploy broken code | Platform |
| Split fast PR gate from heavy jobs | < 8 min feedback | Platform |
| Standardize composite action | Consistency | DevOps |
| Add CI summary artifact | Agent parsing | Platform |
| Budget alert at 80% | Proactive cost control | DevOps |

### Approved with Conditions

| Decision | Condition | Owner |
|----------|-----------|-------|
| Turborepo adoption | POC shows >30% build speedup | Arch |
| Move integration tests to main-only | Flake rate < 5% first | SRE |
| Auto-rollback on health failure | Monitoring in place first | SRE |

### Explicitly Rejected

| Idea | Reason |
|------|--------|
| Nx adoption now | Migration effort too high for current scale |
| Remove self-hosted runner | Cost savings too valuable |
| Skip integration tests on PRs entirely | Risk of shipping broken code |
| Kubernetes runners | Overkill |

---

## Next Steps

1. **Week 1**: Quick wins (concurrency, path filters, composite standardization)
2. **Week 2**: CI summary artifact, budget alerting
3. **Week 3-4**: Turborepo POC
4. **Month 2**: Evaluate POC results, decide on broader adoption

---

*Whiteboard session concluded with consensus on all major decisions.*
