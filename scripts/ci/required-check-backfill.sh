#!/usr/bin/env bash
# =============================================================================
# REQUIRED CHECK BACKFILL
# =============================================================================
# A check made required after a PR's last push never ran on that PR, so the PR
# shows all green, can't enter the merge queue, and nothing says why. On
# 2026-10-18 "Menu E2E" became required at 17:04Z (#1845) and every armed PR
# pushed before then sat BLOCKED until someone noticed by hand.
#
# For each open, armed (auto-merge on), non-draft PR from this repo, this lists
# the required checks with no result on its head commit and updates the branch,
# which runs every check with main's workflows. Running just the missing
# workflow with workflow_dispatch doesn't work: a dispatch reads the workflow
# from the branch, and these branches predate it (tried on #1939: HTTP 422).
# At most MAX PRs are updated per run, so a new required check can't flood the
# runners.
#
# Usage: scripts/ci/required-check-backfill.sh [--dry-run]   (needs gh, jq)
# Env:   MAX (default 5), MIN_AGE_MIN (default 30: skip heads pushed since,
#        their checks may not have been created yet), BASE (default main)
# =============================================================================

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
MAX="${MAX:-5}"
MIN_AGE_MIN="${MIN_AGE_MIN:-30}"
BASE="${BASE:-main}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true
for n in "$MAX" "$MIN_AGE_MIN"; do
  [[ "$n" =~ ^[0-9]+$ ]] || { echo "MAX and MIN_AGE_MIN must be whole numbers" >&2; exit 2; }
done

required=$(gh api "repos/$REPO/branches/$BASE" --jq '.protection.required_status_checks.contexts[]')
if [[ -z "$required" ]]; then
  echo "No required checks on $BASE."
  exit 0
fi

# Never update a queued PR: that drops it from the queue.
queued=$(gh api graphql -F owner="${REPO%/*}" -F name="${REPO#*/}" -F branch="$BASE" -f query='
  query($owner: String!, $name: String!, $branch: String!) {
    repository(owner: $owner, name: $name) {
      mergeQueue(branch: $branch) { entries(first: 100) { nodes { pullRequest { number } } } }
    }
  }' --jq '.data.repository.mergeQueue.entries.nodes[].pullRequest.number')

now=$(date -u +%s)
touched=0

prs=$(gh pr list --repo "$REPO" --base "$BASE" --state open --limit 300 \
  --json number,headRefName,headRefOid,isDraft,isCrossRepository,autoMergeRequest,mergeable \
  --jq '.[] | select(.autoMergeRequest != null and (.isDraft | not) and (.isCrossRepository | not))
        | [.number, .headRefName, .headRefOid, .mergeable] | @tsv')

while IFS=$'\t' read -r pr branch sha mergeable; do
  [[ -z "$pr" ]] && continue
  grep -qxF "$pr" <<<"$queued" && continue
  # A conflicted PR gets no pull_request runs at all; it needs its author, not a rerun.
  if [[ "$mergeable" == "CONFLICTING" ]]; then
    echo "#$pr ($branch) has merge conflicts; skipped."
    continue
  fi
  if ((touched >= MAX)); then
    echo "Reached MAX=$MAX; the rest wait for the next run."
    break
  fi

  pushed=$(gh api "repos/$REPO/commits/$sha" --jq '.commit.committer.date')
  age_min=$(((now - $(date -u -d "$pushed" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$pushed" +%s)) / 60))
  ((age_min < MIN_AGE_MIN)) && continue

  # Runs still waiting for a runner haven't created all their checks yet.
  busy=$(gh api "repos/$REPO/actions/runs?head_sha=$sha&per_page=100" \
    --jq '[.workflow_runs[] | select(.status != "completed")] | length')
  if ((busy > 0)); then
    echo "#$pr ($branch): $busy run(s) still in flight; skipped."
    continue
  fi

  reported=$( {
    gh api "repos/$REPO/commits/$sha/check-runs?per_page=100" --paginate --jq '.check_runs[].name'
    gh api "repos/$REPO/commits/$sha/statuses?per_page=100" --paginate --jq '.[].context'
  } | sort -u)
  missing=$(comm -23 <(sort -u <<<"$required") <(printf '%s\n' "$reported"))
  [[ -z "$missing" ]] && continue

  echo "#$pr ($branch @ ${sha:0:9}, ${age_min} min old) has no result for:"
  sed 's/^/  - /' <<<"$missing"

  echo "  -> update the branch"
  $DRY_RUN || gh pr update-branch "$pr" --repo "$REPO"
  touched=$((touched + 1))
done <<<"$prs"

echo "Updated $touched PR(s)$($DRY_RUN && echo ' (dry run)')."
