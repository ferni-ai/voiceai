#!/usr/bin/env bash
# =============================================================================
# SECRET SCAN RANGE
# =============================================================================
# Fetches just the history the secret scan needs and writes `base` and `head`
# (and `commits`) to $GITHUB_OUTPUT, so trufflehog scans exactly the change:
#
#   pull_request  the PR's commits: merge base of its base and head .. head
#   merge_group   every PR in the group: merge base of main and the group head .. head
#                 (the group's base_sha is the group ahead's temporary commit; #2215)
#   push          the pushed commits: before .. after
#
# The checkout is one commit deep, so before 2026-10-19 no base was ever in the
# clone: trufflehog logged "unable to resolve commit: object not found", scanned
# 0 chunks and 0 bytes on every PR, queue group and push, and passed. This
# deepens the head's history until the base is an ancestor (doubling, up to
# MAX_DEPTH commits) instead of fetching all of it (about 2.6 GB), and tags both
# ends so trufflehog's own clone of the checkout has them. If the base can't be
# reached it fails: an unscanned change must not pass as scanned.
#
# Env: EVENT, REPO, GH_TOKEN (gh), and per event PR_BASE/PR_HEAD,
#      MG_BASE_REF/MG_HEAD or PUSH_BEFORE/PUSH_AFTER. Optional MAX_DEPTH (3200).
# =============================================================================
set -euo pipefail

case "$EVENT" in
  pull_request) head=$PR_HEAD; from=$PR_BASE ;;
  merge_group) head=$MG_HEAD; from=${MG_BASE_REF#refs/heads/} ;;
  push) head=$PUSH_AFTER; from=$PUSH_BEFORE ;;
  *) echo "::error::secret-scan-range: no range for a $EVENT event"; exit 1 ;;
esac
[ -n "$head" ] && [ -n "$from" ] || { echo "::error::secret-scan-range: missing base or head for $EVENT"; exit 1; }

if [ "$EVENT" = push ]; then
  [[ "$from" =~ ^0+$ ]] && { echo "::error::push without a previous commit; nothing to scan from"; exit 1; }
  base=$from
else
  base=$(gh api "repos/$REPO/compare/$from...$head" --jq .merge_base_commit.sha)
fi

git fetch --no-tags --quiet --depth=1 origin "$base"
depth=16
until git merge-base --is-ancestor "$base" "$head" 2>/dev/null; do
  if [ "$depth" -gt "${MAX_DEPTH:-3200}" ]; then
    echo "::error::$base is not within ${MAX_DEPTH:-3200} commits of $head, so the change was not scanned"
    exit 1
  fi
  git fetch --no-tags --quiet --depth="$depth" origin "$head"
  depth=$((depth * 2))
done

# trufflehog scans a clone of this checkout, and a clone copies only refs: a commit
# fetched by SHA alone (the PR head, the base) is missing there ("object not found").
git tag -f secret-scan-base "$base" >/dev/null
git tag -f secret-scan-head "$head" >/dev/null

commits=$(git rev-list --count "$base..$head")
echo "Secret scan: $commits commit(s), $base..$head ($EVENT)"
{
  echo "base=$base"
  echo "head=$head"
  echo "commits=$commits"
} >> "$GITHUB_OUTPUT"
