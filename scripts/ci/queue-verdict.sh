#!/usr/bin/env bash
# May a merge-queue CI run stand in for full push CI? (deploy-production fast path)
#
# queue-tested (./.github/actions/queue-tested) finds a successful merge-queue
# CI run on this commit's exact tree. That isn't enough on its own: the queue
# runs SCOPED CI (ci.yml scopes unless vars.CI_SCOPED_QUEUE == 'off'), so a
# "successful" run can have skipped required jobs. A run counts only when:
#   1. every required check on main concluded success, none skipped or
#      missing: the required CI jobs in that run, plus Build & Test (build.yml)
#      and Menu E2E (menu-e2e.yml) on the same head SHA (required-checks.sh
#      holds the list);
#   2. the commit it was built on (its parent) was tested too: it is the
#      commit production serves (LIVE), or it has a push CI run on main whose
#      required jobs all passed (unscoped). A base whose push run was scoped
#      doesn't count here.
# Anything else falls through to the workflow_run path, which waits for push
# CI and its required-checks gate. Docs-only groups always fall through, which
# is fine. Fall-through is always safe.
#
# Usage: queue-verdict.sh <queue-run-id> [<live-build-sha> | -]
# `-` means production's commit isn't known here (deploy-production's
# queue-verdict job, which holds no cloud credentials): a base without an
# unscoped green push run is then left for the deploy job's guard to check
# against production, inside the deploy group (exit 5).
# Env: GH_TOKEN, GITHUB_REPOSITORY.
# Exit: 0 counts | 3 doesn't count (prints why) | 1 can't tell (prints why)
#       | 5 counts only if production serves the base (with `-`)
set -euo pipefail

REPO=$GITHUB_REPOSITORY
RUN=${1:-}
LIVE=${2:-}
CHECKS="$(dirname "$0")/required-checks.sh"

nope() { echo "$1"; exit 3; }
cant() { echo "$1"; exit 1; }

[[ "$RUN" =~ ^[0-9]+$ ]] || cant "no merge-queue run id"

rc=0
why=$(bash "$CHECKS" ci-run "$RUN") || rc=$?
case "$rc" in
  0) ;;
  3 | 4) nope "$why (a scoped run?)" ;;
  *) cant "$why" ;;
esac

head=$(gh api "repos/$REPO/actions/runs/$RUN" --jq .head_sha) || cant "could not read merge-queue run $RUN"
[[ "$head" =~ ^[0-9a-f]{40}$ ]] || cant "merge-queue run $RUN has no head SHA"

rc=0
why=$(bash "$CHECKS" others "$head") || rc=$?
case "$rc" in
  0) ;;
  3) nope "$why" ;;
  *) cant "$why" ;;
esac

base=$(gh api "repos/$REPO/commits/$head" --jq '.parents[0].sha') || cant "could not read the parent of $head"
[[ "$base" =~ ^[0-9a-f]{40}$ ]] || cant "merge-queue run $RUN's head $head has no parent SHA"
if [ -n "$LIVE" ] && [ "$base" = "$LIVE" ]; then
  echo "counts: every required check passed on $head, built on production's $base"
  exit 0
fi
runs=$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?head_sha=$base&per_page=20" \
  --jq '.workflow_runs[] | select(.event == "push" and .head_branch == "main" and .conclusion == "success") | .id') \
  || cant "could not read CI runs on $base"
for id in $runs; do
  if bash "$CHECKS" ci-run "$id" >/dev/null; then
    echo "counts: every required check passed on $head, built on $base (unscoped push CI run $id passed on main)"
    exit 0
  fi
done
if [ "$LIVE" = - ]; then
  echo "every required check passed on $head; its base $base has no unscoped green push CI run, so it counts only if production serves $base"
  exit 5
fi
nope "the queue run's base $base was never tested: it isn't production's commit and has no unscoped green push CI run on main"
