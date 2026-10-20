#!/usr/bin/env bash
# =============================================================================
# NIGHTLY FAILURE
# =============================================================================
# Opens or updates one `ci-health` issue for a failed scheduled run. The e2e
# suites, memory-recall gate and benchmarks run nightly on main instead of on
# every PR (#1366); a failed scheduled run notifies nobody, so without this it
# would go unseen. Same issue shape as scripts/ci/ci-health.sh.
# A failed push run on main (CI's and Build Native Apps' jobs that the merge
# queue skips) gets a `main-red` issue instead.
#
# Usage: RUN_ID=<id> scripts/ci/nightly-failure.sh [--dry-run]   (needs gh, jq, GH_TOKEN)
# =============================================================================

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
: "${RUN_ID:?RUN_ID is required}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

run=$(gh api "repos/$REPO/actions/runs/$RUN_ID")
workflow=$(jq -r .name <<<"$run")
url=$(jq -r .html_url <<<"$run")
sha=$(jq -r '.head_sha[0:9]' <<<"$run")
started=$(jq -r .run_started_at <<<"$run")
event=$(jq -r .event <<<"$run")

failed=$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100" --paginate \
  --jq '.jobs[] | select(.conclusion == "failure") | "- [\(.name)](\(.html_url))"')

if [[ "$event" == "push" ]]; then
  label=main-red
  title="main red: \"$workflow\" failed on a push to main"
  why="The merge queue keeps merging onto a red main until this is fixed. The jobs no required check needs (AGI Feature Tests, Build, Code Quality Metrics, Validation, E2E Validation, Dependency Check, the iOS build) run only on this push, never in the queue. Fix it or revert the commit; if it was a flake, say so and close."
else
  label=ci-health
  title="CI health: nightly \"$workflow\" failing on main"
  why="These suites run nightly instead of on every PR while OPTIONAL_CI is off (#1366), so this is the only place the failure shows. Fix it once here; if it was a flake, say so and close."
fi
body="The $event **$workflow** run on main failed ($url, commit \`$sha\`, started $started).

$why

Failed jobs:
${failed:-"- (none reported as failed; see the run)"}

_Opened by scripts/ci/nightly-failure.sh._"

echo "$title"
if $DRY_RUN; then
  echo "$body"
  exit 0
fi

[[ "$label" == main-red ]] &&
  gh label create main-red -R "$REPO" --force --color B60205 --description "A push to main failed CI" >/dev/null
# awk reads to the end (no `exit`): closing the pipe early would SIGPIPE gh under pipefail.
existing=$(gh issue list -R "$REPO" --state open --label "$label" --search "in:title \"$workflow\"" \
  --json number,title --jq '.[] | [.number, .title] | @tsv' | awk -F'\t' -v t="$title" '$2 == t && !found++ { print $1 }')
if [[ -n "$existing" ]]; then
  gh issue comment "$existing" -R "$REPO" --body "$body" >/dev/null
  echo "  updated #$existing"
else
  gh issue create -R "$REPO" --title "$title" --label "$label" --body "$body" | sed 's/^/  opened /'
fi
