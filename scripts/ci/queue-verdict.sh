#!/usr/bin/env bash
# May a merge-queue CI run stand in for full push CI? (deploy-production fast path)
#
# queue-tested (./.github/actions/queue-tested) finds a successful merge-queue
# CI run on this commit's exact tree. That isn't enough on its own: the queue
# runs SCOPED CI (ci.yml scopes unless vars.CI_SCOPED_QUEUE == 'off'), so a
# "successful" run can have skipped required jobs. A run counts only when:
#   1. every required check on main concluded success, none skipped or
#      missing: the CI jobs below in that run, plus Build & Test (build.yml)
#      and Menu E2E (menu-e2e.yml) on the same head SHA (separate workflows);
#   2. the commit it was built on (its parent) was tested too: it is the
#      commit production serves (LIVE), or it has a successful push CI on main.
# Anything else falls through to the workflow_run path, which waits for full
# push CI. Docs-only groups always fall through, which is fine.
#
# Keep REQUIRED_CI and REQUIRED_OTHER in step with main's required status
# checks. GITHUB_TOKEN can't read branch protection, so they are listed here.
#
# Usage: queue-verdict.sh <queue-run-id> [<live-build-sha>]
# Env: GH_TOKEN, GITHUB_REPOSITORY.
# Exit: 0 counts | 3 doesn't count (prints why) | 1 can't tell (prints why)
set -euo pipefail

REPO=$GITHUB_REPOSITORY
RUN=${1:-}
LIVE=${2:-}

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
# workflow file|required job name
REQUIRED_OTHER=(
  "build.yml|Build & Test"
  "menu-e2e.yml|Menu E2E"
)

nope() { echo "$1"; exit 3; }
cant() { echo "$1"; exit 1; }

[[ "$RUN" =~ ^[0-9]+$ ]] || cant "no merge-queue run id"

# "<conclusion>\t<name>" for every job of a run.
jobs_of() { gh api "repos/$REPO/actions/runs/$1/jobs?per_page=100" --jq '.jobs[] | "\(.conclusion)\t\(.name)"'; }
conclusion_of() { awk -F'\t' -v n="$2" '$2 == n { print $1; exit }' <<<"$1"; }

jobs=$(jobs_of "$RUN") || cant "could not read the jobs of merge-queue run $RUN"
for name in "${REQUIRED_CI[@]}"; do
  c=$(conclusion_of "$jobs" "$name")
  [ "$c" = success ] || nope "required job '$name' was ${c:-missing} in merge-queue run $RUN (a scoped run?)"
done

head=$(gh api "repos/$REPO/actions/runs/$RUN" --jq .head_sha) || cant "could not read merge-queue run $RUN"
[[ "$head" =~ ^[0-9a-f]{40}$ ]] || cant "merge-queue run $RUN has no head SHA"

for entry in "${REQUIRED_OTHER[@]}"; do
  wf=${entry%%|*}
  name=${entry#*|}
  ok=""
  ids=$(gh api "repos/$REPO/actions/workflows/$wf/runs?head_sha=$head&per_page=10" \
    --jq '.workflow_runs[] | select(.conclusion == "success") | .id') || cant "could not read $wf runs on $head"
  for id in $ids; do
    other=$(jobs_of "$id") || continue
    if [ "$(conclusion_of "$other" "$name")" = success ]; then ok=$id; break; fi
  done
  [ -n "$ok" ] || nope "required check '$name' ($wf) has no successful run on $head"
done

base=$(gh api "repos/$REPO/commits/$head" --jq '.parents[0].sha') || cant "could not read the parent of $head"
if [ -n "$LIVE" ] && [ "$base" = "$LIVE" ]; then
  echo "counts: every required check passed on $head, built on production's $base"
  exit 0
fi
tested=$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?head_sha=$base&per_page=20" \
  --jq '.workflow_runs[] | select(.event == "push" and .head_branch == "main" and .conclusion == "success") | .id') \
  || cant "could not read CI runs on $base"
[ -n "$tested" ] || nope "the queue run's base $base was never tested: it isn't production's commit and has no successful push CI on main"
echo "counts: every required check passed on $head, built on $base (push CI passed on main)"
