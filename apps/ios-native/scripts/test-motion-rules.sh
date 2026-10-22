#!/bin/bash
# Self-test for scripts/check-motion-rules.sh, on fixture trees: the banned
# clocks fail, the avatar's CAMetalDisplayLink passes only in AliveMetalView.
# CI runs it; exits non-zero on any miss.
set -uo pipefail
cd "$(dirname "$0")"
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
fail=0
owner=Packages/FerniDesign/Sources/FerniDesign/Alive/AliveMetalView.swift
expect() { # name expected-exit root
  ./check-motion-rules.sh "$3" > "$work/out.txt" 2>&1; local got=$?
  if [ "$got" -ne "$2" ]; then echo "FAIL $1: exit $got, want $2"; sed 's/^/    /' "$work/out.txt"; fail=1; else echo "ok   $1"; fi
}
tree() { # name file contents: a tree with the three checked roots and one file
  local root="$work/$1"
  mkdir -p "$root/App" "$root/Packages/FerniDesign/Sources" "$root/Packages/FerniVoice/Sources"
  mkdir -p "$(dirname "$root/$2")"
  printf '%s\n' "$3" > "$root/$2"
  echo "$root"
}

expect "the real tree is clean" 0 ..
expect "a clean tree passes" 0 "$(tree clean App/Home.swift 'struct Home {}')"
expect "the avatar's clock in AliveMetalView passes" 0 \
  "$(tree owner "$owner" 'let link = CAMetalDisplayLink(metalLayer: layer)')"
expect "a CAMetalDisplayLink anywhere else fails" 1 \
  "$(tree app App/Scratch.swift 'let link = CAMetalDisplayLink(metalLayer: layer)')"
expect "one in another FerniDesign file fails" 1 \
  "$(tree design Packages/FerniDesign/Sources/FerniDesign/Avatar/Other.swift 'final class X: CAMetalDisplayLinkDelegate {}')"
expect "one in FerniVoice fails" 1 \
  "$(tree voice Packages/FerniVoice/Sources/FerniVoice/Meter.swift 'var link: CAMetalDisplayLink?')"
expect "the allowlist doesn't cover a CADisplayLink in AliveMetalView" 1 \
  "$(tree owner-cadl "$owner" 'let link = CADisplayLink(target: self, selector: #selector(tick))')"
expect "a timer still fails" 1 "$(tree timer App/T.swift 'Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in }')"
expect "a forever animation still fails" 1 "$(tree forever App/F.swift '.animation(.linear.repeatForever())')"
exit $fail
