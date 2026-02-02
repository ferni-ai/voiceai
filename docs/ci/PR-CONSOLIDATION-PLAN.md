# PR Consolidation Plan

> Plan to merge outstanding CI/DevOps PRs into a clean, consolidated workflow.

**Created:** 2026-02-02
**Current Branch:** `devops-supercharged`
**Target:** Single clean merge to `main`

---

## Current State

### Active PRs (as of 2026-02-02)

| PR | Branch | Status | Purpose |
|----|--------|--------|---------|
| **#52** | `fix/ci-agents-js-all-workflows` | **Primary** | CI visualization, agents-js fix, comprehensive remediation |
| **#51** | `feat/ci-health-gate` | Open | CI health gate circuit breaker workflow |
| **#50** | `fix/ci-rust-cross-compile` | Open | agents-js fix for rust workflow |
| **#49** | `fix/ci-token-drift` | Open | Token drift check CI-safe |
| **#48** | `fix/ci-bundle-budget` | Open | Bundle size budget calibration |
| **#47** | `devops-supercharged` | Open | Concurrency control for all workflows |

### Dependabot PRs (to merge separately)

| PR | Branch | Purpose |
|----|--------|---------|
| #57 | `dependabot/.../softprops/action-gh-release-2` | Bump action-gh-release 1→2 |
| #56 | `dependabot/.../actions/configure-pages-5` | Bump configure-pages 4→5 |
| #55 | `dependabot/.../slackapi/slack-github-action-2.1.1` | Bump slack-github-action |
| #54 | `dependabot/.../github/codeql-action-4` | Bump codeql-action 3→4 |
| #53 | `dependabot/.../pnpm/action-setup-4` | Bump pnpm/action-setup 2→4 |

### Key Commits on `fix/ci-agents-js-all-workflows` (PR #52)

```
a6486e453 feat(ci): add ci visualization dashboard with agent and human views
26168e95f fix(ci): comprehensive ci remediation for pr #47 failures
bbdf8e9d7 fix(ci): resolve multiple workflow failures
03d903f1e fix(ci): comprehensive ci remediation for pr #47 failures
afdf5d066 fix(ci): fix additional workflow issues
6f546ba51 fix(ci): update remaining workflows to use composite action
```

---

## Consolidation Workflow

### Phase 1: Merge PR #52 (Primary)

```bash
# Ensure CI passes
gh pr checks 52 --watch

# Merge via GitHub (squash recommended for clean history)
gh pr merge 52 --squash --delete-branch
```

### Phase 2: Evaluate Remaining CI PRs

Before closing, check what each PR contributes that may not be in #52:

```bash
# Check each PR for unique fixes
gh pr view 47 --json commits --jq '.commits[].messageHeadline'
gh pr view 48 --json commits --jq '.commits[].messageHeadline'
gh pr view 49 --json commits --jq '.commits[].messageHeadline'
gh pr view 50 --json commits --jq '.commits[].messageHeadline'
gh pr view 51 --json commits --jq '.commits[].messageHeadline'
```

**Decision Matrix:**

| PR | Likely Action | Reason |
|----|---------------|--------|
| #47 | Close | Concurrency changes likely in #52 |
| #48 | Close | Bundle budget may be superseded |
| #49 | **Evaluate** | Token drift fix may be unique |
| #50 | **Evaluate** | Rust workflow fix may be unique |
| #51 | **Evaluate** | Health gate feature may be valuable |

### Phase 3: Close Superseded PRs

```bash
# Close PRs that are fully superseded by #52
gh pr close 47 --comment "Superseded by #52 - concurrency control consolidated"
gh pr close 48 --comment "Superseded by #52 - bundle budget addressed"

# For PRs with unique value, either:
# A) Merge them separately
# B) Cherry-pick into a consolidation branch
```

### Phase 4: Consolidation Branch (if needed)

```bash
# Update main after #52 merges
git checkout main
git pull origin main

# Create consolidation branch for remaining fixes
git checkout -b fix/ci-consolidation-post-52

# Cherry-pick unique commits from other PRs
gh pr view 49 --json commits --jq '.commits[].oid' | while read sha; do
  git cherry-pick $sha || git cherry-pick --abort
done

# Push and create PR
git push -u origin fix/ci-consolidation-post-52
gh pr create --title "fix(ci): consolidate remaining CI fixes from #49, #50" \
  --body "Cherry-picked fixes from closed PRs"
```

### Phase 5: Merge Dependabot PRs

After CI is stable, merge dependabot updates:

```bash
# Merge dependabot PRs (safe action version bumps)
gh pr merge 53 --squash  # pnpm/action-setup
gh pr merge 54 --squash  # github/codeql-action
gh pr merge 55 --squash  # slackapi/slack-github-action
gh pr merge 56 --squash  # actions/configure-pages
gh pr merge 57 --squash  # softprops/action-gh-release
```

### Phase 6: Enhancement Branch

```bash
# After all fixes are merged
git checkout main
git pull origin main

# Create enhancement branch
git checkout -b feat/ci-enhancements

# Implement enhancements from CI-ENHANCEMENT-ROADMAP.md
# Phase 1: Parallel API, Rate Limits
# ...

git push -u origin feat/ci-enhancements
gh pr create --title "feat(ci): parallel API calls and rate limit protection" \
  --body "Phase 1 of CI enhancement roadmap - see docs/ci/CI-ENHANCEMENT-ROADMAP.md"
```

---

## Pre-Merge Checklist for PR #52

- [ ] All CI checks pass
- [ ] `ferni ci status` works
- [ ] `ferni ci actions` works
- [ ] `ferni ci dashboard` works
- [ ] `ferni ci graph --format mermaid` works
- [ ] Watch mode cleanup works (Ctrl+C graceful exit)
- [ ] Execute command validates allowlist
- [ ] Dynamic dependency discovery works
- [ ] Documentation updated

---

## Branch Naming Convention Going Forward

| Type | Pattern | Example |
|------|---------|---------|
| Bug fixes | `fix/ci-<description>` | `fix/ci-rate-limit` |
| Features | `feat/ci-<description>` | `feat/ci-websocket` |
| Refactors | `refactor/ci-<description>` | `refactor/ci-parallel-api` |
| Docs | `docs/ci-<description>` | `docs/ci-runbook` |

---

## Timeline

| Day | Action |
|-----|--------|
| **Today** | Commit fixes to #52, push, verify CI |
| **Today+1** | Merge #52 after CI passes |
| **Today+1** | Close superseded PRs (#47, #48) |
| **Today+2** | Cherry-pick any remaining fixes if needed |
| **Today+3** | Start `feat/ci-enhancements` branch |

---

## Commands Quick Reference

```bash
# View all open PRs
gh pr list

# Check PR status
gh pr checks 52

# View PR diff
gh pr diff 52

# Merge PR
gh pr merge 52 --squash

# Close PR
gh pr close 47 --comment "Reason"

# Cherry-pick
git cherry-pick <sha>

# Create PR from current branch
gh pr create --title "title" --body "body"
```

---

*Last updated: 2026-02-02*
