# CI/CD Testing Strategy

> **Purpose**: Ensure CI changes work correctly before broad rollout
> **Date**: 2026-01-24

---

## Testing Layers

| Layer | What It Tests | When to Use |
|-------|---------------|-------------|
| **1. Static Validation** | YAML syntax, schema, common errors | Before every commit |
| **2. Local Simulation** | Commands the workflow would run | Before pushing |
| **3. Shadow PR Test** | Actual workflow execution on test PR | After pushing changes |
| **4. Incremental Rollout** | Apply to 2-3 workflows, monitor | Before mass rollout |
| **5. Canary Monitoring** | Watch for cancelled runs, failures | After rollout |

---

## Layer 1: Static Validation

### YAML Syntax Check

```bash
# Validate all workflow YAML files
for f in .github/workflows/*.yml; do
  echo "Checking $f..."
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "  ✅ Valid" || echo "  ❌ Invalid"
done
```

### GitHub Actions Linter (actionlint)

```bash
# Install actionlint (one-time)
brew install actionlint

# Run on all workflows
actionlint

# Run on specific workflow
actionlint .github/workflows/staging.yml
```

### Common Issues to Check

| Issue | How to Detect | Fix |
|-------|---------------|-----|
| Invalid concurrency group | `actionlint` warning | Use valid expression syntax |
| Missing `cancel-in-progress` | Manual review | Add `cancel-in-progress: true` |
| Path filter typos | File doesn't exist check | Verify paths with `ls` |
| Wrong branch name | Manual review | Check against `git branch -r` |

### Quick Validation Script

```bash
#!/bin/bash
# scripts/ci/validate-workflows.sh

echo "=== CI Workflow Validation ==="

# 1. YAML syntax
echo -e "\n📋 Checking YAML syntax..."
for f in .github/workflows/*.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" 2>/dev/null || {
    echo "  ❌ $f has invalid YAML"
    exit 1
  }
done
echo "  ✅ All YAML valid"

# 2. actionlint (if installed)
if command -v actionlint &> /dev/null; then
  echo -e "\n🔍 Running actionlint..."
  actionlint || exit 1
  echo "  ✅ actionlint passed"
else
  echo -e "\n⚠️  actionlint not installed (brew install actionlint)"
fi

# 3. Check for concurrency in key workflows
echo -e "\n🔄 Checking concurrency settings..."
for workflow in staging.yml design-system.yml chromatic.yml e2e-tests.yml; do
  if grep -q "concurrency:" ".github/workflows/$workflow" 2>/dev/null; then
    echo "  ✅ $workflow has concurrency"
  else
    echo "  ⚠️  $workflow missing concurrency"
  fi
done

echo -e "\n✅ Validation complete"
```

---

## Layer 2: Local Simulation

### Test the Commands Workflows Run

Before pushing, run the actual commands locally to ensure they work:

```bash
# Simulate what ci.yml does
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration  # If you have credentials
pnpm build:fast

# Simulate quality gates
pnpm ci:quality-gates
```

### Test Path Filter Logic

Verify which files would trigger a workflow:

```bash
# Check which files changed in current branch
git diff --name-only origin/main

# Check if any match staging.yml path filters
git diff --name-only origin/main | grep -E '^(src/|apps/|packages/|design-system/|docker/|package\.json|pnpm-lock\.yaml)'
```

### Dry-Run for Deploy Workflows

```bash
# Preview what deploy would do
ferni deploy gce --dry-run
ferni deploy ui --dry-run
```

---

## Layer 3: Shadow PR Test

### Create a Test PR

The safest way to test CI changes is with a real PR:

```bash
# Create test branch from your changes
git checkout -b test/ci-concurrency-validation

# Make a trivial change to trigger CI
echo "# CI Test $(date)" >> docs/devops/CI-TEST.md
git add docs/devops/CI-TEST.md
git commit -m "test: validate CI concurrency changes"

# Push and create PR
git push -u origin test/ci-concurrency-validation
gh pr create --title "test: CI concurrency validation [DO NOT MERGE]" \
  --body "Testing CI changes. Will close after validation." \
  --draft
```

### Test Concurrency Behavior

1. **Push first commit** → Watch workflow start
2. **Push second commit quickly** → Watch first run get cancelled
3. **Verify in Actions tab**: First run shows "Cancelled" status

```bash
# Quick double-push to test cancellation
echo "# Test 1" >> docs/devops/CI-TEST.md && git add . && git commit -m "test 1" && git push
sleep 2
echo "# Test 2" >> docs/devops/CI-TEST.md && git add . && git commit -m "test 2" && git push
```

### Test Path Filters

1. **Docs-only change**: Should NOT trigger staging.yml
2. **Code change**: Should trigger staging.yml

```bash
# Test 1: Docs only (should NOT trigger staging)
echo "# Doc change" >> README.md
git add README.md && git commit -m "docs: test path filter" && git push

# Watch: staging.yml should NOT run

# Test 2: Code change (should trigger staging)
echo "// test" >> src/index.ts
git add src/index.ts && git commit -m "test: code change" && git push

# Watch: staging.yml SHOULD run
```

### Cleanup Test PR

```bash
# After validation, close without merging
gh pr close test/ci-concurrency-validation
git checkout devops-supercharged
git branch -D test/ci-concurrency-validation
git push origin --delete test/ci-concurrency-validation
```

---

## Layer 4: Incremental Rollout

### Phase 1: Test on Low-Risk Workflows (2-3 workflows)

