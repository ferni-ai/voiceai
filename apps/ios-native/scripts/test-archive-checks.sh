#!/bin/bash
# Self-test for scripts/build-number.sh and scripts/check-archive.sh, on
# synthetic bundles (no Xcode build). CI runs it; exits non-zero on any miss.
set -uo pipefail
cd "$(dirname "$0")"
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
fail=0
expect() { # name expected-exit command...
  local name=$1 want=$2; shift 2
  "$@" > "$work/out.txt" 2>&1; local got=$?
  if [ "$got" -ne "$want" ]; then echo "FAIL $name: exit $got, want $want"; sed 's/^/    /' "$work/out.txt"; fail=1; else echo "ok   $name"; fi
}
bundle() { # dir version build
  mkdir -p "$1"
  plutil -create xml1 "$1/Info.plist"
  plutil -insert CFBundleShortVersionString -string "$2" "$1/Info.plist"
  plutil -insert CFBundleVersion -string "$3" "$1/Info.plist"
}
app() { # root build [watch-widget-build]
  bundle "$1" 1.0.0 "$2"; mkdir -p "$1/en.lproj"
  bundle "$1/PlugIns/FerniLive.appex" 1.0.0 "$2"
  bundle "$1/Watch/FerniWatch.app" 1.0.0 "$2"
  bundle "$1/Watch/FerniWatch.app/PlugIns/FerniWatchWidgets.appex" 1.0.0 "${3:-$2}"
  bundle "$1/Frameworks/Sentry.framework" 9.30.0 9.30.0   # frameworks keep their own versions
}

# build-number.sh: yyyymmddHH.m in UTC, fits an App Store build number, increases.
n=$(./build-number.sh)
if [[ $n =~ ^20[0-9]{8}\.([0-9]|[1-5][0-9])$ ]] && [ "${n%%.*}" -le 2147483647 ]; then echo "ok   build number form ($n)"; else echo "FAIL build number form: '$n'"; fail=1; fi
if [ "${n%%.*}" -gt 2026101907 ]; then echo "ok   newer than the last upload (2026101907)"; else echo "FAIL not newer than 2026101907: $n"; fail=1; fi

app "$work/good.app" 2026101914.7
expect "a stamped app passes" 0 ./check-archive.sh "$work/good.app"
app "$work/mixed.app" 2026101914.7 2026101913.2
expect "a widget with another build fails" 1 ./check-archive.sh "$work/mixed.app"
mkdir -p "$work/static.xcarchive/Products/Applications"; app "$work/static.xcarchive/Products/Applications/Ferni.app" 6
expect "an archive with the static build fails" 1 ./check-archive.sh "$work/static.xcarchive"
mkdir -p "$work/stamped.xcarchive/Products/Applications" "$work/stamped.xcarchive/dSYMs/Sentry.framework.dSYM"
app "$work/stamped.xcarchive/Products/Applications/Ferni.app" 2026101914.7
expect "a stamped archive passes" 0 ./check-archive.sh "$work/stamped.xcarchive"
bundle "$work/stamped.xcarchive/Products/Applications/Ferni.app/Frameworks/LiveKitWebRTC.framework" 137 137
expect "LiveKitWebRTC without a dSYM passes (it ships none)" 0 ./check-archive.sh "$work/stamped.xcarchive"
rm -rf "$work/stamped.xcarchive/dSYMs/Sentry.framework.dSYM"
expect "a framework without its dSYM fails" 1 ./check-archive.sh "$work/stamped.xcarchive"
app "$work/german.app" 2026101914.7; mkdir -p "$work/german.app/Watch/FerniWatch.app/de.lproj"
expect "a stray language fails" 1 ./check-archive.sh "$work/german.app"
exit $fail
