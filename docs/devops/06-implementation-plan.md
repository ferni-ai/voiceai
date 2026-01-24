# CI/CD Implementation Plan

> **Version**: 1.0
> **Date**: 2026-01-24
> **Status**: Ready for execution

---

## Milestone Overview

| Milestone | Description | Timeline | Risk |
|-----------|-------------|----------|------|
| M1 | Quick Wins (concurrency, path filters) | Week 1 | Low |
| M2 | Standardize Composite Action | Week 2 | Low |
| M3 | Gate Staging on CI | Week 2-3 | Medium |
| M4 | CI Summary Artifact | Week 3 | Low |
| M5 | Budget Alerting | Week 3 | Low |
| M6 | Workflow Consolidation | Week 4-5 | Medium |
| M7 | Turborepo POC | Month 2 | Medium |

---

## Milestone 1: Quick Wins

### M1.1: Add Concurrency to All Workflows

**Files Changed**:
- `.github/workflows/staging.yml`
- `.github/workflows/design-system.yml`
- `.github/workflows/chromatic.yml`
- `.github/workflows/e2e-tests.yml`
- `.github/workflows/data-layer-e2e.yml`
- (20+ other workflows)

**Rationale**: Prevent duplicate runs, save ~200 min/month

**Implementation**:
```yaml
# Add to top of each workflow
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Testing Strategy**:
1. Open PR with concurrency added to one workflow
2. Push two quick commits to same PR
3. Verify first run is cancelled, second runs

**Rollback Strategy**:
```bash
git revert <commit-sha>
# Concurrency is purely additive, revert is safe
```

**Success Metrics**:
- No duplicate runs for same PR
- ~10% reduction in total minutes

**Blast Radius**: None - concurrency only affects same-branch runs

---

### M1.2: Add Path Filters to staging.yml

**Files Changed**:
- `.github/workflows/staging.yml`

**Rationale**: staging.yml consumes 32% of budget, runs on ALL PRs

**Implementation**:
```yaml
on:
  pull_request:
    branches: [main]
    paths:
      - 'src/**'
      - 'apps/**'
      - 'packages/**'
      - 'design-system/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - '.github/workflows/staging.yml'
```

**Testing Strategy**:
1. Create PR touching only `docs/` or `README.md`
2. Verify staging.yml does NOT run
3. Create PR touching `src/`
4. Verify staging.yml DOES run

**Rollback Strategy**:
```yaml
# Remove paths: block, workflow returns to running on all PRs
```

**Success Metrics**:
- staging.yml runs only on code changes
- ~30% reduction in staging.yml runs

**Blast Radius**: Medium - docs-only PRs won't get staging preview (acceptable)

---

### M1.3: Restrict build-apps.yml to Tags

**Files Changed**:
- `.github/workflows/build-apps.yml`

**Rationale**: macOS builds are 10x cost, should only run on releases

**Current Trigger**:
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

**New Trigger**:
```yaml
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
```

**Testing Strategy**:
1. Push to main, verify build-apps.yml does NOT run
2. Create tag `v0.0.0-test`, verify build-apps.yml DOES run
3. Delete test tag

**Rollback Strategy**:
```yaml
# Restore branches: [main] trigger
```

**Success Metrics**:
- build-apps.yml runs only on version tags
- ~150 min/month saved

**Blast Radius**: Low - manual workflow_dispatch still available if needed

---

## Milestone 2: Standardize Composite Action

### M2.1: Migrate Remaining Workflows

**Files Changed**:
- `.github/workflows/staging.yml`
- `.github/workflows/design-system.yml`
- `.github/workflows/chromatic.yml`
- `.github/workflows/e2e-tests.yml`
- `.github/workflows/data-layer-e2e.yml`
- `.github/workflows/lighthouse-ci.yml`
- `.github/workflows/security-scan.yml`

**Rationale**: Consistent setup, easier maintenance, DRY

**Implementation**:
```yaml
# Replace manual setup with:
- uses: ./.github/actions/setup-node-pnpm
  with:
    frozen-lockfile: 'true'
```

**Testing Strategy**:
1. Migrate one workflow, run manually
2. Verify all steps pass
3. Repeat for remaining workflows

**Rollback Strategy**:
```bash
git revert <commit-sha>
# Each workflow is independent, revert one at a time
```

**Success Metrics**:
- All workflows use composite action
- Setup duration consistent across workflows

**Blast Radius**: Low - if composite fails, individual workflow fails (visible immediately)

---

## Milestone 3: Gate Staging on CI

### M3.1: Add CI Dependency to staging.yml

**Files Changed**:
- `.github/workflows/staging.yml`

**Rationale**: Don't deploy broken code to staging

**Implementation**:
```yaml
jobs:
  wait-for-ci:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for CI
        uses: lewagon/wait-on-check-action@v1.3.4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          check-name: 'lint'
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          wait-interval: 10

  deploy-staging:
    needs: wait-for-ci
    # ... existing deploy steps
```

**Testing Strategy**:
1. Open PR with failing lint
2. Verify staging deploy does NOT start
3. Fix lint, push
4. Verify staging deploy starts after CI passes

**Rollback Strategy**:
```yaml
# Remove wait-for-ci job and needs: dependency
```

**Success Metrics**:
- Zero staging deploys for failing PRs
- Staging deploy starts within 1 min of CI passing

**Blast Radius**: Medium - staging deploys will be delayed by CI duration

---

## Milestone 4: CI Summary Artifact

### M4.1: Add Summary Generation to ci.yml

**Files Changed**:
- `.github/workflows/ci.yml`
- `scripts/ci/generate-summary.ts` (new)

**Rationale**: Enable agent parsing of CI results

**Implementation**:
```yaml
- name: Generate CI summary
  if: always()
  run: npx tsx scripts/ci/generate-summary.ts

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: ci-summary-${{ github.sha }}
    path: ci-summary.json
    retention-days: 30