Apply changes to these first:
- `design-system.yml` (low frequency, well-scoped)
- `token-check.yml` (simple, fast)
- `i18n-check.yml` (simple, fast)

### Phase 2: Apply to Medium-Risk Workflows

After 1-2 days of Phase 1 success:
- `chromatic.yml`
- `lighthouse-ci.yml`
- `data-layer-e2e.yml`

### Phase 3: Apply to High-Traffic Workflows

After Phase 2 success:
- `staging.yml` (already done ✅)
- `e2e-tests.yml` (already done ✅)
- Remaining workflows

### Rollout Checklist

```markdown
## Concurrency Rollout Checklist

### Phase 1 (Low-risk)
- [ ] design-system.yml - Added concurrency
  - [ ] Pushed change
  - [ ] Verified workflow runs
  - [ ] Tested cancellation behavior
  - [ ] Monitored for 24h, no issues
- [ ] token-check.yml
- [ ] i18n-check.yml

### Phase 2 (Medium-risk)
- [ ] chromatic.yml ✅ (already done)
- [ ] lighthouse-ci.yml
- [ ] data-layer-e2e.yml ✅ (already done)

### Phase 3 (High-traffic)
- [ ] staging.yml ✅ (already done)
- [ ] e2e-tests.yml ✅ (already done)
- [ ] agent-e2e.yml
- [ ] ... remaining workflows
```

---

## Layer 5: Canary Monitoring

### What to Watch After Rollout

| Metric | Where to Check | Expected Change |
|--------|----------------|-----------------|
| Cancelled runs | GitHub Actions tab | Should see "Cancelled" status on superseded runs |
| Total runs | CI metrics | Slight decrease (cancelled runs don't complete) |
| Build failures | GitHub Actions | Should NOT increase |
| Staging deploys | PR comments | Should only happen on code PRs |

### GitHub Actions Dashboard Checks

```bash
# Check recent workflow runs
gh run list --workflow=staging.yml --limit=10

# Check for cancelled runs (good - means concurrency working)
gh run list --workflow=staging.yml --status=cancelled --limit=5

# Check for failures (bad - investigate)
gh run list --workflow=staging.yml --status=failure --limit=5
```

### Slack Alert Integration

If budget alerting is set up:
- Watch `#ci-alerts` for any unexpected patterns
- Budget consumption should decrease (fewer duplicate runs)

---

## Rollback Procedures

### Quick Rollback (Single Workflow)

```bash
# Revert a single workflow file
git checkout origin/main -- .github/workflows/staging.yml
git commit -m "revert: remove concurrency from staging.yml"
git push
```

### Full Rollback (All Changes)

```bash
# Revert to state before CI changes
git log --oneline | head -5  # Find commit before changes
git revert <commit-sha>
git push
```

### Emergency: Disable Workflow

If a workflow is causing issues and can't be fixed immediately:

```yaml
# Add at top of workflow to disable
on:
  workflow_dispatch:  # Only manual trigger
  # Comment out other triggers temporarily
  # push:
  # pull_request:
```

---

## Pre-Rollout Checklist

Before applying concurrency to remaining workflows:

```markdown
## Pre-Rollout Validation

### Static Checks
- [ ] `actionlint` passes on all modified workflows
- [ ] YAML syntax valid
- [ ] Concurrency group names are unique per workflow

### Local Tests
- [ ] `pnpm quality` passes locally
- [ ] Build commands work

### Shadow PR Tests
- [ ] Created test PR
- [ ] Verified concurrency cancellation works
- [ ] Verified path filters work (if applicable)
- [ ] Cleaned up test PR

### Rollback Ready
- [ ] Know how to revert individual workflows
- [ ] Know how to revert entire commit
- [ ] Team aware of changes being rolled out
```

---

## Automated Validation Script

```bash
#!/bin/bash
# scripts/ci/pre-rollout-check.sh

set -e

echo "🚀 CI Pre-Rollout Validation"
echo "============================"

# 1. Install actionlint if missing
if ! command -v actionlint &> /dev/null; then
  echo "📦 Installing actionlint..."
  brew install actionlint
fi

# 2. Run actionlint
echo -e "\n🔍 Running actionlint..."
actionlint

# 3. Check YAML syntax
echo -e "\n📋 Validating YAML..."
for f in .github/workflows/*.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))"
done
echo "  ✅ All YAML valid"

# 4. Count concurrency adoption
echo -e "\n📊 Concurrency Status:"
TOTAL=$(ls .github/workflows/*.yml | wc -l | tr -d ' ')
WITH_CONCURRENCY=$(grep -l "concurrency:" .github/workflows/*.yml | wc -l | tr -d ' ')
echo "  $WITH_CONCURRENCY / $TOTAL workflows have concurrency"

# 5. List workflows missing concurrency
echo -e "\n⚠️  Workflows WITHOUT concurrency:"
for f in .github/workflows/*.yml; do
  if ! grep -q "concurrency:" "$f"; then
    echo "  - $(basename $f)"
  fi
done

echo -e "\n✅ Pre-rollout checks complete"
```

---

## Summary

| Step | Action | Time |
|------|--------|------|
| 1 | Run `actionlint` | 1 min |
| 2 | Run local commands | 5 min |
| 3 | Create shadow test PR | 10 min |
| 4 | Test concurrency + path filters | 5 min |
| 5 | Cleanup test PR | 1 min |
| **Total** | | **~22 min** |

**Recommendation**: Run through this checklist before applying concurrency to the remaining 23 workflows.

---

*Testing strategy for CI/CD changes - validate before rollout.*
