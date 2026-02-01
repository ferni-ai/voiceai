# CI Optimization Plan

> **Date:** 2026-02-01
> **Related:** `CI-REMEDIATION-HANDOFF.md`

---

## Part 1: Uncovered Issues from PR #52

### Issue 1: ci.yml Jobs Not Using Composite Action Properly

**Problem:** The `setup` job uses the composite action and fixes `package.json`, but subsequent jobs:
- Restore node_modules from cache
- **DO NOT** run the `sed` fix on package.json
- Result: Tests fail with `FrameProcessor` import error

**Current flow (broken):**
```
setup job:
  → uses composite action
  → fixes package.json (file:.. → 1.0.35)
  → installs dependencies
  → caches node_modules

lint/test jobs:
  → restores node_modules from cache ✅
  → package.json still has file:../agents-js ❌
  → pnpm tries to resolve local dep
  → FrameProcessor import fails
```

**Solution Options:**

| Option | Effort | Risk | Recommendation |
|--------|--------|------|----------------|
| A. All jobs use composite action | Low | Low | ✅ **Recommended** |
| B. Cache package.json too | Medium | Medium | Viable |
| C. Run sed in every job | Low | Low | Quick fix |

**Recommended Fix (Option A):**

Update ci.yml so ALL jobs use the composite action instead of manual pnpm/node setup:

```yaml
# BEFORE (broken)
lint:
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
    - uses: actions/cache/restore@v4  # Restores node_modules but not fixed package.json

# AFTER (fixed)
lint:
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup-node-pnpm  # Fixes package.json AND installs deps
```

**Why this works:** The composite action runs the `sed` fix every time, ensuring package.json is correct before any npm/pnpm commands.

---

### Issue 2: Brand Compliance Comment Too Long

**Problem:** The PR comment body exceeds GitHub's 65,536 character limit.

**Error:**
```
Body is too long (maximum is 65536 characters)
```

**Root Cause:** The linter found many violations and dumps the entire output into the comment.

**Solution:** Truncate the comment with a summary:

```yaml
- name: Comment on PR
  uses: actions/github-script@v7
  with:
    script: |
      let output = '...';  // Full linter output

      // Truncate if too long
      const MAX_CHARS = 60000;
      if (output.length > MAX_CHARS) {
        const truncated = output.substring(0, MAX_CHARS);
        output = truncated + '\n\n... (truncated - too many violations)\n\n' +
                 '**Run `pnpm brand:check` locally to see all violations.**';
      }

      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `## 🎨 Brand Compliance Check\n\n${output}`
      });
```

---

### Issue 3: Heap Out of Memory During Build

**Problem:** `tsc` build runs out of memory on GitHub Actions runner.

**Error:**
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

**Current:** `NODE_OPTIONS: '--max-old-space-size=4096'` (4GB)

**Solutions:**

| Option | Impact | Recommendation |
|--------|--------|----------------|
| Increase to 8GB | May still fail on large builds | Try first |
| Use `build:fast` (esbuild) | 12x faster, less memory | ✅ **Recommended** |
| Split build into steps | Adds complexity | Fallback |

**Recommended Fix:**

```yaml
# BEFORE
- name: Build backend
  run: pnpm build --if-present

# AFTER
- name: Build backend
  run: pnpm build:fast  # Uses esbuild, much less memory
```

---

## Part 2: PRE-PR Optimization Plan

### Goal
Create a fast feedback loop (< 5 minutes) for PRs by running only relevant checks on changed files.

### Current State

| Workflow | Trigger | Duration | Runs On |
|----------|---------|----------|---------|
| ci.yml | push/PR to main/develop | 15-30 min | All code changes |
| brand-compliance.yml | PR to any branch | 3-5 min | apps/web, src, design-system |
| design-system.yml | PR to any branch | 5-10 min | design-system/** |

**Problem:** All checks run on all files, even for small changes.

### Proposed: Tiered Check System

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: Instant Feedback (< 2 min)                         │
│  - Lint changed files only                                  │
│  - TypeScript on changed files                              │
│  - Token validation (if design-system changed)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  TIER 2: Fast CI (< 5 min)                                  │
│  - Unit tests for affected modules                          │
│  - Brand compliance (changed files only)                    │
│  - Security scan                                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  TIER 3: Full CI (15-30 min) - On approve/merge             │
│  - Full test suite                                          │
│  - Full build                                               │
│  - E2E tests                                                │
│  - Visual regression                                        │
└─────────────────────────────────────────────────────────────┘
```

### Implementation: pre-pr-checks.yml

