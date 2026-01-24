# CI/CD Quick Wins Implemented

> **Date**: 2026-01-24
> **Status**: Implemented

---

## Summary

| Change | Files Modified | Estimated Savings |
|--------|----------------|-------------------|
| Added concurrency to staging.yml | 1 | ~200 min/month |
| Added path filters to staging.yml | 1 | ~300 min/month |
| Added concurrency to design-system.yml | 1 | ~20 min/month |
| Added concurrency to chromatic.yml | 1 | ~10 min/month |
| Added concurrency to e2e-tests.yml | 1 | ~50 min/month |
| Added concurrency to data-layer-e2e.yml | 1 | ~20 min/month |
| Added concurrency to deploy-production.yml | 1 | Serialization (safety) |
| **Total** | **7** | **~600 min/month** |

---

## Changes Made

### 1. staging.yml - Concurrency + Path Filters

**Before:**
```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
```

**After:**
```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
    paths:
      - 'src/**'
      - 'apps/**'
      - 'packages/**'
      - 'design-system/**'
      - 'docker/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - '.github/workflows/staging.yml'

concurrency:
  group: staging-${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

**Impact:**
- PRs touching only docs/README won't trigger staging deploy
- Duplicate runs for same PR are cancelled
- ~500 min/month saved

---

### 2. design-system.yml - Concurrency

**Added:**
```yaml
concurrency:
  group: design-system-${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

**Impact:**
- Prevents duplicate design system builds
- ~20 min/month saved

---

### 3. chromatic.yml - Concurrency

**Added:**
```yaml
concurrency:
  group: chromatic-${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

**Impact:**
- Prevents duplicate visual regression tests
- ~10 min/month saved

---

### 4. e2e-tests.yml - Concurrency

**Added:**
```yaml
concurrency:
  group: e2e-${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

**Impact:**
- Prevents duplicate E2E test runs
- ~50 min/month saved

---

### 5. data-layer-e2e.yml - Concurrency

**Added:**
```yaml
concurrency:
  group: data-layer-e2e-${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

**Impact:**
- Prevents duplicate data layer tests
- ~20 min/month saved

---

### 6. deploy-production.yml - Serialized Concurrency

**Added:**
```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false  # Queue, don't cancel active deploys
```

**Impact:**
- Prevents overlapping production deploys
- Queues deploys instead of cancelling
- Safety improvement (no accidental cancellation)

---

## Validation

### Testing the Changes

1. **Path filters**: Create a PR touching only `README.md` → staging.yml should NOT run
2. **Concurrency**: Push two commits quickly to same PR → first run should be cancelled
3. **Deploy serialization**: Trigger two deploys → second should queue, not cancel first

### Rollback

All changes are additive and can be reverted by removing the added YAML blocks:

```bash
# Revert individual workflow
git checkout HEAD~1 -- .github/workflows/staging.yml

# Revert all quick wins
git revert <commit-sha>
```

---

## Remaining Quick Wins (Next Sprint)

| Change | Priority | Effort |
|--------|----------|--------|
| Add concurrency to 20+ remaining workflows | P1 | 2 hours |
| Restrict build-apps.yml to tags only | P1 | 10 min |
| Migrate workflows to composite action | P1 | 4 hours |
| Add CI summary artifact | P2 | 2 hours |

---

## Metrics to Track

After 1 week, measure:
- [ ] staging.yml runs reduced by >30%
- [ ] No duplicate runs observed
- [ ] No staging deploys for docs-only PRs
- [ ] Total monthly minutes < 2,400

---

*Quick wins implemented as part of CI/CD redesign initiative.*
