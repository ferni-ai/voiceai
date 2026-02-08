# CI Failure Remediation Guide

> Status as of 2026-02-08 after PR #52 consolidation

## Resolved in PR #52

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` | Composite action rewrites `file:` overrides via sed, making frozen lockfile always mismatch | Disabled `--frozen-lockfile` in all 12 workflows |
| `npm error: workspace:*` | `performance-budget.yml` and `stage-direction-tests.yml` used npm instead of pnpm | Replaced with composite action |
| Token drift false positives | Fresh git checkouts have uniform timestamps, causing stale-file detection | Added `--strict` mode; CI uses structure validation only |
| Orphaned submodule `apps/btcw` | Mode 160000 entry in git index with no `.gitmodules` | Removed from index |
| `Invalid option '--if-present'` | `pnpm lint --if-present` passes flag through to eslint | Removed `--if-present` |

---

## Outstanding Failures

### 1. Lint & Type Check: eslint `--if-present` (FIXED)

**Status:** Fixed in latest commit
**File:** `.github/workflows/ci.yml:131`
**Error:** `Invalid option '--if-present' - perhaps you meant '--parser'?`
**Fix:** Changed `pnpm lint --if-present` to `pnpm lint`

---

### 2. Quality Gates: TODO Audit failure

**Status:** Needs investigation
**File:** `.github/workflows/ci.yml:528-529` calls `pnpm ci:quality-gates`
**Script:** `scripts/ci-quality-gates.ts` → internally calls `scripts/audit-todos.ts`
**Error:** `Failed to run TODO audit: Error: Command failed`

**Root cause:** The audit-todos script uses `git blame` to determine TODO age. It fails when:
- Git history is insufficient (checkout needs `fetch-depth: 0`)
- The `tsx` runtime encounters a parse error in the script

**Fix:**
1. Verify `fetch-depth: 0` is set for the quality gates job checkout step
2. Run `npx tsx scripts/audit-todos.ts --json` locally to reproduce
3. If the script has a bug, fix it; if it's a git history issue, add `fetch-depth: 0`

---

### 3. Chromatic / Design System: `tsup: not found`

**Status:** Needs workflow fix
**File:** `.github/workflows/chromatic.yml:36-39`
**Package:** `packages/ferni-react/package.json` — `"build": "tsup"`, `"tsup": "^8.5.1"` in devDependencies
**Error:** `sh: 1: tsup: not found` → `ELIFECYCLE Command failed`

**Root cause:** The Chromatic workflow runs `pnpm install --no-frozen-lockfile` followed by `pnpm build` which triggers workspace package builds. The `ferni-react` package needs `tsup` but it may not be installed/linked properly when the workspace install encounters the rewritten agents-js overrides.

**Fix options:**
1. Add `tsup` to root devDependencies so it's always available: `pnpm add -wD tsup`
2. Or ensure the Chromatic workflow builds ferni-react explicitly after install: `cd packages/ferni-react && pnpm install && pnpm build`
3. Or skip the ferni-react build in Chromatic if it's not needed for visual regression

---

### 4. Unit Tests / Deploy Staging: `GOOGLE_API_KEY not set`

**Status:** Missing CI secret
**Files:** `.github/workflows/ci.yml:241`, various test files
**Error:** `LLM generation failed, using seed scenarios: Error: GOOGLE_API_KEY not set`

**Root cause:** Tests that use Gemini for synthetic scenario generation require `GOOGLE_API_KEY`. The tests gracefully degrade to seed scenarios but some downstream assertions may fail.

**Required secret:** `GOOGLE_API_KEY`
**Where to set:** GitHub repo → Settings → Secrets and variables → Actions → Repository secrets

**Other secrets referenced in workflows:**

| Secret | Workflow | Purpose | Impact if Missing |
|--------|----------|---------|-------------------|
| `GOOGLE_API_KEY` | `ci.yml:241`, `ai-automation.yml:59` | LLM tests, AI CLI commands | Tests use seed data, some fail |
| `CHROMATIC_PROJECT_TOKEN` | `chromatic.yml:45` | Visual regression uploads | Chromatic step skipped/fails |
| `CODECOV_TOKEN` | `ci.yml:190,264` | Coverage upload | Coverage not reported |
| `LIVEKIT_URL` | `ci.yml:242` | Integration tests | LiveKit tests skip |
| `LIVEKIT_API_KEY` | `ci.yml:243` | Integration tests | LiveKit tests skip |
| `LIVEKIT_API_SECRET` | `ci.yml:244` | Integration tests | LiveKit tests skip |
| `GCP_PROJECT_ID` | `ci.yml:245-246` | Firestore tests | Firestore tests skip |

**Action needed:** Configure these secrets in the GitHub repository settings. At minimum, `GOOGLE_API_KEY` is needed to unblock unit tests.

---

### 5. Rust Native: Cargo.lock version mismatch

**Status:** Needs Rust version bump
**File:** `.github/workflows/rust-native.yml:18` — `RUST_VERSION: '1.75'`
**Error:** `lock file version 4 was found, but this version of Cargo does not understand this lock file`

**Root cause:** `Cargo.lock` was generated with a newer Rust toolchain that uses lock file format v4. The CI workflow pins Rust to 1.75 (Dec 2023), which may not support this format.

**Fix:**
1. Check local Rust version: `rustc --version` (likely 1.80+)
2. Update `RUST_VERSION` in `rust-native.yml` to match: `RUST_VERSION: '1.82'` (or whatever generates v4 lockfiles)
3. Or regenerate `Cargo.lock` with Rust 1.75: `cargo +1.75.0 generate-lockfile`

---

### 6. Brand Compliance: Intentional failure on violations

**Status:** Expected behavior
**File:** `.github/workflows/brand-compliance.yml:96-98`
**Script:** `apps/cli/src/commands/quality/lint-brand.ts`

**Root cause:** The brand linter found violations in the diff. This is **working as intended** — it's a blocking check that enforces:
- No hardcoded hex colors (use CSS variables)
- No raw `console.log` in UI code
- Design token compliance

**Fix:** Review the brand linter output and either:
1. Fix the violations in the code
2. Or if this is a false positive on workflow YAML files, adjust the linter's file patterns

---

### 7. AI Automation: SyntaxError in CLI

**Status:** Needs investigation
**File:** `.github/workflows/ai-automation.yml:85`
**Error:** `SyntaxError: Invalid or unexpected token`

**Root cause:** The workflow runs `pnpm tsx apps/cli/src/index.ts review full` and the CLI entry point or the `review` command handler has a syntax error.

**Fix:**
1. Run locally: `pnpm tsx apps/cli/src/index.ts review full`
2. If it fails, check for syntax errors in the review command
3. Common cause: TypeScript syntax not supported by the `tsx` runtime version

---

### 8. Lighthouse CI: Install/build failure

**Status:** Flaky / environment issue
**File:** `.github/workflows/lighthouse-ci.yml`

**Root cause:** Heavy dependency install (Firebase, Lighthouse) combined with network timeouts on GitHub-hosted runners. The workflow saw `ECONNRESET` errors during `pnpm install`.

**Fix options:**
1. Add retry logic to the install step
2. Use the composite action's caching to speed up installs
3. Accept occasional flakiness and re-run on failure

---

## Priority Order

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | Add `GOOGLE_API_KEY` secret | 5 min | Unblocks unit tests, integration tests, deploy staging |
| 2 | Fix tsup not found (add to root deps) | 5 min | Unblocks Chromatic + Design System |
| 3 | Bump Rust version in workflow | 5 min | Unblocks Rust native builds |
| 4 | Investigate TODO audit script | 15 min | Unblocks Quality Gates |
| 5 | Fix AI Automation CLI syntax | 15 min | Unblocks AI review |
| 6 | Review brand violations | 30 min | Unblocks brand compliance |
| 7 | Add remaining secrets | 10 min | Enables full test coverage |
| 8 | Lighthouse retry logic | 15 min | Reduces flakiness |
