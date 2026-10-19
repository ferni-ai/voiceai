#!/bin/bash
# App Store screenshots (item 10): StoreScreenshotTests on the 6.9", 6.3" and
# iPad 13" simulators, exported as PNGs to <out>/<device>/. The app runs as a
# UITestScenario (no network, no account, no sound). Shuts simulators down
# on exit, including after a failure.
#
# Usage: scripts/store-screenshots.sh <SwiftPM dir> <out dir>
set -euo pipefail
cd "$(dirname "$0")/.."
spm=$1 out=$2
trap 'xcrun simctl shutdown all 2>/dev/null || true' EXIT
devices=("iPhone 17 Pro Max" "iPhone 17" "iPad Pro 13-inch (M5)")
common=(-project Ferni.xcodeproj -scheme FerniUITests -clonedSourcePackagesDirPath "$spm"
        -derivedDataPath "$out/DerivedData" -disableAutomaticPackageResolution CODE_SIGNING_ALLOWED=NO)

xcodebuild build-for-testing "${common[@]}" -destination "generic/platform=iOS Simulator" -quiet
status=0
for name in "${devices[@]}"; do
  udid=$(xcrun simctl list devices available -j | python3 -c "
import json, sys
for runtime in json.load(sys.stdin)['devices'].values():
    for d in runtime:
        if d['name'] == sys.argv[1]: print(d['udid']); sys.exit()
sys.exit('no simulator named ' + sys.argv[1])" "$name")
  dir="$out/${name//[^A-Za-z0-9]/-}"
  rm -rf "$dir" && mkdir -p "$dir"
  if xcodebuild test-without-building "${common[@]}" -destination "id=$udid" \
       -only-testing:FerniUITests/StoreScreenshotTests -resultBundlePath "$dir/run.xcresult" -quiet; then
    xcrun xcresulttool export attachments --path "$dir/run.xcresult" --output-path "$dir"
    # "1-home_0_<uuid>.png" in the manifest becomes 1-home.png.
    python3 - "$dir" <<'PY'
import json, os, sys
d = sys.argv[1]
for test in json.load(open(os.path.join(d, "manifest.json"))):
    for a in test["attachments"]:
        name = a["suggestedHumanReadableName"].split("_0_")[0] + ".png"
        os.replace(os.path.join(d, a["exportedFileName"]), os.path.join(d, name))
PY
  else
    echo "Screenshots failed on $name"; status=1
  fi
  xcrun simctl shutdown "$udid" 2>/dev/null || true
done
exit $status
