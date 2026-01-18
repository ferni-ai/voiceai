# CI/CD Backlog

This document tracks planned CI/CD improvements and their priority.

## Priority Definitions

| Priority | Description | Timeline |
|----------|-------------|----------|
| P0 | Critical - blocking or high waste | Immediate |
| P1 | Important - significant improvement | 1-2 weeks |
| P2 | Nice to have - incremental improvement | 1 month |
| P3 | Future consideration | Backlog |

## Completed

### P0 Items (Completed)

- [x] **Add path filters to ci.yml**
  - Impact: 70% reduction in unnecessary runs
  - PR: ci/monorepo-devops-audit-2026-01-18

- [x] **Add concurrency control to ci.yml**
  - Impact: Cancel in-progress runs, prevent pile-up
  - PR: ci/monorepo-devops-audit-2026-01-18

- [x] **Standardize pnpm to v10**
  - Impact: Consistent builds, no version drift
  - Files: ci.yml, design-system.yml, chromatic.yml, bth-benchmarks.yml, lighthouse-ci.yml, security-scan.yml
  - PR: ci/monorepo-devops-audit-2026-01-18

### P1 Items (Completed)

- [x] **Create composite action for setup**
  - Location: `.github/actions/setup-node-pnpm/action.yml`
  - Impact: DRY setup, consistent behavior
  - PR: ci/monorepo-devops-audit-2026-01-18

- [x] **Refactor ci.yml to use composite action**
  - Impact: Reduced from 551 lines to 330 lines
  - PR: ci/monorepo-devops-audit-2026-01-18

- [x] **Create reusable design system workflow**
  - Location: `.github/workflows/reusable-design-system.yml`
  - Impact: Eliminate duplicate builds
  - PR: ci/monorepo-devops-audit-2026-01-18

## In Progress

### P1 Items

- [ ] **Migrate remaining workflows to composite action**
  - Files: design-system.yml, chromatic.yml, bth-benchmarks.yml
  - Estimated savings: Additional 2-3 min per workflow

## Backlog

### P1 Items

- [ ] **Add shared node_modules cache across ci.yml jobs**
  - Use actions/cache/save and actions/cache/restore
  - Estimated savings: 5-10 min per CI run

- [ ] **Conditional macOS builds**
  - Only build on release tags, not every push
  - Estimated savings: $1-2 per unnecessary build

- [ ] **Add concurrency to design-system.yml**
  - Prevent duplicate design system builds

### P2 Items

- [ ] **Add PR coverage comments**
  - Use codecov/codecov-action built-in PR comments
  - Improves developer feedback

- [ ] **Add Lighthouse PR comments**
  - Post accessibility scores to PRs
  - Improves visibility of performance impact

- [ ] **Consolidate quality workflows**
  - Merge overlapping quality checks
  - Reduce workflow count

- [ ] **Pin floating action versions**
  - Pin trufflehog@main to specific version
  - Pin chromaui/action@latest to specific version

### P3 Items (Future)

- [ ] **Evaluate Nx for monorepo**
  - Affected detection
  - Distributed caching
  - Re-evaluate when package count > 15

- [ ] **Self-hosted runner expansion**
  - Add more runners for parallelism
  - Consider when CI queue times increase

- [ ] **Preview environments per PR**
  - Deploy to unique URL for each PR
  - Requires infrastructure setup

- [ ] **Automated rollback on deploy failure**
  - Currently manual rollback
  - Would improve deployment reliability

## Metrics to Track

| Metric | Current | Target | Tracking |
|--------|---------|--------|----------|
| Monthly CI minutes | ~5,400 | < 3,000 | ci-metrics.yml |
| ci.yml duration | 22 min | 10 min | CI logs |
| PR gate time | ~15 min | < 10 min | GitHub Insights |
| CI success rate | ~85% | > 95% | ci-metrics.yml |

## How to Add Items

1. Open a GitHub issue with label `ci` or `devops`
2. Assign priority (P0-P3) based on impact
3. Add to this backlog
4. Link to implementation PR when complete
