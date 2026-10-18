#!/usr/bin/env bash
# Never move production backwards (deploy-production.yml, before the build).
#
# workflow_run events can arrive out of order: an older head's CI can finish
# after a newer one's, and deploying it would put an older commit over a newer
# one. This decides whether DEPLOY_SHA may deploy, writes deploy=true|false to
# $GITHUB_OUTPUT, and exits 0 either way. A no-op is not a failure. It exits
# non-zero only when it can't read production, or when allow_older has no reason.
#
#   - Production's commit is the BUILD_SHA env of the revision serving traffic
#     (not the service template, which a rolled-back green revision can hold).
#   - Deploys when that commit is an ancestor of DEPLOY_SHA (forward).
#   - Already serving DEPLOY_SHA: a no-op on the automatic path (a CI re-run).
#   - Production's commit unknown: deploys only main's tip.
#   - No service yet: deploys (first deployment).
#   - Manual dispatch with ALLOW_OLDER=true and a REASON skips the check, for an
#     intentional rollback. rollback.yml doesn't come through here; it shifts
#     traffic to an existing revision on its own.
#
# Env: DEPLOY_SHA, EVENT (github.event_name), ALLOW_OLDER, REASON, GCP_REGION,
# GCP_PROJECT_ID, GITHUB_REPOSITORY, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY, and
# GH_TOKEN for gh. Run from a checkout with full history.
set -euo pipefail

SERVICE=john-bogle-ui
summary() { echo "$1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"; }
deploy() { echo "deploy=true" >> "$GITHUB_OUTPUT"; echo "✅ $1"; exit 0; }
noop() {
  echo "deploy=false" >> "$GITHUB_OUTPUT"
  echo "::notice::Not deploying ${DEPLOY_SHA}: $1"
  summary "### ⏭️ Not deployed: ${DEPLOY_SHA}"
  summary "$1"
  exit 0
}

[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::DEPLOY_SHA is not a commit SHA: $DEPLOY_SHA"; exit 1; }

if [ "$EVENT" = workflow_dispatch ] && [ "${ALLOW_OLDER:-false}" = true ]; then
  [ -n "${REASON// /}" ] || { echo "::error::allow_older needs a reason. Not deploying."; exit 1; }
  echo "::warning::allow_older: deploying $DEPLOY_SHA without the forward-only check. Reason: $REASON"
  summary "### ⏪ Forward-only check skipped (allow_older)"
  summary "Reason: $REASON"
  deploy "allow_older set by ${GITHUB_ACTOR:-a maintainer}"
fi

tip=$(gh api "repos/$GITHUB_REPOSITORY/commits/main" --jq .sha 2>/dev/null) || tip=""
echo "main's tip: ${tip:-unknown}; deploying: $DEPLOY_SHA"

err=$(mktemp)
if ! svc=$(gcloud run services describe "$SERVICE" --region="$GCP_REGION" --project="$GCP_PROJECT_ID" --format=json 2>"$err"); then
  if grep -qiE 'could not be found|not found' "$err"; then
    deploy "$SERVICE doesn't exist yet: nothing to move backwards from"
  fi
  cat "$err"
  echo "::error::Could not read the live $SERVICE service. Not deploying."
  exit 1
fi

rev=$(jq -r '[.status.traffic[]? | select((.percent // 0) > 0)] | max_by(.percent) | .revisionName // empty' <<<"$svc")
live=""
if [ -n "$rev" ]; then
  live=$(gcloud run revisions describe "$rev" --region="$GCP_REGION" --project="$GCP_PROJECT_ID" --format=json \
    | jq -r 'first(.spec.containers[0].env[]? | select(.name == "BUILD_SHA") | .value) // empty')
fi
echo "serving: ${rev:-none} (BUILD_SHA ${live:-unknown})"

if [[ "$live" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "${live}^{commit}" 2>/dev/null; then
  if [ "$live" = "$DEPLOY_SHA" ] && [ "$EVENT" != workflow_dispatch ]; then
    noop "production already serves it ($rev)."
  fi
  if git merge-base --is-ancestor "$live" "$DEPLOY_SHA"; then
    deploy "forward: production's $live is an ancestor of $DEPLOY_SHA"
  fi
  noop "production serves $live ($rev), which is not an ancestor of it, so this would move production backwards. To roll back on purpose, run this workflow by hand with allow_older: true and a reason."
fi

if [ -n "$tip" ] && [ "$DEPLOY_SHA" = "$tip" ]; then
  echo "::warning::Production's commit is unknown (${live:-no BUILD_SHA}); $DEPLOY_SHA is main's tip, so it deploys."
  deploy "main's tip"
fi
noop "production's commit is unknown (${live:-no BUILD_SHA}) and it is not main's tip (${tip:-unknown})."
