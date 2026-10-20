#!/usr/bin/env bash
# After a rollback moves john-bogle-ui's traffic, confirm it stayed there.
#
# rollback.yml and incident-response.yml freeze automatic deploys before they
# move traffic (deploy-freeze.sh), and a running deploy re-checks the freeze
# right before its own shift. A deploy that passed that re-check moments
# before the freeze could still shift traffic after the rollback, so look
# again and fail loudly if the serving revision isn't the rollback target.
#
# Usage: confirm-rollback-traffic.sh <target-revision>
# Env: GCP_REGION, optional GCP_PROJECT_ID, optional GITHUB_STEP_SUMMARY.
set -euo pipefail

TARGET=${1:-}
[ -n "$TARGET" ] || { echo "::error::No rollback target revision to confirm" >&2; exit 1; }

project=()
[ -z "${GCP_PROJECT_ID:-}" ] || project=(--project="$GCP_PROJECT_ID")
serving=$(gcloud run services describe john-bogle-ui --region="$GCP_REGION" ${project[@]+"${project[@]}"} --format=json \
  | jq -r '[.status.traffic[]? | select((.percent // 0) > 0)] | max_by(.percent) | .revisionName // empty')

if [ "$serving" != "$TARGET" ]; then
  echo "::error::Traffic is on ${serving:-no revision}, not the rollback target $TARGET. A deploy may have shifted it after the rollback; deploys stay frozen. Re-run the rollback."
  echo "### ❌ Rollback did not hold: traffic is on ${serving:-no revision}, not $TARGET" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 1
fi
echo "✅ Traffic is on $TARGET; automatic deploys stay frozen until someone unfreezes."
echo "### ✅ Rollback held: traffic is on $TARGET (deploys stay frozen until someone unfreezes)" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
