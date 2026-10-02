#!/usr/bin/env bash
# Fails when this change grows the frontend bundle past a tolerance.
#
# The bundle is well over any absolute budget today, and that is tracked
# separately; what a PR can own is not making it bigger. Builds the base and
# this tree with the same toolchain and compares total and largest chunk.
#
# Usage: scripts/ci/bundle-growth.sh <base-sha>   (MAX_GROWTH_KB, default 50)
# Needs a clean working tree: it checks out the base and comes back.
set -euo pipefail

BASE_SHA="${1:?usage: $0 <base-sha>}"
MAX_GROWTH_KB="${MAX_GROWTH_KB:-50}"
# Come back to the branch when on one, else to the commit
HEAD_REF="$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)"

measure() {
  (cd apps/web && rm -rf dist && pnpm -s build > /dev/null 2>&1)
  local total largest
  total=$(du -sk apps/web/dist | cut -f1)
  largest=$(find apps/web/dist -name '*.js' -exec du -k {} + | sort -rn | head -1 | cut -f1)
  echo "$total ${largest:-0}"
}

read -r HEAD_TOTAL HEAD_LARGEST < <(measure)

trap 'git checkout --quiet -f "$HEAD_REF"' EXIT
git checkout --quiet -f "$BASE_SHA"
pnpm install --silent > /dev/null
read -r BASE_TOTAL BASE_LARGEST < <(measure)
git checkout --quiet -f "$HEAD_REF"
pnpm install --silent > /dev/null
trap - EXIT

TOTAL_GROWTH=$((HEAD_TOTAL - BASE_TOTAL))
LARGEST_GROWTH=$((HEAD_LARGEST - BASE_LARGEST))

echo "| Metric | Base | This PR | Change |"
echo "|--------|------|---------|--------|"
echo "| Total bundle | ${BASE_TOTAL} KB | ${HEAD_TOTAL} KB | ${TOTAL_GROWTH} KB |"
echo "| Largest chunk | ${BASE_LARGEST} KB | ${HEAD_LARGEST} KB | ${LARGEST_GROWTH} KB |"

if [ "$TOTAL_GROWTH" -gt "$MAX_GROWTH_KB" ] || [ "$LARGEST_GROWTH" -gt "$MAX_GROWTH_KB" ]; then
  echo ""
  echo "❌ Bundle grew by more than ${MAX_GROWTH_KB} KB. Use dynamic imports for large dependencies."
  exit 1
fi
echo ""
echo "✅ Bundle within ${MAX_GROWTH_KB} KB of base"
