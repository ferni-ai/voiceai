#!/usr/bin/env bash
# Did a CI run really run main's required checks? (deploy-production gates)
#
# A CI run can end "success" with required jobs skipped: ci.yml skips the
# Node suite when nothing it covers changed (scoping), and on a push to main
# when a merge-queue run already tested the same tree (queue-tested). A deploy
# must tell those apart from a run that tested the code.
#
# Keep REQUIRED_CI and REQUIRED_OTHER in step with main's required status
# checks. GITHUB_TOKEN can't read branch protection, so they are listed here.
# One required check is deliberately left out: "Overlay Gallery (visual +
# contrast)" (ci.yml) runs on pull_request only and is skipped, which reports
# success, in the merge queue and on pushes to main. Listed here it would make
# every queue and push run look untested and block deploys.
#
# Usage (GH_TOKEN, GITHUB_REPOSITORY):
#   required-checks.sh ci-run <run-id>
#       every REQUIRED_CI job of the CI run concluded success.
#       exit 0 yes | 3 one was skipped | 4 one failed, was cancelled or is
#       missing | 1 can't tell. Prints the first job that isn't success.
#   required-checks.sh others <sha>
#       REQUIRED_OTHER passed on <sha> (Build & Test, Menu E2E).
#       exit 0 yes | 3 no | 1 can't tell
#   required-checks.sh queue-covers <sha>
#       a successful merge-queue CI run on <sha>'s exact tree passed every
#       REQUIRED_CI job (unscoped). Prints its run id.
#       exit 0 yes | 3 no | 1 can't tell
set -euo pipefail

REPO=$GITHUB_REPOSITORY

REQUIRED_CI=(
  "Lint & Type Check"
  "Frontend Quality"
  "Unit Tests"
  "Integration Tests (1/3)"
  "Integration Tests (2/3)"
  "Integration Tests (3/3)"
  "Quality Gates (Blocking)"
  "Security Scan"
)
# workflow file|required job name (these run on pull_request and merge_group, not push)
REQUIRED_OTHER=(
  "build.yml|Build & Test"
  "menu-e2e.yml|Menu E2E"
)

# "<conclusion>\t<name>" for every job of a run.
jobs_of() { gh api "repos/$REPO/actions/runs/$1/jobs?per_page=100" --jq '.jobs[] | "\(.conclusion)\t\(.name)"'; }
conclusion_of() { awk -F'\t' -v n="$2" '$2 == n { print $1; exit }' <<<"$1"; }

ci_run() {
  local run=$1 jobs name c skipped=""
  [[ "$run" =~ ^[0-9]+$ ]] || { echo "no CI run id"; return 1; }
  jobs=$(jobs_of "$run") || { echo "could not read the jobs of CI run $run"; return 1; }
  for name in "${REQUIRED_CI[@]}"; do
    c=$(conclusion_of "$jobs" "$name")
    case "$c" in
      success) ;;
      skipped) [ -n "$skipped" ] || skipped="required job '$name' was skipped in CI run $run" ;;
      *) echo "required job '$name' was ${c:-missing} in CI run $run"; return 4 ;;
    esac
  done
  [ -z "$skipped" ] || { echo "$skipped"; return 3; }
  echo "every required CI job passed in run $run"
}

others() {
  local sha=$1 entry wf name ids id ok other
  for entry in "${REQUIRED_OTHER[@]}"; do
    wf=${entry%%|*}
    name=${entry#*|}
    ok=""
    ids=$(gh api "repos/$REPO/actions/workflows/$wf/runs?head_sha=$sha&per_page=10" \
      --jq '.workflow_runs[] | select(.conclusion == "success") | .id') || { echo "could not read $wf runs on $sha"; return 1; }
    for id in $ids; do
      other=$(jobs_of "$id") || continue
      if [ "$(conclusion_of "$other" "$name")" = success ]; then ok=$id; break; fi
    done
    [ -n "$ok" ] || { echo "required check '$name' ($wf) has no successful run on $sha"; return 3; }
  done
  echo "Build & Test and Menu E2E passed on $sha"
}

queue_covers() {
  local sha=$1 tree runs id head t
  tree=$(gh api "repos/$REPO/git/commits/$sha" --jq .tree.sha) || { echo "could not read the tree of $sha"; return 1; }
  runs=$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?event=merge_group&status=success&per_page=30" \
    --jq '.workflow_runs[] | select(.conclusion == "success") | "\(.id) \(.head_sha)"') || { echo "could not list merge-queue runs"; return 1; }
  while read -r id head; do
    [ -n "$id" ] || continue
    if [ "$head" != "$sha" ]; then
      t=$(gh api "repos/$REPO/git/commits/$head" --jq .tree.sha 2>/dev/null) || continue
      [ "$t" = "$tree" ] || continue
    fi
    if ci_run "$id" >/dev/null; then
      echo "$id"
      return 0
    fi
  done <<<"$runs"
  echo "no unscoped merge-queue run passed every required CI job on tree $tree"
  return 3
}

case "${1:-}" in
  ci-run) ci_run "${2:-}" ;;
  others) others "${2:-}" ;;
  queue-covers) queue_covers "${2:-}" ;;
  *) echo "usage: $0 ci-run <run-id> | others <sha> | queue-covers <sha>" >&2; exit 2 ;;
esac
