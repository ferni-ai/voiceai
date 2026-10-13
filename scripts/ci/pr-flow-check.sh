#!/usr/bin/env bash
# =============================================================================
# PR FLOW CHECK
# =============================================================================
# Keeps PRs small, unstacked from dead branches, and tied to an issue, so a
# day of parallel agent work doesn't turn into 140 open PRs that conflict with
# each other (2026-10-13 cleanup).
#
#   Fails:  more than SIZE_FAIL changed lines (tests, fixtures, snapshots,
#           lockfiles and generated files don't count) without the
#           size/large-ok label; a base branch that isn't main/develop and has
#           no open PR of its own (the work would be stranded there).
#   Warns:  more than SIZE_WARN changed lines; more than WIP_LIMIT open PRs;
#           no linked issue ("Closes #N").
#
# Usage: scripts/ci/pr-flow-check.sh <pr-number>   (needs gh, jq, GH_TOKEN)
# =============================================================================

set -euo pipefail

PR="${1:?usage: pr-flow-check.sh <pr-number>}"
REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
SIZE_WARN="${SIZE_WARN:-400}"
SIZE_FAIL="${SIZE_FAIL:-1000}"
WIP_LIMIT="${WIP_LIMIT:-25}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

# Changed lines that a reviewer has to read.
NOT_REVIEWED='(__tests__/|\.test\.|\.spec\.|/fixtures/|__screenshots__/|__snapshots__/|\.snap$|pnpm-lock\.yaml$|package-lock\.json$|\.generated\.|\.(png|jpg|jpeg|gif|webp|svg|mp3|wav)$)'

failures=()
warnings=()

pr_json=$(gh pr view "$PR" -R "$REPO" --json baseRefName,labels,closingIssuesReferences,isDraft)
base=$(jq -r .baseRefName <<<"$pr_json")
labels=$(jq -r '[.labels[].name] | join(",")' <<<"$pr_json")
linked=$(jq '.closingIssuesReferences | length' <<<"$pr_json")

# --- Size --------------------------------------------------------------------
# A deleted file takes a glance, not a read, so cleanup PRs aren't penalised.
files=$(gh api "repos/$REPO/pulls/$PR/files" --paginate \
  --jq '.[] | [.filename, (if .status == "removed" then 0 else .additions + .deletions end)] | @tsv')
counted=$(awk -F'\t' -v skip="$NOT_REVIEWED" '$1 !~ skip { n += $2 } END { print n + 0 }' <<<"$files")
total=$(awk -F'\t' '{ n += $2 } END { print n + 0 }' <<<"$files")

if (( counted > SIZE_FAIL )) && [[ ",$labels," != *",size/large-ok,"* ]]; then
  failures+=("**Size:** $counted reviewable changed lines (limit $SIZE_FAIL). Split it, or add the \`size/large-ok\` label if it can't be split.")
elif (( counted > SIZE_WARN )); then
  warnings+=("**Size:** $counted reviewable changed lines; aim for under $SIZE_WARN.")
fi

# --- Stacked on a dead branch -------------------------------------------------
if [[ "$base" != "main" && "$base" != "develop" ]]; then
  parent=$(gh pr list -R "$REPO" --head "$base" --state open --json number --jq '.[0].number // empty')
  if [[ -z "$parent" ]]; then
    failures+=("**Base:** \`$base\` has no open PR, so this work can't reach main. Retarget to main, or open a PR for \`$base\` first.")
  fi
fi

# --- Work in progress ---------------------------------------------------------
open=$(gh pr list -R "$REPO" --state open --limit 500 --json isDraft --jq '[.[] | select(.isDraft | not)] | length')
if (( open > WIP_LIMIT )); then
  warnings+=("**WIP:** $open open PRs (limit $WIP_LIMIT). Every merge makes the others conflict; finish before starting more.")
fi

# --- Issue link ---------------------------------------------------------------
if (( linked == 0 )); then
  warnings+=("**Issue:** no linked issue. Add \`Closes #N\` to the description.")
fi

# --- Report ---------------------------------------------------------------------
{
  echo "### PR flow"
  echo ""
  echo "Reviewable lines: **$counted** (of $total changed) · base: \`$base\` · open PRs: $open"
  echo ""
  for f in "${failures[@]+"${failures[@]}"}"; do echo "- ❌ $f"; done
  for w in "${warnings[@]+"${warnings[@]}"}"; do echo "- ⚠️ $w"; done
  (( ${#failures[@]} + ${#warnings[@]} == 0 )) && echo "- ✅ All good"
} >>"$SUMMARY"

for w in "${warnings[@]+"${warnings[@]}"}"; do echo "::warning::${w//\*\*/}"; done
for f in "${failures[@]+"${failures[@]}"}"; do echo "::error::${f//\*\*/}"; done

(( ${#failures[@]} == 0 ))
