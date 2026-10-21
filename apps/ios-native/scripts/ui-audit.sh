#!/bin/bash
# The UI tests (FerniUITests: the accessibility audit and every behaviour test,
# all but the store screenshots) on one simulator, picked by name so CI checks
# the layouts that were checked by hand. A test that skips on one device (an
# iPad-only test, a call that only scrolls on an SE) runs in the lane where it
# bites.
#
#   gate:   any failure fails the job.
#   report: never fails the job, but every failure count is posted as a
#           warning annotation, so it stays visible.
#
# Usage: scripts/ui-audit.sh gate|report "<simulator name>" <SwiftPM dir> <results dir> [Class,Class...]
# With no classes, all of FerniUITests but StoreScreenshotTests. A simulator
# the image doesn't have is created from the device type of the same name.
set -euo pipefail
cd "$(dirname "$0")/.."
mode=$1 name=$2 spm=$3 out=$4 classes=${5:-}
udid=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
version = lambda r: [int(x) for x in r.split(".iOS-")[1].split("-")]
runtimes = sorted((r for r in devices if ".iOS-" in r), key=version, reverse=True)
print(next((d["udid"] for r in runtimes for d in devices[r] if d["name"] == sys.argv[1]), ""))
' "$name")
if [ -z "$udid" ]; then
  runtime=$(xcrun simctl list runtimes available -j | python3 -c '
import json, sys
ios = [r for r in json.load(sys.stdin)["runtimes"] if r["platform"] == "iOS"]
print(max(ios, key=lambda r: [int(x) for x in r["version"].split(".")])["identifier"] if ios else "")')
  udid=$(xcrun simctl create "$name" "$name" "$runtime" 2>/dev/null || true)
fi
if [ -z "$udid" ]; then
  echo "::error title=UI audit::no simulator named '$name' on this image, and none could be created"; exit 1
fi
# Only this simulator: another lane (store screenshots) may be using the others.
trap 'xcrun simctl shutdown "$udid" 2>/dev/null || true' EXIT
slug=${name//[^A-Za-z0-9]/-}
bundle="$out/ui-audit-$slug.xcresult"
common=(-project Ferni.xcodeproj -scheme FerniUITests -destination "id=$udid" -clonedSourcePackagesDirPath "$spm"
        -skipPackagePluginValidation -skipMacroValidation CODE_SIGNING_ALLOWED=NO)
if [ -n "$classes" ]; then
  only=(); IFS=, read -ra list <<< "$classes"
  for c in "${list[@]}"; do only+=("-only-testing:FerniUITests/$c"); done
else
  only=(-only-testing:FerniUITests -skip-testing:FerniUITests/StoreScreenshotTests)
fi
xcodebuild build-for-testing "${common[@]}" -quiet
run() {
  rm -rf "$bundle"
  set +e
  xcodebuild test-without-building "${common[@]}" -resultBundlePath "$bundle" \
    "${only[@]}" \
    2>&1 | tee "$out/ui-audit-$slug.log" | grep -E "AUDIT \[|AUDIT-WAVED|Test Case .*(passed|failed|skipped)|Executed [0-9]+ tests"
  status=${PIPESTATUS[0]}
  set -e
}
run
# The simulator sometimes refuses to launch the test runner before any test
# runs (as in scripts/ci-test.sh): only that case is retried, once, out loud.
if [ "$status" -ne 0 ] && grep -q "failed to launch" "$out/ui-audit-$slug.log" \
   && ! grep -q "Test Case '-\[FerniUITests" "$out/ui-audit-$slug.log"; then
  echo "::warning title=UI audit retried ($name)::The simulator failed to launch the test runner before any test ran; retrying once."
  run
fi
# The harness proof (-FerniAuditFixture) plants its findings on purpose; they aren't counted.
failures=$(grep "AUDIT \[" "$out/ui-audit-$slug.log" | grep -vc -- "-FerniAuditFixture" || true)
if [ "$status" -ne 0 ]; then
  if [ "$mode" = report ]; then
    echo "::warning title=Accessibility audit ($name)::$failures audit findings; not gating yet. See the AUDIT lines in this step's log."
    exit 0
  fi
  echo "::error title=Accessibility audit ($name)::$failures audit findings or a failed hit test. See the AUDIT lines in this step's log."
fi
exit "$status"
