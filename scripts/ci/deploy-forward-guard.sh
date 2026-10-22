#!/usr/bin/env bash
# Never move production backwards (deploy-production.yml, before the build).
#
# workflow_run events can arrive out of order, and an old CI run can be re-run:
# either would deploy an older commit over a newer one. This decides whether
# DEPLOY_SHA may deploy, writes deploy=true|false to $GITHUB_OUTPUT, and exits 0
# either way: a no-op is not a failure. It exits non-zero only when it can't
# read production, or when a manual deploy asks for something it must refuse.
#
#   - Production's commit is the BUILD_SHA env of the revision serving traffic
#     (not the service template, which a rolled-back green revision can hold).
#   - GitHub's compare of production's commit...DEPLOY_SHA decides:
#     ahead deploys; identical is a no-op (manual: redeploys); behind or
#     diverged is a no-op that says how to roll back on purpose.
#   - Production's commit unknown: deploys only main's tip.
#   - No service yet: deploys (first deployment).
#   - Manual dispatch deploys only commits on main. With ALLOW_OLDER=true and
#     a REASON it skips the forward-only check, for an intentional rollback.
#     rollback.yml doesn't come through here; it shifts traffic on its own.
#   - A push to main (the merge-queue fast path) deploys only when QUEUE_TESTED
#     is true (the queue-verdict job, scripts/ci/queue-fast-path.sh: a successful
#     merge-queue CI run, QUEUE_RUN_ID, tested exactly this tree) AND, checked
#     again here against production, that run counts as full CI (scripts/ci/queue-verdict.sh: every
#     required check passed, none skipped by scoping, on a tested base). If not
#     (admin merge, direct push, scoped run, untested base), the push is a no-op
#     and the workflow_run path deploys after push CI passes. Either way the
#     forward-only check holds.
#   - While a rollback's deploy freeze holds (scripts/ci/deploy-freeze.sh), it
#     is a no-op ("frozen: <reason>"), except for a manual run with allow_older.
#   - On workflow_run, the triggering push CI run (CI_RUN_ID) must have run
#     main's required CI jobs (scripts/ci/required-checks.sh). Skipped jobs are
#     fine when an unscoped merge-queue run passed them on this exact tree
#     (ci.yml's queue-tested skip); otherwise nothing they cover changed, and it
#     is a quiet no-op ("no code change since the last deploy"). A failed or
#     missing required job refuses (red).
#
# Env: DEPLOY_SHA, EVENT (github.event_name), ALLOW_OLDER, REASON, CI_RUN_ID,
# QUEUE_TESTED, QUEUE_RUN_ID, GCP_REGION, GCP_PROJECT_ID, GITHUB_REPOSITORY,
# GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, and GH_TOKEN for gh.
set -euo pipefail

SERVICE=john-bogle-ui
REPO=$GITHUB_REPOSITORY
summary() { echo "$1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"; }
deploy() { echo "deploy=true" >> "$GITHUB_OUTPUT"; echo "✅ Deploying $DEPLOY_SHA: $1"; exit 0; }
noop() {
  echo "deploy=false" >> "$GITHUB_OUTPUT"
  echo "::notice::Not deploying ${DEPLOY_SHA}: $1"
  summary "### ⏭️ Not deployed: ${DEPLOY_SHA}"
  summary "$1"
  exit 0
}
refuse() { echo "::error::Not deploying ${DEPLOY_SHA}: $1"; summary "### ❌ Refused: $1"; exit 1; }
# GitHub's compare status of $2 relative to $1: ahead|identical|behind|diverged,
# or nothing when it can't tell (unknown commit, API error).
compare() { gh api "repos/$REPO/compare/$1...$2" --jq .status 2>/dev/null || true; }

[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || refuse "DEPLOY_SHA is not a full commit SHA"

rc=0
frozen=$(bash "$(dirname "$0")/deploy-freeze.sh" gate) || rc=$?
case "$rc" in
  0) ;;
  3) noop "frozen: $frozen. Automatic deploys wait for a deliberate unfreeze (deploy-production with unfreeze: true and a reason, or delete the deploy-freeze tag). A manual run with allow_older still deploys." ;;
  *) refuse "could not read the deploy freeze" ;;
esac

if [ "$EVENT" = push ] && [ "${QUEUE_TESTED:-false}" != true ]; then
  noop "no successful merge-queue run tested this tree (admin merge or direct push?), so it deploys once push CI passes on main."
fi

