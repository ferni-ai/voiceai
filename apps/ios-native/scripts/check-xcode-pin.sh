#!/bin/bash
# One Xcode for every iOS build (critic M12): CI and the TestFlight lane both
# select the version in .xcode-version, on the same runner image, so what CI
# tested is what ships. Run from anywhere; CI runs it before the build.
set -euo pipefail
cd "$(dirname "$0")/../../.."
version=$(tr -d '[:space:]' < apps/ios-native/.xcode-version)
[[ $version =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || { echo "Xcode pin: .xcode-version must be a version like 26.6, got '$version'"; exit 1; }
fail=0
for wf in .github/workflows/build-apps.yml .github/workflows/ios-testflight.yml; do
  if ! grep -qF 'xcode-select -s "/Applications/Xcode_$(cat apps/ios-native/.xcode-version).app"' "$wf"; then
    echo "Xcode pin: $wf doesn't select the Xcode in apps/ios-native/.xcode-version"; fail=1
  fi
  if grep -qE 'setup-xcode|latest-stable|runs-on: macos-latest' "$wf"; then
    echo "Xcode pin: $wf picks a floating Xcode or runner image"; fail=1
  fi
done
images=$(grep -hE 'runs-on: macos' .github/workflows/build-apps.yml .github/workflows/ios-testflight.yml | sort -u | wc -l)
[ "$images" -eq 1 ] || { echo "Xcode pin: the iOS jobs run on different macOS images"; fail=1; }
[ $fail -eq 0 ] && echo "Xcode pin: Xcode $version everywhere"
exit $fail
