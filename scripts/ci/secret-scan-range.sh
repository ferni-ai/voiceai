#!/usr/bin/env bash
# =============================================================================
# SECRET SCAN RANGE
# =============================================================================
# Fetches just the history the secret scan needs and writes `base`, `head` and
# `commits` to $GITHUB_OUTPUT, so trufflehog scans exactly the change:
#
#   pull_request  the PR's commits: merge base of its base and head .. head
#   merge_group   every PR in the group: merge base of main and the group head .. head
#                 (the group's base_sha is the group ahead's temporary commit; #2215)
#   push          the pushed commits: before .. after
#
# The checkout is one commit deep, so before 2026-10-19 no base was ever in the
# clone: trufflehog logged "unable to resolve commit: object not found", scanned
# 0 chunks and 0 bytes on every PR, queue group and push, and passed.
#
# This deepens base and head together (doubling, up to MAX_DEPTH) instead of
# fetching all history (about 2.6 GB), until the range is complete: base..head
# has exactly the commits GitHub's compare counts, and none of them sits on the
# shallow boundary (a merge's other side cut off there would otherwise drop
# commits silently). It tags both ends, since trufflehog scans a clone of the
# checkout and a clone copies only refs. Anything it can't prove complete
# fails: an unscanned change must never pass as scanned.
#
# Env: EVENT, REPO, GH_TOKEN (gh), and per event PR_BASE/PR_HEAD,
#      MG_BASE_REF/MG_HEAD or PUSH_BEFORE/PUSH_AFTER. Optional MAX_DEPTH (4096).
# =============================================================================
set -euo pipefail

case "$EVENT" in
  pull_request) head=$PR_HEAD; from=$PR_BASE ;;
  merge_group) head=$MG_HEAD; from=${MG_BASE_REF#refs/heads/} ;;
  push) head=$PUSH_AFTER; from=$PUSH_BEFORE ;;
  *) echo "::error::secret-scan-range: no range for a $EVENT event"; exit 1 ;;
esac
[ -n "$head" ] && [ -n "$from" ] && [[ ! "$from" =~ ^0+$ ]] \
  || { echo "::error::secret-scan-range: no base or head for this $EVENT"; exit 1; }

# GitHub's own count of the change, to prove the local range is complete.
read -r base expected < <(gh api "repos/$REPO/compare/$from...$head" \
  --jq '"\(.merge_base_commit.sha) \(.total_commits)"')
[ -n "$base" ] && [ -n "$expected" ] || { echo "::error::could not compare $from...$head"; exit 1; }

shallow_file=$(git rev-parse --git-path shallow)
depth=16
while :; do
  git fetch --no-tags --quiet --depth="$depth" origin "$base" "$head"
  range=$(git rev-list "$base..$head")
  commits=$(printf '%s' "$range" | grep -c . || true)
  cut=$( { [ -f "$shallow_file" ] && printf '%s\n' "$range" | grep -Fxf "$shallow_file"; } || true)
  [ "$commits" = "$expected" ] && [ -z "$cut" ] && break
  if [ "$depth" -ge "${MAX_DEPTH:-4096}" ]; then
    echo "::error::$base..$head is not complete at depth $depth ($commits of $expected commits), so it was not scanned"
    exit 1
  fi
  depth=$((depth * 2))
done

# trufflehog scans a clone of this checkout, and a clone copies only refs: a commit
# fetched by SHA alone (the PR head, the base) is missing there ("object not found").
git tag -f secret-scan-base "$base" >/dev/null
git tag -f secret-scan-head "$head" >/dev/null

echo "Secret scan: $commits commit(s), $base..$head ($EVENT, depth $depth)"
{
  echo "base=$base"
  echo "head=$head"
  echo "commits=$commits"
} >> "$GITHUB_OUTPUT"
