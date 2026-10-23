#!/bin/bash
# Motion rules (ios-motion-spec §6.10): the avatar and the call run on one
# clock (TimelineView) and one state machine. Timers, delayed dispatch and
# forever-repeating animations in these modules drift, leak and fight it.
# Run from apps/ios-native; CI runs it before the build.
set -euo pipefail
cd "$(dirname "$0")/.."
paths=(App Packages/FerniDesign/Sources Packages/FerniVoice/Sources)
banned='Timer\.scheduledTimer|Timer\.publish|DispatchQueue\.main\.asyncAfter|\.repeatForever|CADisplayLink'
if hits=$(grep -rnE "$banned" "${paths[@]}" --include='*.swift'); then
  echo "Motion rules: use TimelineView or the AvatarModel clock instead of:"
  echo "$hits"
  exit 1
fi
# Call moments are felt once, from the avatar state machine (HapticCue); a view
# haptic on call state doubles them. UI selection feedback is fine. One line
# only: a modifier split across lines is not caught.
if hits=$(grep -rnE '\.sensoryFeedback\(.*trigger: *([[:alnum:]_]+\.)*call\.' "${paths[@]}" --include='*.swift'); then
  echo "Motion rules: call haptics come from HapticCue, not a view:"
  echo "$hits"
  exit 1
fi
echo "Motion rules: clean"
