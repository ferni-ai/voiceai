#!/usr/bin/env bash
# =============================================================================
# QUEUE LOWERING APPROVED
# =============================================================================
# Prints "true" when a merge-queue group may skip the crisis sweep under the
# label crisis:lowering-approved, else "false" (crisis-sweep.yml).
#
# On a pull request the sweep reads the label from the event. A merge_group
# event carries no pull request, so the label is read from the API instead, for
# the PR the queue ref names: refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>.
#
# The label counts only when that PR is the whole group: one commit ahead of
# the target branch (the queue squashes, one commit per PR). Behind other PRs
# the group's diff carries their changes too, and the queue merges PRs ahead on
# a later group's verdict (#2027), so one PR's label would excuse changes Seth
# never approved. There the sweep runs; a real lowering fails the group, and the
# PR goes through again once it is first in line.
#
# Fails closed: a ref that doesn't parse or a lookup that fails prints "false",
# so the sweep runs. Warnings go to stderr; stdout is only the answer.
#
# Usage: queue-lowering-approved.sh <head_ref> <base_ref> <head_sha> <owner/repo>
# =============================================================================
set -uo pipefail

head_ref=${1-}
base_ref=${2-}
head_sha=${3-}
repo=${4-}
label='crisis:lowering-approved'

no() {
  [ -n "${1-}" ] && echo "::warning::$1, so the crisis sweep runs" >&2
  echo false
  exit 0
}

[[ "$head_ref" =~ ^refs/heads/gh-readonly-queue/.+/pr-([0-9]+)-[0-9a-f]+$ ]] \
  || no "Could not read a PR number from the merge-group ref '$head_ref'"
pr=${BASH_REMATCH[1]}

labels=$(gh api "repos/$repo/pulls/$pr" --jq '.labels[].name') \
  || no "Could not read the labels of PR #$pr"
grep -qxF -- "$label" <<<"$labels" || no

target=${base_ref#refs/heads/}
[ -n "$target" ] && [ -n "$head_sha" ] || no "No target branch or head commit for PR #$pr's group"
ahead=$(gh api "repos/$repo/compare/$target...$head_sha" --jq '.ahead_by') \
  || no "Could not compare $target...$head_sha for PR #$pr"
[ "$ahead" = 1 ] || no "PR #$pr has $label but its group is $ahead commits ahead of $target, not just this PR"

echo "PR #$pr has $label and is the whole group" >&2
echo true
