#!/usr/bin/env bash
# Fails only on i18n problems this change adds.
#
# The locales carry known gaps (untranslated keys, placeholder drift) that
# are tracked for cleanup; failing every frontend PR on them hides the ones a
# PR introduces. This runs the full check on the base and on this tree and
# fails when the tree has an error the base does not.
#
# Usage: scripts/ci/i18n-new-problems.sh <base-sha>
set -euo pipefail

BASE_SHA="${1:?usage: $0 <base-sha>}"
WORK="$(mktemp -d)"
BASE_TREE=".i18n-base"

errors_of() {
  # The lines after the "VALIDATION ERRORS" header, one per problem. Counts
  # are dropped so fixing some gaps ("Missing 420 keys") is not a new problem.
  awk '/VALIDATION ERRORS/{f=1; next} f && NF' "$1" | sed -E 's/[0-9]+/N/g' | sort -u
}

node design-system/check-i18n.js > "$WORK/head.txt" 2>&1 || true

# Inside the repo so the base checker resolves this tree's node_modules
git worktree add --quiet --detach "$BASE_TREE" "$BASE_SHA"
trap 'git worktree remove --force "$BASE_TREE" > /dev/null 2>&1 || true' EXIT
node "$BASE_TREE/design-system/check-i18n.js" > "$WORK/base.txt" 2>&1 || true

errors_of "$WORK/head.txt" > "$WORK/head-errors.txt"
errors_of "$WORK/base.txt" > "$WORK/base-errors.txt"
comm -13 "$WORK/base-errors.txt" "$WORK/head-errors.txt" > "$WORK/new.txt"

echo "i18n errors: $(wc -l < "$WORK/base-errors.txt") on base, $(wc -l < "$WORK/head-errors.txt") here"
if [ -s "$WORK/new.txt" ]; then
  echo "❌ New i18n problems (run pnpm i18n:check for details):"
  cat "$WORK/new.txt"
  exit 1
fi
echo "✅ No new i18n problems"
