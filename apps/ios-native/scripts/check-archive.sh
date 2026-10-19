#!/bin/bash
# Checks an app before it ships. 1.0 is English only (delight gap 9): no
# .lproj other than en or Base anywhere in the app, nested bundles included.
# An incremental or archive build in a long-lived DerivedData can keep
# folders from before the catalog left the build, so this checks what was
# built, not what the project says.
#
# Usage: scripts/check-archive.sh <path to Ferni.app or Ferni.xcarchive>
set -euo pipefail
target=$1
[ -d "$target" ] || { echo "check-archive: no such app or archive: $target"; exit 2; }
stray=$(find "$target" -type d -name "*.lproj" ! -name "en.lproj" ! -name "Base.lproj" | sort)
if [ -n "$stray" ]; then
  echo "check-archive: languages other than English would ship (build from a clean DerivedData):"
  echo "$stray" | sed 's/^/  /'
  exit 1
fi
echo "check-archive: English only"
