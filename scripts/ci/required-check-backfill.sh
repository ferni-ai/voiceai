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
# One PR's trouble never stops the run (#1953, a conflicted PR, made 4 runs in
# a row exit before reaching the PRs after it). A PR whose update reports a
# merge conflict is skipped: it needs its author, not CI, so it is not a
# failure. Any other per-PR error (an API call, the update itself) is logged as
# ::error::, the loop goes on, and the script exits 1 at the end.
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
conflicted=0
failed=0

# Log a per-PR error and move on; the exit status at the end reports it.
fail() {
  echo "::error::$*"
  failed=$((failed + 1))
}

prs=$(gh pr list --repo "$REPO" --base "$BASE" --state open --limit 300 \
  --json number,headRefName,headRefOid,isDraft,isCrossRepository,autoMergeRequest,mergeable \
  --jq '.[] | select(.autoMergeRequest != null and (.isDraft | not) and (.isCrossRepository | not))
        | [.number, .headRefName, .headRefOid, .mergeable] | @tsv')

while IFS=$'\t' read -r pr branch sha mergeable; do
  [[ -z "$pr" ]] && continue
  grep -qxF "$pr" <<<"$queued" && continue
  # A conflicted PR gets no pull_request runs at all; it needs its author, not a rerun.
  # GitHub computes `mergeable` lazily, so a conflicted PR often lists as UNKNOWN and
  # only the update below finds out.
  if [[ "$mergeable" == "CONFLICTING" ]]; then
    echo "#$pr ($branch) has merge conflicts; skipped."
    conflicted=$((conflicted + 1))
    continue
  fi
  if ((touched >= MAX)); then
    echo "Reached MAX=$MAX; the rest wait for the next run."
    break
  fi

  if ! pushed=$(gh api "repos/$REPO/commits/$sha" --jq '.commit.committer.date'); then
    fail "#$pr ($branch): could not read head commit $sha; skipped."
    continue
  fi
  age_min=$(((now - $(date -u -d "$pushed" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$pushed" +%s)) / 60))
  ((age_min < MIN_AGE_MIN)) && continue

  # Runs still waiting for a runner haven't created all their checks yet.
  if ! busy=$(gh api "repos/$REPO/actions/runs?head_sha=$sha&per_page=100" \
    --jq '[.workflow_runs[] | select(.status != "completed")] | length'); then
    fail "#$pr ($branch): could not list runs for $sha; skipped."
    continue
  fi
  if ((busy > 0)); then
    echo "#$pr ($branch): $busy run(s) still in flight; skipped."
    continue
  fi

  # Each call is checked on its own: a failed one would otherwise read as "no checks
  # reported" and update the branch on an API error.
  if ! check_runs=$(gh api "repos/$REPO/commits/$sha/check-runs?per_page=100" --paginate --jq '.check_runs[].name') ||
    ! statuses=$(gh api "repos/$REPO/commits/$sha/statuses?per_page=100" --paginate --jq '.[].context'); then
    fail "#$pr ($branch): could not read the checks on $sha; skipped."
    continue
  fi
  reported=$(printf '%s\n%s\n' "$check_runs" "$statuses" | sort -u)
  missing=$(comm -23 <(sort -u <<<"$required") <(printf '%s\n' "$reported"))
  [[ -z "$missing" ]] && continue

  echo "#$pr ($branch @ ${sha:0:9}, ${age_min} min old) has no result for:"
  sed 's/^/  - /' <<<"$missing"

  echo "  -> update the branch"
  if ! $DRY_RUN; then
    if ! out=$(gh pr update-branch "$pr" --repo "$REPO" 2>&1); then
      sed 's/^/     /' <<<"$out"
      if grep -qi 'conflict' <<<"$out"; then
        echo "  #$pr has merge conflicts; skipped (its author has to resolve them)."
        conflicted=$((conflicted + 1))
      else
        fail "#$pr ($branch): update-branch failed: $out"
      fi
      continue
    fi
    sed 's/^/     /' <<<"$out"
  fi
  touched=$((touched + 1))
done <<<"$prs"

echo "Updated $touched PR(s)$($DRY_RUN && echo ' (dry run)'); skipped $conflicted with conflicts; $failed failed."
((failed == 0)) || exit 1
