#!/usr/bin/env bash
# =============================================================================
# CI HEALTH
# =============================================================================
# Finds CI jobs that failed on many different PRs in the last day. A job that
# fails on 40 PRs at once is one shared problem (a flaky test, a stale
# baseline), not 40 bugs, but each PR's author sees only "not my change" and
# nobody fixes it (2026-10-13: Frontend Quality and Unit Tests failed on ~40
# PRs while passing on main). Opens or updates one `ci-health` issue per job.
#
# Usage: scripts/ci/ci-health.sh [--dry-run]   (needs gh, jq, GH_TOKEN)
# Env:   MIN_PRS (default 5), SINCE_HOURS (default 24), WORKFLOW (default ci.yml)
# =============================================================================

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
MIN_PRS="${MIN_PRS:-5}"
SINCE_HOURS="${SINCE_HOURS:-24}"
WORKFLOW="${WORKFLOW:-ci.yml}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

since=$(date -u -d "-${SINCE_HOURS} hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null ||
  date -u -v "-${SINCE_HOURS}H" +%Y-%m-%dT%H:%M:%SZ)

# Failed PR runs: run id <tab> branch (one branch = one PR).
runs=$(gh api "repos/$REPO/actions/workflows/$WORKFLOW/runs?event=pull_request&status=failure&created=>=$since&per_page=100" \
  --paginate --jq '.workflow_runs[] | [.id, .head_branch] | @tsv')

if [[ -z "$runs" ]]; then
  echo "No failed $WORKFLOW PR runs since $since."
  exit 0
fi

# Failed job name <tab> branch <tab> job url, one line per failed job.
failed_jobs=$(while IFS=$'\t' read -r id branch; do
  gh api "repos/$REPO/actions/runs/$id/jobs?per_page=100" --paginate \
    --jq ".jobs[] | select(.conclusion == \"failure\") | [.name, \"$branch\", .html_url] | @tsv"
done <<<"$runs")

# Job name <tab> distinct PR branches, worst first.
widespread=$(awk -F'\t' '!seen[$1 FS $2]++ { n[$1]++ } END { for (j in n) print j "\t" n[j] }' <<<"$failed_jobs" |
  sort -t$'\t' -k2,2nr | awk -F'\t' -v min="$MIN_PRS" '$2 >= min')

if [[ -z "$widespread" ]]; then
  echo "No job failed on $MIN_PRS or more PRs since $since."
  exit 0
fi

# Did the same job pass on main lately? Then it's flaky or PR-only, not broken main.
main_run=$(gh api "repos/$REPO/actions/workflows/$WORKFLOW/runs?branch=main&event=push&status=success&per_page=1" \
  --jq '.workflow_runs[0].id // empty')
main_jobs=""
[[ -n "$main_run" ]] && main_jobs=$(gh api "repos/$REPO/actions/runs/$main_run/jobs?per_page=100" --paginate \
  --jq '.jobs[] | [.conclusion, .name] | @tsv')
main_passing=$(awk -F'\t' '$1 == "success" { print $2 }' <<<"$main_jobs")
# A job skipped there (PR-only like Related Integration Tests, or a push its path filter
# skips) says nothing about main: #1837 called main broken after main had fixed the test.
main_skipped=$(awk -F'\t' '$1 == "skipped" { print $2 }' <<<"$main_jobs")

while IFS=$'\t' read -r job count; do
  # No `| head`: under pipefail, head closing the pipe early kills awk with SIGPIPE and
  # the script exits 141, on exactly the days many PRs fail (run 39217715410).
  examples=$(awk -F'\t' -v j="$job" '$1 == j && !seen[$2]++ && shown++ < 10 { print "- `" $2 "`: " $3 }' <<<"$failed_jobs")
  if grep -qxF "$job" <<<"$main_passing"; then
    verdict="It **passed on main's latest run**, so it's most likely flaky (timing, teardown, a native crash) or depends on PR-only state such as a stale baseline."
  elif grep -qxF "$job" <<<"$main_skipped"; then
    verdict="It was **skipped on main's latest run** (a PR-only job, or a push it doesn't cover), so that run says nothing about main. Run the failing tests on origin/main: if they pass, main already has the fix and the PRs ran on an older base."
  else
    verdict="It did not pass on main's latest run, so main itself may be broken."
  fi
  title="CI health: \"$job\" failing on many PRs"
  body="**$job** failed on **$count** different PRs since $since.

$verdict Fix it once here rather than in each PR; after the fix merges, update the affected branches so they re-run.

Examples:
$examples

_Opened by scripts/ci/ci-health.sh._"

  echo "$title ($count PRs)"
  $DRY_RUN && { echo "  $verdict"; continue; }

  # awk reads to the end (no `exit`): closing the pipe early would SIGPIPE gh under pipefail.
  existing=$(gh issue list -R "$REPO" --state open --label ci-health --search "in:title \"$job\"" \
    --json number,title --jq '.[] | [.number, .title] | @tsv' | awk -F'\t' -v t="$title" '$2 == t && !found++ { print $1 }')
  if [[ -n "$existing" ]]; then
    gh issue comment "$existing" -R "$REPO" --body "$body" >/dev/null
    echo "  updated #$existing"
  else
    gh issue create -R "$REPO" --title "$title" --label ci-health --body "$body" | sed 's/^/  opened /'
  fi
done <<<"$widespread"
