#!/usr/bin/env bash
# =============================================================================
# NIGHTLY FAILURE
# =============================================================================
# Opens or updates one `ci-health` issue for a failed scheduled run. The e2e
# suites, memory-recall gate and benchmarks run nightly on main instead of on
# every PR (#1366); a failed scheduled run notifies nobody, so without this it
# would go unseen. Same issue shape as scripts/ci/ci-health.sh.
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

failed=$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100" --paginate \
  --jq '.jobs[] | select(.conclusion == "failure") | "- [\(.name)](\(.html_url))"')

title="CI health: nightly \"$workflow\" failing on main"
body="The scheduled **$workflow** run on main failed ($url, commit \`$sha\`, started $started).

These suites run nightly instead of on every PR while OPTIONAL_CI is off (#1366), so this is the only place the failure shows. Fix it once here; if it was a flake, say so and close.

Failed jobs:
${failed:-"- (none reported as failed; see the run)"}

_Opened by scripts/ci/nightly-failure.sh._"

echo "$title"
if $DRY_RUN; then
  echo "$body"
  exit 0
fi

# awk reads to the end (no `exit`): closing the pipe early would SIGPIPE gh under pipefail.
existing=$(gh issue list -R "$REPO" --state open --label ci-health --search "in:title \"$workflow\"" \
  --json number,title --jq '.[] | [.number, .title] | @tsv' | awk -F'\t' -v t="$title" '$2 == t && !found++ { print $1 }')
if [[ -n "$existing" ]]; then
  gh issue comment "$existing" -R "$REPO" --body "$body" >/dev/null
  echo "  updated #$existing"
else
  gh issue create -R "$REPO" --title "$title" --label ci-health --body "$body" | sed 's/^/  opened /'
fi
