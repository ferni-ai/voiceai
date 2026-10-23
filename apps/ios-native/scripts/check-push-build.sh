#!/bin/bash
# Notes from Ferni ship in the App Store build (IB1): the Release configuration
# compiles FERNI_PUSH (FerniBuild.pushNotes) and signs with the APNs and
# time-sensitive entitlements. The app tests run in Debug, so this is the
# check that the Release build carries it too. CI runs it before the build.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
conditions=$(xcodebuild -showBuildSettings -project Ferni.xcodeproj -target Ferni -configuration Release -disableAutomaticPackageResolution 2>/dev/null \
  | awk -F' = ' '/^ *SWIFT_ACTIVE_COMPILATION_CONDITIONS = /{print $2; exit}')
if [[ " $conditions " == *" FERNI_PUSH "* ]]; then echo "ok   Release compiles FERNI_PUSH"
else echo "FAIL Release doesn't compile FERNI_PUSH (SWIFT_ACTIVE_COMPILATION_CONDITIONS='$conditions')"; fail=1; fi
entitlements=App/Ferni.entitlements
if [ "$(/usr/libexec/PlistBuddy -c 'Print :aps-environment' "$entitlements" 2>/dev/null)" = development ]; then
  echo "ok   aps-environment (Xcode's distribution export makes it production)"
else echo "FAIL $entitlements has no aps-environment"; fail=1; fi
if [ "$(/usr/libexec/PlistBuddy -c 'Print :com.apple.developer.usernotifications.time-sensitive' "$entitlements" 2>/dev/null)" = true ]; then
  echo "ok   time-sensitive notifications"
else echo "FAIL $entitlements has no time-sensitive entitlement"; fail=1; fi
exit $fail