```yaml
name: Pre-PR Quick Checks

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: pre-pr-${{ github.head_ref }}
  cancel-in-progress: true

jobs:
  # Determine what changed
  changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
      design-system: ${{ steps.filter.outputs.design-system }}
      changed-files: ${{ steps.changed.outputs.files }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            frontend:
              - 'apps/web/**'
            backend:
              - 'src/**'
            design-system:
              - 'design-system/**'

      - name: Get changed files
        id: changed
        run: |
          FILES=$(git diff --name-only origin/${{ github.base_ref }}...HEAD | tr '\n' ' ')
          echo "files=$FILES" >> $GITHUB_OUTPUT

  # TIER 1: Instant lint on changed files
  quick-lint:
    runs-on: ubuntu-latest
    needs: changes
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm

      - name: Lint changed TypeScript files
        run: |
          CHANGED_TS=$(echo "${{ needs.changes.outputs.changed-files }}" | tr ' ' '\n' | grep -E '\.(ts|tsx)$' | tr '\n' ' ')
          if [ -n "$CHANGED_TS" ]; then
            pnpm eslint $CHANGED_TS --max-warnings 0
          fi

  # TIER 1: TypeScript on changed files
  quick-typecheck:
    runs-on: ubuntu-latest
    needs: changes
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm
      - run: pnpm typecheck

  # TIER 2: Brand compliance (changed files only)
  quick-brand:
    runs-on: ubuntu-latest
    needs: changes
    if: needs.changes.outputs.frontend == 'true' || needs.changes.outputs.backend == 'true'
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm

      - name: Brand lint changed files
        run: |
          # Pass changed files to linter
          pnpm tsx apps/cli/src/commands/quality/lint-brand.ts --files "${{ needs.changes.outputs.changed-files }}" || true

  # TIER 2: Token validation
  quick-tokens:
    runs-on: ubuntu-latest
    needs: changes
    if: needs.changes.outputs.design-system == 'true'
    timeout-minutes: 2
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm
      - run: pnpm tokens:check

  # TIER 2: Affected unit tests
  quick-tests:
    runs-on: ubuntu-latest
    needs: changes
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm

      - name: Run related tests
        run: |
          # Vitest can run only tests related to changed files
          pnpm vitest run --changed origin/${{ github.base_ref }} --passWithNoTests

  # Summary check for required status
  pre-pr-complete:
    runs-on: ubuntu-latest
    needs: [quick-lint, quick-typecheck, quick-brand, quick-tokens, quick-tests]
    if: always()
    steps:
      - name: Check all jobs passed
        run: |
          if [[ "${{ needs.quick-lint.result }}" == "failure" ]] || \
             [[ "${{ needs.quick-typecheck.result }}" == "failure" ]]; then
            echo "❌ Pre-PR checks failed"
            exit 1
          fi
          echo "✅ Pre-PR checks passed"
```

### Brand Linter Enhancement

Update `lint-brand.ts` to accept `--files` flag for targeted linting:

```typescript
// lint-brand.ts
const args = process.argv.slice(2);
const filesIndex = args.indexOf('--files');

let filesToCheck: string[];
if (filesIndex !== -1 && args[filesIndex + 1]) {
  // Only check specified files
  filesToCheck = args[filesIndex + 1].split(' ').filter(f => f.endsWith('.ts'));
} else {
  // Check all files (existing behavior)
  filesToCheck = glob.sync('**/*.ts', { ignore: ['node_modules/**'] });
}
```

### Branch Protection Update

Configure GitHub branch protection to require:

| Check | Tier | Required | Notes |
|-------|------|----------|-------|
| pre-pr-complete | 1+2 | ✅ Yes | Fast feedback |
| Build & Test | 3 | ✅ Yes | Full validation |
| CodeQL | 3 | ❌ No | Can be slow |

---

## Part 3: Action Items

### Immediate (PR #52 fixes)

- [ ] **Fix ci.yml** - Make all jobs use composite action
- [ ] **Fix brand-compliance.yml** - Truncate long comments
- [ ] **Fix build** - Use `build:fast` instead of `pnpm build`

### Short-term (New PRs)

- [ ] **Create pre-pr-checks.yml** - Tiered check system
- [ ] **Update lint-brand.ts** - Accept `--files` flag
- [ ] **Update branch protection** - Use new pre-pr-complete check

### Measurement

| Metric | Current | Target |
|--------|---------|--------|
| PR feedback time | 15-30 min | < 5 min |
| CI pass rate | ~60% | > 95% |
| Developer wait time | High | Low |

---

## Summary

1. **Root cause of FrameProcessor error:** ci.yml jobs don't use composite action
2. **Brand compliance failure:** Comment too long, needs truncation
3. **Build OOM:** Use `build:fast` instead of `tsc`
4. **PRE-PR optimization:** Tiered checks on changed files only

---

*Generated: 2026-02-01*
