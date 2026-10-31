# CI Workflow Inventory

This document provides a complete inventory of all GitHub Actions workflows in the Ferni monorepo.

## Summary

| Category | Count | Total Est. Monthly Minutes |
|----------|-------|---------------------------|
| Core CI | 1 | ~2,200 (optimized) |
| Deploy | 5 | ~500 |
| Quality | 6 | ~300 |
| Scheduled | 4 | ~100 |
| **Total** | **16** | **~3,100** |

## Core CI Workflows

### ci.yml (Primary)

**Purpose:** Main CI pipeline - lint, test, build, security scan

| Property | Value |
|----------|-------|
| Trigger | Push/PR to main, develop (with path filters) |
| Runner | Self-hosted (GCE) |
| Jobs | 11 parallel jobs |
| Duration | ~10 min (optimized from ~22 min) |
| Monthly Runs | ~200 |

**Jobs:**
- `lint` - TypeScript type check + ESLint
- `test-unit-shard` - Unit tests with coverage, four vitest shards ("Unit Tests (n/4)")
- `test-unit` - The required "Unit Tests" check: passes only when every shard passed
- `test-integration` - Integration tests
- `test-agi-features` - AGI feature tests
- `build` - Backend + design system + frontend
- `security` - Dependency audit + secret scan
- `code-quality` - Unified audit metrics
- `quality-gates` - Blocking quality thresholds
- `validation` - Voice and integration validation
- `frontend-quality` - Frontend-specific checks
- `dependencies` - Outdated dependency check

**How many unit shards a pull request gets** (`ci.yml`, `test-unit-shard`):

| Pull request | Shards | What each runs |
|--------------|--------|----------------|
| Small affected set (at most 700 test files) | 1 | `vitest run --changed HEAD^1` |
| Big affected set (over 700 files, e.g. any file under `src/config/flags/`) | 4 | `vitest run --changed HEAD^1 --shard=N/4`: a quarter of the affected files |
| Diff hits a `forceRerunTriggers` file, touches crisis-safety or memory code, or carries `ci:full-tests` | 4 | a quarter of the whole suite, with coverage |

- A file under `src/config/flags/` reaches ~1,500 test files through the generated barrel
  `index.generated.ts`. One shard timed out on those at its 25 min (7 of 22 attempts in
  four hours, 2026-10-29); a full run on four shards never took more than 14 min.
- Setup counts the affected files with `scripts/ci/unit-affected-count.mjs`
  (`vitest list --changed HEAD^1 --filesOnly`, about a minute) and outputs
  `unit-affected-count` and `unit-affected-sharded`. The threshold is `THRESHOLD` in that
  script. If the count fails, the PR gets four shards.
- vitest applies `--shard` after `--changed` selects the files, so the four shards are
  disjoint and together run the whole affected set. `vitest list` ignores `--shard`, so
  use `vitest run --shard` (or the CI run) to see a shard's slice.
- The "Unit Tests" check fails when the number of shards that ran is not the number the
  run called for (4, or 1 for a small affected set). The matrix condition, `FULL_SUITE`
  and `AFFECTED_SHARDED` are pinned together by `src/tests/deploy/merge-queue-jobs.test.ts`.

**Optimizations Applied:**
- Path filters (70% reduction in unnecessary runs)
- Concurrency control (cancel-in-progress)
- Composite action (DRY setup)
- pnpm v10 standardization

## Deploy Workflows

### deploy-production.yml

**Purpose:** Blue-green deployment to production

| Property | Value |
|----------|-------|
| Trigger | push to main whose tree the merge queue tested; CI success on a push to main (workflow_run); manual |
| Runner | ubuntu-24.04, one job |
| Duration | ~15 min |

### deploy-firebase.yml

**Purpose:** Deploy frontend to Firebase Hosting

| Property | Value |
|----------|-------|
| Trigger | Manual |
| Runner | ubuntu-latest |
| Duration | ~5 min |

### build.yml

**Purpose:** The required `Build & Test` check. Builds the backend, design system, web app and UI server image, then starts the image and waits for `/health`.

