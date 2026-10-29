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

### lead-verified.yml (enforced in the merge queue)

**Purpose:** Check that the exact code a PR merges was independently verified
(rules: `scripts/ci/lead-verified.ts`, always run from main's copy, never the PR's).
Runs on PRs, PR comments and merge_group. On a PR it only reports. On merge_group it
fails (since 2026-10-25) when a queued head is NOT_VERIFIED or the evidence can't be read
(ERROR). The queue drops the PR only while `Lead Verified` is a required check (rollout:
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
and the workflow file runs from the PR's own merge or queue commit (the evaluator comes
from main). What stops a PR editing it is the main ruleset's required code-owner review
on `.github/workflows/` (on, checked 2026-10-29), but stale approvals aren't dismissed on
push, so an approval given before a later workflow edit still counts until the workflow
moves to a main-pinned trigger. `issue_comment` runs log a
verdict but do not update the PR check, so re-run the check after a new verdict.

### autonomy-lanes.yml (reports until it is a required check)

**Purpose:** Keep protected lanes behind the right hands (rules:
`scripts/ci/autonomy-lanes.ts`, lanes: `scripts/ci/autonomy-policy.json`, both always run
from main's copy). A **crisis** PR (988 and referral, AI-disclosure notices, minor
protections) needs an approving review from `sethdford` on its exact head commit, with
no exception: commit author and committer logins come from the commit email, so anyone
who can push can claim his, and authorship never signs. His own crisis PRs, which GitHub
won't let him approve, merge with his ruleset admin bypass. A crisis path counts for
every author. In a **loop PR**, a changed line (added or removed) also counts when it
matches a crisis pattern (988 in any written form) or names a screened export of a
crisis module: one no non-crisis module in `src/` also exports and no built-in method
shares (`str.normalize`), plus the policy's
reviewed `alwaysScreen` (`autonomy-crisis-symbols.generated.json`, regenerated by
`scripts/ci/crisis-symbols.ts --write` and kept exact by `crisis-symbols.test.ts`), and
so do any binary file and any import of a crisis module (a
relative specifier by the path it resolves to, any other by its name). A loop PR is one
whose head branch starts with `loop/`; this depends on a ruleset that lets the
`ferni-loop` app push only to `loop/**` (SETUP.md). Commit attribution can't establish
it: author and committer logins come from the commit email, which anyone with push access
can set (this Mac's default git identity reads as sethdford). A `ferni-loop[bot]` opener,
author or committer, or a commit with no linked account, adds the screen; none of them
can remove it. A path git had to quote or that holds a control character puts the PR in
every lane. An **evaluator** PR (the code that grades changes, this workflow and
CODEOWNERS) needs the `ferni-eval` app as opener with every commit verified by GitHub
and committed by the app (what committing through the GitHub API produces; a git push
can't), or the same approval; Seth's own evaluator PRs, like his crisis ones, merge with
his admin bypass. **Privacy** is reported only; the local arm gate already requires a verifier
PASS there. Runs on PRs, reviews and merge_group; fails only on merge_group, where each
queued PR is judged on its current head, and the queue acts on it only once `Autonomy
Lanes` is a required check. The policy's crisis and evaluator paths are also in
`.github/CODEOWNERS` (`codeowners-covers-policy.test.ts` keeps them in step). Like Lead
Verified, the workflow file runs from the PR's own merge or queue commit; what stops a
PR editing it is the main ruleset's required code-owner review on `.github/workflows/`
(on, checked 2026-10-29). Known gap: stale approvals aren't dismissed on push, so a
code-owner approval given before a later edit to this workflow still satisfies that
rule (the check itself only counts approvals on the exact head).

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
