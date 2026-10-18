#!/bin/bash
# Archive the iPhone app and upload it to TestFlight (internal testers only),
# with Xcode's own tools: no third-party gems in the job that holds the key.
# Needs ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 (the .p8 text). Signing is
# automatic with team XT8W26YE9U; Xcode manages the build number.
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

xcodebuild archive \
  -project Ferni.xcodeproj -scheme Ferni -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$work/Ferni.xcarchive" \
  "${auth[@]}"

xcodebuild -exportArchive \
  -archivePath "$work/Ferni.xcarchive" \
  -exportOptionsPlist ExportOptions-TestFlight.plist \
  -exportPath "$work/export" \
  "${auth[@]}"
