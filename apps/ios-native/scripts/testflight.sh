#!/bin/bash
# Archive the iPhone app and upload it to TestFlight (internal testers only),
# with Xcode's own tools: no third-party gems in the job that holds the key.
# Needs ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 (the .p8 text). Signing is
# automatic with team XT8W26YE9U. Every archive gets a unique build number
# (scripts/build-number.sh), stamped on every target alike.
set -euo pipefail
cd "$(dirname "$0")/.."

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
key="$work/AuthKey.p8"
printf '%s' "$ASC_KEY_P8" > "$key"
auth=(-allowProvisioningUpdates
      -authenticationKeyPath "$key"
      -authenticationKeyID "$ASC_KEY_ID"
      -authenticationKeyIssuerID "$ASC_ISSUER_ID")

build=$(scripts/build-number.sh)
echo "Build number $build"
xcodebuild archive \
  -project Ferni.xcodeproj -scheme Ferni -configuration Release \
  CURRENT_PROJECT_VERSION="$build" \
  -destination 'generic/platform=iOS' \
  -archivePath "$work/Ferni.xcarchive" \
  "${auth[@]}"

scripts/check-archive.sh "$work/Ferni.xcarchive"

xcodebuild -exportArchive \
  -archivePath "$work/Ferni.xcarchive" \
  -exportOptionsPlist ExportOptions-TestFlight.plist \
  -exportPath "$work/export" \
  "${auth[@]}"
