#!/usr/bin/env bash
# =============================================================================
# CANCEL ORPHAN MERGE-QUEUE RUNS
# =============================================================================
# When the merge queue rebuilds (an entry fails, a PR jumps, an admin merge
# moves main), it deletes the old gh-readonly-queue/main/* refs, but their
# workflow runs keep going: ci.yml groups merge_group concurrency by run id, so
# nothing cancels them. On 2026-10-18 at 21:22Z, 9 of the 10 merge-queue CI runs
# in progress tested groups that no longer existed, holding runners the live
# queue was waiting for; 28 such runs were cancelled by hand.
#
# This cancels queued or running merge_group runs whose ref is gone. A run is
# only cancelled when its ref is missing from two reads of the queue refs taken
# before and after listing the runs, and it is older than MIN_AGE_MIN, so a
# group created mid-sweep is never touched.
#
# Usage: scripts/ci/cancel-orphan-queue-runs.sh [--dry-run]   (needs gh, jq)
# Env:   MIN_AGE_MIN (default 5)
# =============================================================================

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
MIN_AGE_MIN="${MIN_AGE_MIN:-5}"
[[ "$MIN_AGE_MIN" =~ ^[0-9]+$ ]] || { echo "MIN_AGE_MIN must be a whole number" >&2; exit 2; }
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

queue_refs() {
  gh api "repos/$REPO/git/matching-refs/heads/gh-readonly-queue/" --paginate \
    --jq '.[].ref | sub("^refs/heads/"; "")'
}

before=$(queue_refs)
runs=$(for status in queued in_progress; do
  gh api "repos/$REPO/actions/runs?event=merge_group&status=$status&per_page=100" --paginate \
    --jq '.workflow_runs[] | [.id, .head_branch, .created_at, .name] | @tsv'
done)
after=$(queue_refs)

if [[ -z "$runs" ]]; then
  echo "No queued or running merge-queue runs."
  exit 0
fi

now=$(date -u +%s)
cancelled=0
while IFS=$'\t' read -r id branch created name; do
  [[ -z "$id" ]] && continue
  if grep -qxF "$branch" <<<"$before" || grep -qxF "$branch" <<<"$after"; then
    continue
  fi
  started=$(date -u -d "$created" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$created" +%s)
  (((now - started) / 60 < MIN_AGE_MIN)) && continue
  echo "orphan: $name run $id on $branch (created $created)"
  if ! $DRY_RUN; then
    gh api -X POST "repos/$REPO/actions/runs/$id/cancel" >/dev/null ||
      echo "  could not cancel $id (it may have just finished)"
  fi
  cancelled=$((cancelled + 1))
done <<<"$runs"

echo "Cancelled $cancelled orphan run(s)$($DRY_RUN && echo ' (dry run)')."
