#!/bin/bash
# Motion rules (ios-motion-spec §6.10): the avatar and the call run on one
# clock and one state machine. Timers, delayed dispatch and forever-repeating
# animations in these modules drift, leak and fight it.
# Run from apps/ios-native; CI runs it before the build. An optional argument
# is another root to check (scripts/test-motion-rules.sh uses fixture trees).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=${1:-"$here/.."}
cd "$root"
paths=(App Packages/FerniDesign/Sources Packages/FerniVoice/Sources)
banned='Timer\.scheduledTimer|Timer\.publish|DispatchQueue\.main\.asyncAfter|\.repeatForever|CADisplayLink'
# The one exception: the avatar's clock. A CAMetalDisplayLink on Ferni's
# Metal layer replaced TimelineView as THE avatar clock (red team item 3):
# each frame's motion is computed for the moment it reaches the glass, and
# FramePace's rate goes straight to the link. Only that file may own one;
# anything else wanting a frame clock reads the avatar's, never its own.
# (The CADisplayLink pattern above doesn't match "CAMetalDisplayLink".)
metal_clock='CAMetalDisplayLink'
metal_clock_owner='Packages/FerniDesign/Sources/FerniDesign/Alive/AliveMetalView.swift'
existing=()
for p in "${paths[@]}"; do [ -e "$p" ] && existing+=("$p"); done
[ ${#existing[@]} -gt 0 ] || { echo "Motion rules: none of ${paths[*]} under $(pwd)"; exit 1; }
fail=0
if hits=$(grep -rnE "$banned" "${existing[@]}" --include='*.swift'); then
  echo "Motion rules: use the avatar's clock (AliveMetalView) or TimelineView instead of:"
  echo "$hits"
  fail=1
fi
if hits=$(grep -rnE "$metal_clock" "${existing[@]}" --include='*.swift' | grep -v "^$metal_clock_owner:"); then
  echo "Motion rules: only $metal_clock_owner owns a $metal_clock (the avatar's one clock):"
  echo "$hits"
  fail=1
fi
[ $fail -eq 0 ] && echo "Motion rules: clean"
# The check itself, on fixture trees, on the default run (CI's): a rule that
# can't fail is no rule. The self-test passes a root, so this doesn't recurse.
if [ $# -eq 0 ] && [ $fail -eq 0 ]; then
  "$here/test-motion-rules.sh" > /dev/null || { echo "Motion rules: the self-test failed (scripts/test-motion-rules.sh)"; fail=1; }
fi
exit $fail
