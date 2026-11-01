#!/bin/bash
# The accessibility audit, the Talk-button hit tests and the avatar touch tests (FerniUITests) on one
# simulator, picked by name so CI audits the layouts that were checked by hand.
#
#   gate:   any failure fails the job (iPhone 17 Pro Max).
#   report: never fails the job, but every failure count is posted as a
#           warning annotation, so it stays visible (iPad, until it's clean).
#
# Usage: scripts/ui-audit.sh gate|report "<simulator name>" <SwiftPM dir> <results dir>
set -euo pipefail
cd "$(dirname "$0")/.."
mode=$1 name=$2 spm=$3 out=$4
udid=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
version = lambda r: [int(x) for x in r.split(".iOS-")[1].split("-")]
runtimes = sorted((r for r in devices if ".iOS-" in r), key=version, reverse=True)
print(next((d["udid"] for r in runtimes for d in devices[r] if d["name"] == sys.argv[1]), ""))
' "$name")
if [ -z "$udid" ]; then
  echo "::error title=UI audit::no simulator named '$name' on this image"; exit 1
fi
# Only this simulator: another lane (store screenshots) may be using the others.
trap 'xcrun simctl shutdown "$udid" 2>/dev/null || true' EXIT
slug=${name//[^A-Za-z0-9]/-}
bundle="$out/ui-audit-$slug.xcresult"
common=(-project Ferni.xcodeproj -scheme FerniUITests -destination "id=$udid" -clonedSourcePackagesDirPath "$spm"
        -skipPackagePluginValidation -skipMacroValidation CODE_SIGNING_ALLOWED=NO)
xcodebuild build-for-testing "${common[@]}" -quiet
run() {
  rm -rf "$bundle"
  set +e
  xcodebuild test-without-building "${common[@]}" -resultBundlePath "$bundle" \
    -only-testing:FerniUITests/AccessibilityAuditTests -only-testing:FerniUITests/TalkButtonTests -only-testing:FerniUITests/AvatarTouchTests -only-testing:FerniUITests/ConsentSheetTests -only-testing:FerniUITests/DeepLinkUITests -only-testing:FerniUITests/HelpLinksUITests -only-testing:FerniUITests/SignInUITests \
    2>&1 | tee "$out/ui-audit-$slug.log" | grep -E "AUDIT \[|Test Case .*(passed|failed)|Executed [0-9]+ tests"
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
failures=$(grep -c "AUDIT \[" "$out/ui-audit-$slug.log" || true)
if [ "$status" -ne 0 ]; then
  if [ "$mode" = report ]; then
    echo "::warning title=Accessibility audit ($name)::$failures audit findings; not gating yet. See the AUDIT lines in this step's log."
    exit 0
  fi
  echo "::error title=Accessibility audit ($name)::$failures audit findings or a failed hit test. See the AUDIT lines in this step's log."
fi
exit "$status"