```

**Summary Format**:
```json
{
  "workflow": "ci",
  "sha": "abc123",
  "status": "success",
  "duration_seconds": 420,
  "jobs": [...],
  "failures": [],
  "warnings": []
}
```

**Testing Strategy**:
1. Run CI workflow
2. Download artifact, verify JSON structure
3. Verify all job statuses captured

**Rollback Strategy**:
```bash
git revert <commit-sha>
# Artifact generation is additive, no impact on CI logic
```

**Success Metrics**:
- Every CI run produces summary artifact
- Agents can parse summary programmatically

**Blast Radius**: None - artifact is purely additive

---

## Milestone 5: Budget Alerting

### M5.1: Add Budget Check to ci-metrics.yml

**Files Changed**:
- `.github/workflows/ci-metrics.yml`
- `scripts/ci/check-budget.ts` (new)

**Rationale**: Proactive cost control

**Implementation**:
```yaml
- name: Check budget
  run: npx tsx scripts/ci/check-budget.ts
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    SLACK_WEBHOOK: ${{ secrets.SLACK_CI_WEBHOOK }}
```

**Alert Thresholds**:
- 50%: Info to logs only
- 80%: Slack warning
- 90%: Slack critical

**Testing Strategy**:
1. Run script locally with mock data
2. Verify Slack message format
3. Deploy and trigger manual workflow run

**Rollback Strategy**:
```bash
git revert <commit-sha>
# Alerting is purely additive
```

**Success Metrics**:
- Alert received when budget exceeds 80%
- No false positives

**Blast Radius**: None - alerting doesn't affect CI logic

---

## Milestone 6: Workflow Consolidation

### M6.1: Create nightly.yml

**Files Changed**:
- `.github/workflows/nightly.yml` (new)
- `.github/workflows/bth-benchmarks.yml` (modify triggers)
- `.github/workflows/lighthouse-ci.yml` (modify triggers)
- `.github/workflows/build-apps.yml` (modify triggers)

**Rationale**: Consolidate scheduled jobs, reduce workflow sprawl

**Implementation**:
```yaml
name: Nightly Deep Validation
on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  full-tests:
    # Run all 1100 tests

  bth-benchmarks:
    # Capability benchmarks

  lighthouse:
    # Performance audit

  platform-builds:
    # iOS, Electron, Rust
```

**Testing Strategy**:
1. Create nightly.yml, run via workflow_dispatch
2. Verify all jobs complete
3. Modify other workflows to remove schedule triggers
4. Verify no duplicate scheduled runs

**Rollback Strategy**:
```bash
# Re-enable schedule triggers in original workflows
git revert <nightly-commit>
```

**Success Metrics**:
- Single nightly workflow instead of 4
- All nightly jobs run at 3 AM UTC

**Blast Radius**: Medium - if nightly.yml fails, must debug single workflow

---

## Milestone 7: Turborepo POC

### M7.1: Add Turborepo Configuration

**Files Changed**:
- `turbo.json` (new)
- `package.json` (add turbo dependency)
- `.github/workflows/ci.yml` (use turbo for builds)

**Rationale**: Remote caching, affected-only builds

**Implementation**:
```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    }
  }
}
```

**Testing Strategy**:
1. Add turbo.json to repo
2. Run `turbo build` locally, verify outputs
3. Enable remote cache in Vercel dashboard
4. Run `turbo build` twice, verify cache hit
5. Shadow run in CI alongside existing build

**Rollback Strategy**:
```bash
# Remove turbo.json, remove turbo from package.json
# CI falls back to existing build commands
```

**Success Metrics**:
- >30% build time reduction with warm cache
- Cache hit rate >80%

**Blast Radius**: Low during POC (shadow run alongside existing)

---

## Shadow Pipeline Strategy

For risky changes, run shadow pipelines:

```yaml
# Shadow job runs alongside real job
jobs:
  build-legacy:
    name: Build (Legacy)
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build

  build-turbo:
    name: Build (Turbo - Shadow)
    runs-on: ubuntu-latest
    continue-on-error: true  # Don't block on shadow
    steps:
      - run: npx turbo build
```

Compare results before cutting over.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Path filters block critical workflows | Low | High | Test thoroughly on PRs |
| Composite action breaks | Low | High | Gradual rollout, monitor |
| Turborepo cache poisoning | Low | Medium | Content-hash keys |
| Budget alerting false positives | Medium | Low | Tune thresholds |
| Nightly workflow fails silently | Medium | Medium | Add Slack alerts |

---

## Timeline

```
Week 1: M1 (Quick Wins)
├── M1.1: Concurrency (Day 1-2)
├── M1.2: Path filters (Day 2-3)
└── M1.3: build-apps restriction (Day 3)

Week 2: M2 + M3
├── M2.1: Composite standardization (Day 1-3)
└── M3.1: Gate staging on CI (Day 3-5)

Week 3: M4 + M5
├── M4.1: CI summary artifact (Day 1-2)
└── M5.1: Budget alerting (Day 3-4)

Week 4-5: M6
└── M6.1: Nightly consolidation (5 days)

Month 2: M7
└── M7.1: Turborepo POC (2-3 weeks)
```

---

## Approval Checklist

- [ ] DevOps lead reviewed
- [ ] Platform lead reviewed
- [ ] No objections from team
- [ ] Budget approved for Turborepo (if POC successful)

---

*Implementation plan approved for execution. Begin with Milestone 1.*
