#!/bin/bash
# CI: build once, run the package tests, then the app-hosted tests.
#
# The app-hosted bundle needs the simulator to launch Ferni as its host, and
# the simulator sometimes reports "failed to launch" before any test runs
# (seen locally 2026-10-19). Only that case is retried, once, with a warning
# in the log, so a real crash or a failing test still fails the job.
#
# Usage: scripts/ci-test.sh <simulator udid> <SwiftPM dir> <results dir>
set -euo pipefail
udid=$1 spm=$2 out=$3
common=(-project Ferni.xcodeproj -scheme Ferni -destination "id=$udid" -clonedSourcePackagesDirPath "$spm"
        -skipPackagePluginValidation -skipMacroValidation CODE_SIGNING_ALLOWED=NO)

xcodebuild build-for-testing "${common[@]}"
xcodebuild test-without-building "${common[@]}" -skip-testing:FerniAppTests -resultBundlePath "$out/FerniTests.xcresult"

app_tests() {
  local log=$1 bundle=$2
  set +e
  xcodebuild test-without-building "${common[@]}" -only-testing:FerniAppTests -resultBundlePath "$bundle" 2>&1 | tee "$log"
  local status=${PIPESTATUS[0]}
  set -e
  return "$status"
}

if app_tests "$out/app-tests.log" "$out/FerniAppTests.xcresult"; then exit 0; fi
if grep -q "failed to launch com.sethdford.ferni" "$out/app-tests.log" \
  && ! grep -q "Test Case '-\[FerniAppTests" "$out/app-tests.log"; then
  echo "::warning title=App-hosted tests retried::The simulator failed to launch the host app before any test ran; retrying once."
  app_tests "$out/app-tests-retry.log" "$out/FerniAppTests-retry.xcresult"
else
  exit 1
fi