| Property | Value |
|----------|-------|
| Trigger | Merge queue (on PRs it's skipped and reports success, #1250) |
| Runner | `CI_PR_RUNNER` / `CI_RUNNER` |

### staging.yml

**Purpose:** Cloud Run preview of a PR (`staging-pr-<n>`). Nothing required runs here.

| Property | Value |
|----------|-------|
| Trigger | PR with the `preview` label (adding it deploys, pushes redeploy), or manual |
| Runner | ubuntu-latest |

### deploy-worker.yml

**Purpose:** Deploy background workers

| Property | Value |
|----------|-------|
| Trigger | Manual |
| Runner | ubuntu-latest |
| Duration | ~8 min |

## Quality Workflows

### lead-verified.yml (enforced on PRs and in the merge queue)

**Purpose:** Check that the exact code a PR merges was independently verified
(rules: `scripts/ci/lead-verified.ts`, always run from main's copy, never the PR's).
Runs on PRs, PR comments and merge_group. It fails when the head is NOT_VERIFIED or the
evidence can't be read (ERROR): on merge_group since 2026-10-25, and on PRs since
2026-10-29, so an armed but unverified PR waits outside the queue instead of entering it,
failing and ejecting every group behind it (one sweep that day armed 13 unverified PRs).
Comment-triggered runs only report: they don't update the PR's check, so
`post-lead-verify.sh` re-runs the PR's check after it posts. The queue drops the PR only while `Lead Verified` is a required check (rollout:
merge this, then add the context to main's required checks). The only allowed author, for
both the `lead-verify` status and bound comments, is `ferni-verifier[bot]`. A green "Lead
Verified" on a PR page is not verification; the evidence is that app's
`RESULT_verifier=PASS sha=<head>` comment or its `lead-verify` status. CI typechecks it via `pnpm typecheck:memory-eval`
(`tsconfig.scripts.json`).

**How a verifier marks a PR verified.** Verify the PR's current head, then run (as the
`ferni-verifier` app: the script mints its own token and refuses without one)
`scripts/ci/post-lead-verify.sh <pr> <head-sha> pass|fail "<what you ran>"`. It refuses
any SHA that is not the head and posts the `lead-verify` status (the only tamper-proof
evidence) plus a comment whose first line is `RESULT_verifier=PASS sha=<40-hex head>`.
Then it waits for the PR's Lead Verified run on that head to finish and re-runs it (as
`ferni-agent`, which may re-run Actions; the verifier app may not), unless a PASS finds it
passing already. Exit 5: the verdict is posted but the check wasn't re-run; re-run it by
hand (`gh run rerun <id>`) or it updates on the next push.
A hand-written comment counts only if that marker starts a line outside quotes and code
fences, the author is in `LEAD_VERIFIED_AUTHORS` (see above), and it is never
edited. Prose verdicts, reviews and auto-merge text never verify. Any FAIL wording
(`RESULT_verifier=FAIL`, `Verdict: FAIL`, `Verification FAILED`, ...) from anyone, in a
comment, review or inline comment, blocks every PASS posted at or before it: keep FAIL
words out of a PASS summary. A new push needs a new verdict, except a pure "merge main
in" (no conflict, no extra edit), which carries the verdict forward.

**Merge groups.** The repo squashes queue entries, so a queue commit has one parent and
its PRs are the `(#N)` titles of the commits above main, plus the PR the ref names. Each
PR is judged on its current head. A commit with no PR number blocks the group. Known
gaps: a PR whose head moves after queueing is judged on the new head, not the queued one,
and the PR can still edit the workflow file (not the evaluator, which comes from main)
until main requires code-owner review (#2547) or the workflow moves to a main-pinned
trigger. `issue_comment` runs log a
verdict but do not update the PR check, so re-run the check after a new verdict.

### design-system.yml

**Purpose:** Validate design tokens, build packages

| Property | Value |
|----------|-------|
| Trigger | Push/PR touching design-system/* |
| Runner | ubuntu-latest |
| Duration | ~5 min |

### chromatic.yml

**Purpose:** Visual regression testing with Chromatic

| Property | Value |
|----------|-------|
| Trigger | Push/PR touching design-system/* |
| Runner | ubuntu-latest |
| Duration | ~3 min |

### bth-benchmarks.yml

**Purpose:** Better-Than-Human capability benchmarks

| Property | Value |
|----------|-------|
| Trigger | Weekly, PR touching BTH code |
| Runner | ubuntu-latest |
| Duration | ~5 min |

### lighthouse-ci.yml

**Purpose:** Accessibility and performance audits

| Property | Value |
|----------|-------|
| Trigger | Weekly, PR touching promo/* |
| Runner | ubuntu-latest |
| Duration | ~4 min |

### security-scan.yml

**Purpose:** Dependency and code security scanning

| Property | Value |
|----------|-------|
| Trigger | Daily, PR touching code |
| Runner | ubuntu-latest |
| Duration | ~3 min |

### token-check.yml

**Purpose:** Validate design token drift

| Property | Value |
|----------|-------|
| Trigger | PR touching design-system/* |
| Runner | ubuntu-latest |
| Duration | ~2 min |

## Scheduled Workflows

### ci-metrics.yml

**Purpose:** Weekly CI metrics collection and reporting

| Property | Value |
|----------|-------|
| Trigger | Weekly (Monday 9 AM UTC), manual |
| Runner | ubuntu-latest |
| Duration | ~2 min |

### error-alerting.yml

**Purpose:** Monitor and alert on error patterns

| Property | Value |
|----------|-------|
| Trigger | Scheduled |
| Runner | ubuntu-latest |
| Duration | ~1 min |

### uptime-monitor.yml

**Purpose:** Health check monitoring

| Property | Value |
|----------|-------|
| Trigger | Every 5 min |
| Runner | ubuntu-latest |
| Duration | ~30 sec |

### cost-alerts.yml

**Purpose:** GCP cost monitoring and alerts

| Property | Value |
|----------|-------|
| Trigger | Daily |
| Runner | ubuntu-latest |
| Duration | ~1 min |

## Optimization Status

| Workflow | Path Filters | Concurrency | Composite Action | pnpm v10 |
|----------|-------------|-------------|------------------|----------|
| ci.yml | ✅ | ✅ | ✅ | ✅ |
| design-system.yml | ✅ | ❌ | ❌ | ✅ |
| chromatic.yml | ✅ | ❌ | ❌ | ✅ |
| bth-benchmarks.yml | ✅ | ❌ | ❌ | ✅ |
| lighthouse-ci.yml | ✅ | ❌ | ✅ | ✅ |
| security-scan.yml | ✅ | ❌ | ✅ | ✅ |

## Next Steps

1. Add concurrency control to remaining workflows
2. Migrate remaining workflows to use composite action
3. Consider consolidating quality workflows
4. Evaluate Nx for affected-only testing
