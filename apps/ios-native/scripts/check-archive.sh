#!/bin/bash
# Checks an app before it ships:
# - every app and extension in it (the app, FerniLive, the Watch app and its
#   widgets; frameworks keep their own) carries the same version and build;
# - an archive's build is stamped by scripts/build-number.sh, never the
#   project's static placeholder (App Store Connect refuses a reused build);
# - 1.0 is English only (delight gap 9): no .lproj other than en or Base
#   anywhere, nested bundles included. A long-lived DerivedData can keep
#   folders from before the catalog left the build, so this checks what was
#   built, not what the project says.
# - an archive has a dSYM for every embedded framework, so crashes in them
#   symbolicate (Sentry is linked as Sentry-Dynamic for this; the static
#   product ships none). LiveKitWebRTC ships no dSYMs at all: expected.
#
# Usage: scripts/check-archive.sh <path to Ferni.app or Ferni.xcarchive>
set -euo pipefail
target=$1
[ -d "$target" ] || { echo "check-archive: no such app or archive: $target"; exit 2; }
problems=0

versions=$(find "$target" \( -path "*.app/Info.plist" -o -path "*.appex/Info.plist" \) -not -path "*/Frameworks/*" | sort |
  while read -r plist; do
    printf '%s (%s)  %s\n' "$(plutil -extract CFBundleShortVersionString raw "$plist" 2>/dev/null || echo '?')" \
      "$(plutil -extract CFBundleVersion raw "$plist" 2>/dev/null || echo '?')" "${plist#"$target"/}"
  done)
if [ -z "$versions" ]; then
  echo "check-archive: no app or extension found in $target"; exit 2
fi
if [ "$(echo "$versions" | cut -d' ' -f1-2 | sort -u | wc -l | tr -d ' ')" -ne 1 ]; then
  echo "check-archive: the bundles disagree on version and build:"; echo "$versions" | sed 's/^/  /'; problems=1
fi
build=$(echo "$versions" | head -1 | sed -E 's/^[^(]*\(([^)]*)\).*/\1/')
if [[ $target == *.xcarchive* ]] && ! [[ $build =~ ^20[0-9]{8}\.[0-9]{1,2}$ ]]; then
  echo "check-archive: build '$build' isn't stamped; archive with CURRENT_PROJECT_VERSION=\$(scripts/build-number.sh)"; problems=1
fi

stray=$(find "$target" -type d -name "*.lproj" ! -name "en.lproj" ! -name "Base.lproj" | sort)
if [ -n "$stray" ]; then
  echo "check-archive: languages other than English would ship (build from a clean DerivedData):"
  echo "$stray" | sed 's/^/  /'; problems=1
fi

if [[ $target == *.xcarchive* ]]; then
  for framework in "$target"/Products/Applications/*.app/Frameworks/*.framework; do
    [ -d "$framework" ] || continue
    name=$(basename "$framework")
    [ "$name" = LiveKitWebRTC.framework ] && continue   # its xcframework has none
    if [ ! -d "$target/dSYMs/$name.dSYM" ]; then
      echo "check-archive: no dSYM for $name, so its crashes won't symbolicate"; problems=1
    fi
  done
fi

[ $problems -eq 0 ] && echo "check-archive: $build everywhere, English only, dSYMs present"
exit $problems
