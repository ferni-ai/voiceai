#!/usr/bin/env bash
# Deploy freeze: stops automatic prod web deploys while a rollback holds.
#
# A rollback (rollback.yml, or incident-response.yml's rollback action) moves
# traffic back to an older revision. Main's tip is still the broken commit, so
# the next automatic deploy (deploy-production.yml) would put it straight back:
# the forward-only guard allows it, because the tip is ahead. So a rollback
# freezes first, and the automatic paths no-op while the freeze holds.
#
# The marker is an annotated git tag, deploy-freeze, whose message is the
# reason. The workflow token can't write repo variables (GITHUB_TOKEN has no
# variables permission and repo default permissions are read), but it can
# write a tag with contents: write, which is also visible and auditable.
# Tags pushed by GITHUB_TOKEN trigger no workflows.
#   freeze by hand:   git tag -a deploy-freeze -m "<reason>" && git push origin deploy-freeze
#   unfreeze by hand: git push origin :refs/tags/deploy-freeze
#   unfreeze in CI:   run deploy-production with unfreeze: true and a reason
#
# Usage (GH_TOKEN, GITHUB_REPOSITORY; set also needs GITHUB_SHA):
#   deploy-freeze.sh check          exit 0 not frozen | 3 frozen (prints the reason) | 1 can't tell
#   deploy-freeze.sh gate           like check, but exit 0 when a manual run has
#                                   ALLOW_OLDER=true (EVENT=workflow_dispatch)
#   deploy-freeze.sh set <reason>   freeze (replaces an existing freeze)
#   deploy-freeze.sh clear <reason> unfreeze (no-op when not frozen)
set -euo pipefail

REPO=$GITHUB_REPOSITORY
REF=tags/deploy-freeze

check() {
  local out reason
  if ! out=$(gh api "repos/$REPO/git/ref/$REF" --jq .object.sha 2>&1); then
    if grep -q 'HTTP 404' <<<"$out"; then return 0; fi
    echo "$out" >&2
    echo "::error::Could not read the deploy freeze (tag deploy-freeze)" >&2
    return 1
  fi
  # An annotated tag carries the reason; a hand-made lightweight tag still freezes.
  reason=$(gh api "repos/$REPO/git/tags/$out" --jq .message 2>/dev/null) || reason="(set by hand, no reason)"
  echo "$reason"
  return 3
}

case "${1:-}" in
  check)
    check ;;
  gate)
    rc=0
    reason=$(check) || rc=$?
    if [ "$rc" = 3 ] && [ "${EVENT:-}" = workflow_dispatch ] && [ "${ALLOW_OLDER:-false}" = true ]; then
      echo "::warning::Deploys are frozen ($reason), but this manual run has allow_older." >&2
      exit 0
    fi
    [ -z "${reason:-}" ] || echo "$reason"
    exit "$rc" ;;
  set)
    reason=${2:-}
    [ -n "${reason// /}" ] || { echo "::error::A freeze needs a reason" >&2; exit 1; }
    tag=$(gh api "repos/$REPO/git/tags" -f tag=deploy-freeze -f message="$reason" \
      -f object="$GITHUB_SHA" -f type=commit --jq .sha)
    if ! gh api "repos/$REPO/git/refs" -f ref="refs/$REF" -f sha="$tag" >/dev/null 2>&1; then
      gh api -X PATCH "repos/$REPO/git/refs/$REF" -f sha="$tag" -F force=true >/dev/null
    fi
    echo "::warning::Automatic prod web deploys are frozen: $reason"
    echo "### 🧊 Deploys frozen: $reason" >> "${GITHUB_STEP_SUMMARY:-/dev/null}" ;;
  clear)
    reason=${2:-}
    [ -n "${reason// /}" ] || { echo "::error::Unfreezing needs a reason" >&2; exit 1; }
    who=${GITHUB_ACTOR:-unknown}
    when=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    rc=0
    was=$(check) || rc=$?
    [ "$rc" != 1 ] || exit 1
    if [ "$rc" = 0 ]; then
      echo "Deploys were not frozen (checked by $who at $when)."
      exit 0
    fi
    gh api -X DELETE "repos/$REPO/git/refs/$REF" >/dev/null
    # Audit: who lifted it, when, why, and what it was frozen for, in the log and the summary.
    echo "::notice::Deploys unfrozen by $who at $when. Reason: $reason. Was frozen for: $was"
    {
      echo "### 🔓 Deploys unfrozen"
      echo ""
      echo "| | |"
      echo "|---|---|"
      echo "| By | $who |"
      echo "| When (UTC) | $when |"
      echo "| Reason | $reason |"
      echo "| Was frozen for | $was |"
    } >> "${GITHUB_STEP_SUMMARY:-/dev/null}" ;;
  *)
    echo "usage: $0 check|gate|set <reason>|clear <reason>" >&2
    exit 2 ;;
esac
