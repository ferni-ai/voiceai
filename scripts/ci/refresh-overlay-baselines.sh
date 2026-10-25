#!/usr/bin/env bash
# Refresh the overlay gallery's Linux baselines from a PR's CI run.
#
# "Overlay Gallery (visual + contrast)" is a required check (#2391). A PR that
# changes what an overlay shows (copy, layout) fails it until the committed
# baselines match. They must come from the Linux runner, never a Mac, and every
# gallery run uploads what it saw (artifact "overlay-gallery"). This copies the
# shots that failed comparison over their baselines, adds any new ones CI wrote,
# and lists what changed in the app since each baseline, so the diff can be
# checked against an intended change before committing. It never commits.
#
# Usage (from the repo root, on the PR's branch):
#   scripts/ci/refresh-overlay-baselines.sh <pr-number>
#   scripts/ci/refresh-overlay-baselines.sh --run <ci-run-id>
# Env: GH_REPO (default ferni-ai/voiceai).
# Exit: 0 baselines changed | 2 nothing to refresh | 1 error
set -euo pipefail

REPO=${GH_REPO:-ferni-ai/voiceai}
BASE=apps/web/tests/overlays/__screenshots__/linux
die() { echo "refresh-overlay-baselines: $*" >&2; exit 1; }

[ -d "$BASE" ] || die "run from the repo root ($BASE not found)"
case "${1:-}" in
  --run) run=${2:-}; [[ "$run" =~ ^[0-9]+$ ]] || die "--run needs a CI run id" ;;
  ''|-h|--help) sed -n 2,16p "$0"; exit 1 ;;
  *)
    [[ "$1" =~ ^[0-9]+$ ]] || die "not a PR number: $1"
    head=$(gh pr view "$1" -R "$REPO" --json headRefOid --jq .headRefOid) || die "can't read PR $1"
    # the newest CI run on the PR's head whose gallery job ran (it uploads the artifact)
    run=""
    for id in $(gh run list -R "$REPO" --workflow ci.yml --commit "$head" --limit 10 \
      --json databaseId --jq '.[].databaseId'); do
      ran=$(gh api "repos/$REPO/actions/runs/$id/jobs?per_page=100" --jq \
        '[.jobs[] | select(.name == "Overlay Gallery (visual + contrast)") | select(.conclusion == "success" or .conclusion == "failure")] | length')
      [ "$ran" -gt 0 ] && { run=$id; break; }
    done
    [ -n "$run" ] || die "no finished gallery run on PR $1's head ${head:0:9}; wait for CI"
    ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
gh run download "$run" -R "$REPO" -n overlay-gallery -D "$tmp" >/dev/null || die "no overlay-gallery artifact on run $run"
echo "CI run $run"

# 1. Shots that failed comparison: test-results/overlay-gallery-<scene>-...-<project>[-retryN]/<shot>-diff.png.
#    First attempts before retries, so a retry's actual (the attempt that decided the result)
#    is copied last. A plain sort puts "phone-retry1/" before "phone/" ('-' < '/').
changed=0
while IFS= read -r diff; do
  dir=$(basename "$(dirname "$diff")")
  [[ "$dir" =~ -(phone|desktop)(-retry[0-9]+)?$ ]] || { echo "skip (unknown project): $dir"; continue; }
  project=${BASH_REMATCH[1]}
  shot=$(basename "$diff" -diff.png)
  actual=$(dirname "$diff")/$shot-actual.png
  [ -f "$actual" ] || { echo "skip (no actual): $dir/$shot"; continue; }
  mkdir -p "$BASE/$project"
  cp "$actual" "$BASE/$project/$shot.png"
  changed=1
done < <(find "$tmp/test-results" -name '*-diff.png' 2>/dev/null \
  | awk '{ print (match($0, /-retry[0-9]+\//) ? 1 : 0) "\t" $0 }' | sort | cut -f2-)

# 2. Shots with no baseline yet, which CI wrote itself (missing snapshots are written, not failed).
if [ -d "$tmp/tests/overlays/__screenshots__/linux" ]; then
  while IFS= read -r f; do
    rel=${f#"$tmp/tests/overlays/__screenshots__/linux/"}
    [ -f "$BASE/$rel" ] && continue
    mkdir -p "$(dirname "$BASE/$rel")"
    cp "$f" "$BASE/$rel"
    changed=1
  done < <(find "$tmp/tests/overlays/__screenshots__/linux" -name '*.png' | sort)
fi

modified=$(git status --porcelain -- "$BASE" | awk '$1 == "M" {print $2}')
new=$(git status --porcelain --untracked-files=all -- "$BASE" | awk '$1 == "??" {print $2}')
if [ "$changed" = 0 ] || { [ -z "$modified" ] && [ -z "$new" ]; }; then
  echo "Nothing to refresh: no shot from run $run differs from the committed baselines."
  exit 2
fi

if [ -n "$modified" ]; then
  echo
  echo "Changed baselines, with the app changes since each was last committed (the diff should match one):"
  while IFS= read -r f; do
    since=$(git log -1 --format=%h -- "$f")
    echo "  $f (baseline $since)"
    git log --oneline -6 "$since"..HEAD -- apps/web/src apps/web/index.html | sed 's/^/      /'
  done <<<"$modified"
fi
if [ -n "$new" ]; then
  echo
  echo "New baselines ($(wc -l <<<"$new" | tr -d ' ') shots with none committed, so CI wrote them instead of comparing):"
  while IFS= read -r f; do echo "  $f"; done <<<"$new"
  echo "  Committing these turns their pixel check on. Look at each one first."
fi
echo
echo "Open each changed PNG next to its *-expected.png and *-diff.png (gh run download $run -n overlay-gallery),"
echo "then commit only the ones that match an intended change."
exit 0
