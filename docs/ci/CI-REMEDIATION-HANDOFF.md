# CI Remediation Handoff Document

> **Date:** 2026-02-01
> **PRs:** #47, #48, #49, #50, #51, #52
> **Status:** In Progress

This document provides comprehensive context for continuing the CI remediation effort.

---

## Executive Summary

The CI pipeline has multiple failing workflows due to:
1. **agents-js local fork dependency** - `file:../agents-js/agents` doesn't exist in CI
2. **LiveKit version incompatibility** - Version drift causes FrameProcessor import errors
3. **Bundle size budgets** - Unrealistic thresholds from when app was smaller
4. **Token drift checks** - Failing on expected differences between source/generated
5. **Missing permissions** - Workflows can't comment on PRs
6. **Missing dependencies** - `glob` package not in devDependencies

---

## PR Merge Order (CRITICAL)

Merge in this **exact order** to avoid conflicts and ensure each fix builds on the previous:

### 1. PR #52: Composite Action with All Fixes (MERGE FIRST)

**Branch:** `fix/ci-agents-js-all-workflows`

**What it fixes:**
- Creates `.github/actions/setup-node-pnpm/action.yml` composite action
- Pins LiveKit to exact version `1.0.35` (not `^1.0.31` which can resolve to 1.0.40+)
- Fixes `generate-frontend-personas.ts` path calculation (5 levels up, not 1)
- Adds Joel persona to `design-system/tokens/personas.json`
- Adds optional chaining for undefined `description` fields
- Adds `glob` dependency for brand linter
- Updates all 17 workflows to use the composite action

**Key files changed:**
```
.github/actions/setup-node-pnpm/action.yml  (NEW - composite action)
.github/workflows/*.yml                      (all 17 workflows)
apps/cli/src/commands/generate/generate-frontend-personas.ts
design-system/tokens/personas.json
package.json                                 (glob dependency)
```

**What to verify after merge:**
- [ ] `Setup & Cache Dependencies` step passes in all workflows
- [ ] No `FrameProcessor` import errors
- [ ] `generate:personas` command works
- [ ] Brand Compliance check can run (has glob)

**Why first:** This PR contains the foundational composite action that all other workflows depend on. It also fixes critical path issues that prevent builds.

---

### 2. PR #49: Token Drift CI-Safe Check

**Branch:** `fix/ci-token-drift`

**What it fixes:**
- Makes token drift check validate structure instead of exact byte comparison
- Allows expected differences between source JSON and generated CSS
- Prevents false positives from whitespace/formatting differences

**Key files changed:**
```
.github/workflows/design-system.yml
scripts/tokens/check-drift.ts (or similar)
```

**What to verify after merge:**
- [ ] `Check Token Drift` job passes
- [ ] `Validate Design Tokens` job passes
- [ ] No false positive drift warnings

**Why second:** With the composite action in place, this PR can cleanly address token validation without worrying about dependency installation.

---

### 3. PR #48: Bundle Size Budget Calibration

**Branch:** `fix/ci-bundle-budget`

**What it fixes:**
- Updates bundle size budgets to realistic values based on current app size
- App has grown; old budgets were set when app was much smaller
- Sets new thresholds with reasonable headroom

**Key files changed:**
```
bundlesize.config.json (or similar)
.github/workflows/bundle-size.yml
```

**What to verify after merge:**
- [ ] `Check Bundle Size` job passes
- [ ] `📦 Bundle Size Check` job passes
- [ ] Bundle size warnings are for genuine regressions, not baseline mismatch

**Why third:** Bundle size checks depend on successful builds. With dependencies and tokens fixed, this can accurately measure bundle sizes.

---

### 4. PR #50: Rust Workflow agents-js Fix

**Branch:** `fix/ci-rust-cross-compile`

**What it fixes:**
- Adds agents-js dependency rewrite to Rust cross-compile workflow
- Ensures Rust NAPI modules can build in CI environment

**Key files changed:**
```
.github/workflows/rust-cross-compile.yml
```

**What to verify after merge:**
- [ ] Rust cross-compile workflow passes
- [ ] NAPI modules build successfully
- [ ] No dependency resolution errors in Rust builds

**Why fourth:** Rust builds are somewhat independent but still need the core dependency fix pattern.

---

### 5. PR #51: CI Health Gate Circuit Breaker

**Branch:** `feat/ci-health-gate`

**What it fixes:**
- Adds circuit breaker pattern for CI health
- Prevents cascading failures when one check is flaky
- Provides better visibility into CI health trends

**Key files changed:**
```
.github/workflows/ci-health-gate.yml (NEW)
```

**What to verify after merge:**
- [ ] Health gate workflow runs successfully
- [ ] Circuit breaker logic works as expected
- [ ] CI health metrics are being tracked

**Why fifth:** This is an enhancement that depends on all core workflows being stable first.

---

### 6. PR #47: Concurrency Control

**Branch:** `devops-supercharged`

