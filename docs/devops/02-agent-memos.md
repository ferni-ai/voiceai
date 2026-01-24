# Multi-Agent CI/CD Analysis

> **Date**: 2026-01-24
> **Methodology**: Simulated subagent analysis with scoped context per domain

---

## Agent A: DevOps/CI Specialist

**Focus**: GitHub Actions, caching, matrices, minutes optimization

### What Works

1. **ci.yml is well-optimized** - path filters, concurrency, shared node_modules cache
2. **Self-hosted runner** - saves ~40% on billing vs ubuntu-latest
3. **Composite action exists** - `.github/actions/setup-node-pnpm` ready for reuse
4. **Job parallelization** - 12 jobs run in parallel after setup

### Biggest Pain Points

1. **30/36 workflows lack concurrency control** - causes pile-ups
2. **Only 4 workflows use composite action** - inconsistent setups
3. **staging.yml has no path filters** - runs on ALL PRs
4. **Duplicate pnpm/node setup in each job** - repetitive YAML

### Cost/Complexity Risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| Budget overrun from staging.yml | High | Medium |
| Workflow sprawl (36 files) | High | Already happening |
| Cache invalidation storms | Medium | Low |

### Top 3 Improvements

1. **Add concurrency to all 30 remaining workflows** - Immediate, ~10% savings
2. **Add path filters to staging.yml** - Immediate, ~30% savings
3. **Standardize all workflows to use composite action** - Medium effort, consistency

### Shadow Experiment Ideas

1. **CI Copilot**: Bot that suggests workflow fixes on PRs editing `.github/`
2. **Cache Analytics**: Track cache hit/miss rates per workflow, alert on degradation
3. **Minute Budget Alerts**: Slack alert when 80% of monthly budget consumed

---

## Agent B: Monorepo Architecture

**Focus**: Affected builds, repo graphing, package dependencies

### What Works

1. **Clear package structure** - 20+ packages in `apps/`, `packages/`, `tools/`
2. **Path filters on ci.yml** - basic affected detection exists
3. **Shared types package** - `packages/shared-types` reduces duplication

### Biggest Pain Points

1. **No true affected-only builds** - changing one file rebuilds everything
2. **No dependency graph tooling** - can't determine what changed affects what
3. **Design system rebuilt 3x per deploy** - no artifact reuse
4. **Test discovery is flat** - 1,100 test files, no package-scoped test sets

### Cost/Complexity Risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| Build times grow with repo size | High | Inevitable |
| Test flakiness increases | Medium | Medium |
| Agent confusion on what to test | High | Already happening |

### Top 3 Improvements

1. **Implement workspace-aware test commands** - `pnpm test --filter=...changed`
2. **Add Turborepo for incremental builds** - remote caching, affected detection
3. **Create package dependency graph visualization** - aid debugging

### Shadow Experiment Ideas

1. **Semantic Change Detection**: Use LLM to classify PRs as "docs-only", "backend-only", etc.
2. **Dynamic Test Selection**: Only run tests for packages with changed dependencies
3. **Build Graph Dashboard**: Visualize what rebuilds when, identify hotspots

---

## Agent C: AI Engineering

**Focus**: CI for models, evals, agent workflows

### What Works

1. **AGI feature tests exist** - `test-agi-features` job in ci.yml
2. **BTH benchmarks workflow** - weekly capability evaluation
3. **AI automation workflow** - some agent-aware tooling

### Biggest Pain Points

1. **No model versioning in CI** - ONNX models downloaded at runtime
2. **No eval regression gates** - model quality not blocking
3. **Agent success rate not tracked** - no metrics on agent CI failures
4. **Flaky tests from LLM non-determinism** - hard to debug

### Cost/Complexity Risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| Model regression ships undetected | High | Medium |
| Agent CI failures blamed on infra | Medium | Already happening |
| Eval costs explode | Medium | Low (rate-limited) |

### Top 3 Improvements

1. **Add eval gates** - block merge if BTH benchmarks regress >5%
2. **Track agent CI success rate** - dashboard showing agent vs human success
3. **Cache ONNX models** - don't download 90MB on every test run

### Shadow Experiment Ideas

1. **AI-Assisted Flake Triage**: LLM analyzes test logs, suggests fixes
2. **Semantic Test Selection**: LLM determines which tests are relevant to PR
3. **Eval-as-a-Service**: Async eval pipeline that doesn't block PRs

---

## Agent D: Distributed Systems

**Focus**: Integration tests, determinism, test isolation

### What Works

1. **Integration tests isolated** - separate `test-integration` job
2. **E2E validation exists** - `e2e-validation` job covers tools/API
3. **Secrets injection** - proper env var handling for external services

### Biggest Pain Points

