#!/usr/bin/env bash
# May this push to main take the merge-queue fast path? (deploy-production.yml,
# queue-verdict job)
#
# Runs OUTSIDE the deploy-production concurrency group, with no cloud
# credentials and no install. Only a push that passes here starts the deploy
# job, which is the one that joins the group. GitHub cancels a pending run when
# a newer one queues in the same group, so a push that would only no-op must
# never queue there: a docs-only merge did, and cancelled a pending deploy of
# an earlier commit that then never shipped.
#
# tested=true needs all three:
#   1. queue-tested found a successful merge-queue CI run on this exact tree
#      (QUEUE_TESTED, QUEUE_RUN_ID);
#   2. that run counts as full CI (scripts/ci/queue-verdict.sh with `-`): every
#      required check passed, none skipped by scoping. A base with no unscoped
#      green push run is left to the deploy job's guard, which compares it with
#      the commit production serves once the previous deploy has finished;
#   3. this commit has its own push CI run. If the deploy job then no-ops (an
#      untested base, a freeze), that run's workflow_run still deploys this
#      commit and everything before it, or report-not-live says it didn't.
# Anything else is tested=false: the push does nothing, and the workflow_run
# path deploys after push CI passes. Fall-through is always safe.
#
# Env: QUEUE_TESTED, QUEUE_RUN_ID, SHA (the pushed commit), GITHUB_REPOSITORY,
# GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, and GH_TOKEN for gh. Always exits 0.
set -euo pipefail

REPO=$GITHUB_REPOSITORY
slow() {
  echo "tested=false" >> "$GITHUB_OUTPUT"
  echo "::notice::No fast path for $SHA: $1 It deploys once push CI passes on main."
  echo "### ⏭️ No fast path: $1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
}

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || slow "not a full commit SHA."
[ "${QUEUE_TESTED:-false}" = true ] \
  || slow "no successful merge-queue run tested this tree (admin merge, direct push, or a scoped or docs-only run?)."

rc=0
why=$(bash "$(dirname "$0")/queue-verdict.sh" "${QUEUE_RUN_ID:-}" -) || rc=$?
case "$rc" in
  0 | 5) echo "Merge-queue run $QUEUE_RUN_ID: $why" ;;
  3) slow "merge-queue run $QUEUE_RUN_ID doesn't count as full CI: $why." ;;
  *) slow "could not check merge-queue run ${QUEUE_RUN_ID:-?} ($why)." ;;
esac

runs=$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?head_sha=$SHA&event=push&per_page=20" \
  --jq '.workflow_runs[] | select(.event == "push" and .head_branch == "main") | .id') \
  || slow "could not read push CI runs on it."
[ -n "$runs" ] || slow "it has no push CI run (nothing CI covers changed), so there is nothing new to deploy."

echo "tested=true" >> "$GITHUB_OUTPUT"
echo "run-id=$QUEUE_RUN_ID" >> "$GITHUB_OUTPUT"
echo "✅ Fast path: merge-queue run $QUEUE_RUN_ID tested this tree, and push CI run $(head -1 <<<"$runs") backs it up."