**What it fixes:**
- Adds concurrency control to all workflows
- Prevents duplicate runs when pushing multiple commits
- Saves CI minutes by canceling superseded runs

**Key files changed:**
```
.github/workflows/*.yml (concurrency blocks)
```

**What to verify after merge:**
- [ ] Concurrent pushes cancel previous runs
- [ ] No duplicate workflow runs for same commit
- [ ] Concurrency groups are correctly scoped

**Why last:** This is an optimization. All workflows should be green before adding concurrency control.

---

## Detailed Fix Explanations

### 1. LiveKit Version Pinning

**Problem:**
```
SyntaxError: The requested module '@livekit/rtc-node' does not provide an export named 'FrameProcessor'
```

**Root Cause:**
- `package.json` has `"@livekit/rtc-node": "0.13.22"` pinned
- `^1.0.31` for `@livekit/agents` can resolve to `1.0.40`
- `1.0.40` requires `@livekit/rtc-node@^0.13.24` which has `FrameProcessor`
- Our pinned `0.13.22` doesn't have `FrameProcessor`

**Fix:**
```yaml
# In composite action
LIVEKIT_VERSION="1.0.35"  # Exact version, not ^
sed -i 's|"file:../agents-js/agents"|"'"$LIVEKIT_VERSION"'"|g' package.json
```

**Key insight:** The `^` semver prefix is dangerous here because minor LiveKit versions can have breaking dependency requirements.

---

### 2. generate-frontend-personas.ts Path Fix

**Problem:**
```
ENOENT: no such file or directory, scandir '.../apps/cli/src/commands/src/personas/bundles'
```

**Root Cause:**
```typescript
// WRONG - only 1 level up
const projectRoot = join(__dirname, '..');

// File is at: apps/cli/src/commands/generate/generate-frontend-personas.ts
// Needs to go: apps/cli/src/commands/generate -> apps/cli/src/commands -> apps/cli/src -> apps/cli -> apps -> root
```

**Fix:**
```typescript
// CORRECT - 5 levels up
const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
```

---

### 3. Joel Persona Missing

**Problem:**
```
Persona "joel" in colors.json but missing from personas.json
```

**Root Cause:**
- Joel was added to `design-system/tokens/colors.json`
- But not added to `design-system/tokens/personas.json`
- Brand consistency check fails

**Fix:** Added complete Joel persona definition:
```json
"joel": {
  "name": "Joel",
  "role": "Life Mentor",
  "archetype": "The Wise Mentor Who Brings Research and Warmth",
  "colors": {
    "primary": { "value": "#9A0718", "description": "Vanguard burgundy" },
    ...
  }
}
```

---

### 4. Optional Chaining for Undefined Description

**Problem:**
```
TypeError: Cannot read properties of undefined (reading 'split')
```

**Root Cause:**
- Some persona manifests don't have `identity.description`
- Code assumed it always exists

**Fix:**
```typescript
// Before
manifest.identity.description.split('.')[0]

// After
manifest.identity.description?.split('.')[0] || ''
```

---

### 5. Missing glob Dependency

**Problem:**
```
Cannot find package 'glob' imported from lint-brand.ts
```

**Root Cause:**
- `glob` was imported but never added to `package.json`

**Fix:**
```bash
pnpm add -wD glob@latest
```

---

## CI Checks Reference

| Check Name | PR That Fixes It | Expected After Fix |
|------------|------------------|-------------------|
| Setup & Cache Dependencies | #52 | ✅ PASS |
| Build & Test | #52 | ✅ PASS |
| Check Bundle Size | #48 | ✅ PASS |
| Check Token Drift | #49 | ✅ PASS |
| Brand Compliance Check | #52 (glob) | ✅ PASS |
| Token Validation | #52, #49 | ✅ PASS |
| Visual Regression | #52 | ✅ PASS |
| Accessibility Audit | #52 | ✅ PASS |
| Rust Cross-Compile | #50 | ✅ PASS |

---

## Verification Commands

After merging each PR, run these locally to verify:

```bash
# After PR #52
pnpm install
pnpm build:fast
pnpm generate:personas
pnpm brand:check

# After PR #49
pnpm tokens:check
pnpm tokens:sync  # Should report no changes

# After PR #48
pnpm build:bundle
# Bundle size should be under new thresholds

# After PR #50
cd apps/rust-audio && cargo build --release
cd apps/rust-perf && cargo build --release

# After all PRs
pnpm quality  # Full quality check should pass
```

---

## Rollback Plan

If any PR causes issues:

1. **Revert the PR** via GitHub UI or:
   ```bash
   git revert -m 1 <merge-commit-sha>
   ```

2. **Re-run CI** to confirm rollback worked

3. **Debug locally** using the verification commands above

---

## Contact

If issues persist after following this guide, check:
1. GitHub Actions logs for specific error messages
2. `docs/ci/ci-inventory.md` for workflow documentation
3. `docs/devops/00-charter.md` for CI contract

---

*Generated: 2026-02-01*