if [ "$EVENT" = workflow_dispatch ]; then
  on_main=$(compare "$DEPLOY_SHA" main)
  [ "$on_main" = ahead ] || [ "$on_main" = identical ] \
    || refuse "it is not a commit on main (main is ${on_main:-unknown} relative to it)"
  if [ "${ALLOW_OLDER:-false}" = true ]; then
    [ -n "${REASON// /}" ] || refuse "allow_older needs a reason"
    echo "::warning::allow_older: deploying $DEPLOY_SHA without the forward-only check. Reason: $REASON"
    summary "### ⏪ Forward-only check skipped (allow_older)"
    summary "Reason: $REASON"
    deploy "allow_older set by ${GITHUB_ACTOR:-a maintainer}"
  fi
fi

if [ "$EVENT" = workflow_run ]; then
  checks="$(dirname "$0")/required-checks.sh"
  rc=0
  why=$(bash "$checks" ci-run "${CI_RUN_ID:-}") || rc=$?
  case "$rc" in
    0) echo "✅ Push CI: $why" ;;
    3)
      qrc=0
      queue=$(bash "$checks" queue-covers "$DEPLOY_SHA") || qrc=$?
      case "$qrc" in
        0) echo "✅ Push CI skipped required jobs ($why) because merge-queue run $queue already passed them on this tree." ;;
        3) noop "no code change since the last deploy; nothing to ship. ($why: nothing the suite covers changed.)" ;;
        *) refuse "could not check whether the merge queue tested this tree: $queue" ;;
      esac ;;
    4) refuse "push CI on it didn't pass main's required checks: $why" ;;
    *) refuse "could not check push CI run ${CI_RUN_ID:-?}: $why" ;;
  esac
fi

tip=$(gh api "repos/$REPO/commits/main" --jq .sha 2>/dev/null) || tip=""
echo "main's tip: ${tip:-unknown}"

err=$(mktemp)
if ! svc=$(gcloud run services describe "$SERVICE" --region="$GCP_REGION" --project="$GCP_PROJECT_ID" --format=json 2>"$err"); then
  if grep -qiE 'could not be found|not found' "$err"; then
    [ "$EVENT" != push ] || noop "$SERVICE doesn't exist yet; its first deploy waits for push CI."
    deploy "$SERVICE doesn't exist yet, so there is nothing to move backwards from"
  fi
  cat "$err"
  refuse "could not read the live $SERVICE service"
fi

rev=$(jq -r '[.status.traffic[]? | select((.percent // 0) > 0)] | max_by(.percent) | .revisionName // empty' <<<"$svc")
live=""
if [ -n "$rev" ]; then
  live=$(gcloud run revisions describe "$rev" --region="$GCP_REGION" --project="$GCP_PROJECT_ID" --format=json \
    | jq -r 'first(.spec.containers[0].env[]? | select(.name == "BUILD_SHA") | .value) // empty')
fi
echo "serving: ${rev:-none} (BUILD_SHA ${live:-unknown})"

if [ "$EVENT" = push ]; then
  rc=0
  why=$(bash "$(dirname "$0")/queue-verdict.sh" "${QUEUE_RUN_ID:-}" "$live") || rc=$?
  case "$rc" in
    0) echo "✅ Merge-queue run ${QUEUE_RUN_ID} $why" ;;
    3) noop "merge-queue run ${QUEUE_RUN_ID:-?} doesn't count as full CI: $why. It deploys once push CI passes on main." ;;
    *) noop "could not check merge-queue run ${QUEUE_RUN_ID:-?} ($why). It deploys once push CI passes on main." ;;
  esac
fi

status=""
[[ "$live" =~ ^[0-9a-f]{40}$ ]] && status=$(compare "$live" "$DEPLOY_SHA")
case "$status" in
  ahead) deploy "forward from production's $live" ;;
  identical)
    [ "$EVENT" = workflow_dispatch ] && deploy "manual redeploy of the commit production serves"
    noop "production already serves it ($rev)." ;;
  behind | diverged)
    noop "production serves $live ($rev), and this commit is $status relative to it: deploying it would move production backwards. To roll back on purpose, run this workflow by hand from main with allow_older: true, a reason, and the sha." ;;
esac

if [ -n "$tip" ] && [ "$DEPLOY_SHA" = "$tip" ]; then
  echo "::warning::Production's commit is unknown (${live:-no BUILD_SHA}); $DEPLOY_SHA is main's tip, so it deploys."
  deploy "main's tip"
fi
noop "production's commit is unknown (${live:-no BUILD_SHA}) and this is not main's tip (${tip:-unknown})."