1. **Integration tests need real credentials** - can't run fully offline
2. **No test isolation guarantees** - tests may share state
3. **Long test-integration timeout (30 min)** - indicates flakiness
4. **Non-deterministic test ordering** - parallel tests can race

### Cost/Complexity Risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| Flaky tests erode trust | High | Already happening |
| Secret leakage in logs | High | Low (mitigated) |
| Test pollution across runs | Medium | Medium |

### Top 3 Improvements

1. **Add test isolation checks** - fail if tests share global state
2. **Mock external services in CI** - reduce flakiness, faster tests
3. **Add deterministic test ordering** - consistent failure reproduction

### Shadow Experiment Ideas

1. **Test Quarantine System**: Auto-quarantine tests that fail >3x in 7 days
2. **Flake Dashboard**: Track test flake rates, rank worst offenders
3. **Chaos Testing**: Randomly delay network calls to surface timing bugs

---

## Agent E: Platform/SRE

**Focus**: Reliability, release, rollback

### What Works

1. **Blue-green deploy** - deploy-production.yml supports rollback
2. **Rollback workflow exists** - manual trigger available
3. **Staging preview** - PRs get preview environments
4. **Health checks** - deploy waits for `/health` endpoint

### Biggest Pain Points

1. **No auto-rollback on deploy failure** - requires manual intervention
2. **Rollback is manual** - agents can't trigger safely
3. **No deploy telemetry** - can't track deploy success rates
4. **Staging deploys even on failing CI** - no gate

### Cost/Complexity Risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| Bad deploy stays up too long | High | Low (human oversight) |
| Staging environment drift | Medium | Medium |
| Agent deploys without validation | High | Mitigated by workflow |

### Top 3 Improvements

1. **Gate staging deploy on CI success** - don't deploy failing code
2. **Add deploy success metrics** - track p95 deploy times, failure rates
3. **Auto-rollback on health check failure** - within 5 min

### Shadow Experiment Ideas

1. **Canary Deploys**: Route 5% traffic to new version, monitor errors
2. **Deploy Confidence Score**: ML model predicts deploy risk based on PR diff
3. **Chaos Deploy Testing**: Intentionally break staging deploys to test rollback

---

## Agent F: Cost & Performance

**Focus**: ROI-driven optimization, minute budgets

### What Works

1. **Budget tracking exists** - docs/ci/minute-usage-analysis.md
2. **Path filters on ci.yml** - 70% reduction achieved
3. **Self-hosted runner** - saves ~$0.008/min on jobs
4. **ci-metrics.yml** - weekly cost reporting

### Biggest Pain Points

1. **No real-time budget alerting** - discovered overruns retroactively
2. **staging.yml consumes ~32% of budget** - no optimization
3. **build-apps.yml runs too often** - macOS builds expensive
4. **No per-workflow cost attribution** - hard to find waste

### Cost/Complexity Risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| Budget overrun | High | Medium (was 180% pre-optimization) |
| Self-hosted runner downtime | Medium | Low |
| Cache storage costs | Low | Low |

### Top 3 Improvements

1. **Add Slack alert at 80% budget** - proactive cost control
2. **Optimize staging.yml** - add path filters, concurrency
3. **Restrict build-apps.yml to tags only** - ~100 min/month saved

### Shadow Experiment Ideas

1. **Cost-per-PR Dashboard**: Show developers cost of their PR's CI runs
2. **Budget Quotas per Workflow**: Fail CI if single workflow exceeds % of budget
3. **Spot Instance Runner**: Use preemptible VMs for non-critical jobs

---

## Cross-Agent Consensus

### Overlapping Recommendations

| Recommendation | Agents Agreeing | Priority |
|----------------|-----------------|----------|
| Add concurrency to all workflows | A, F | P0 |
| Add path filters to staging.yml | A, F | P0 |
| Standardize composite action usage | A, B | P1 |
| Gate staging on CI success | D, E | P1 |
| Implement affected-only builds | B, C, F | P2 |
| Track flaky tests | C, D | P2 |

### Conflicting Recommendations

| Topic | Agent A | Agent B | Resolution |
|-------|---------|---------|------------|
| Nx/Turborepo adoption | Defer (complexity) | Adopt (scaling) | Start with Turborepo POC |
| Test parallelization | More jobs | Smarter selection | Hybrid: parallel + affected |
| Self-hosted expansion | Add runners | Remote cache first | Evaluate both |

### Deferred Ideas (Future Backlog)

- Nx for full monorepo orchestration (high effort, evaluate at 30+ packages)
- Kubernetes-based ephemeral runners (overkill for current scale)
- Full GitOps deployment (requires infra investment)

---

*Generated by multi-agent analysis simulation*
