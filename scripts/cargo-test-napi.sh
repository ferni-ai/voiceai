#!/usr/bin/env bash
# Run a NAPI crate's Rust unit tests, bindings included.
#
# usage: scripts/cargo-test-napi.sh <crate-dir> [cargo test args...]
#
# A NAPI crate's test binary references napi_* symbols that only Node
# provides, so it fails to link ("undefined napi_* symbols") and these tests
# never ran. The tests never call into Node, so the test binary may leave
# those symbols unresolved: dynamic_lookup on macOS (what napi-build already
# does for the .node module), ignore-all plus lazy binding on Linux.
#
# On Linux that still wasn't enough: the binary died at load with "symbol
# lookup error: undefined symbol: napi_is_exception_pending", even with lazy
# binding and napi-rs's noop feature (which leaves out module registration).
# napi's dyn-symbols feature (what Windows always uses) turns every napi_*
# function into a pointer filled in at runtime, so the test binary has no
# unresolved napi_* symbols left (nm -u shows 0) and nothing for the loader
# to trip on.
set -euo pipefail
crate_dir=$1
shift
case "$(uname -s)" in
  Darwin) link='-C link-arg=-undefined -C link-arg=dynamic_lookup' ;;
  Linux) link='-C link-arg=-Wl,--unresolved-symbols=ignore-all -C link-arg=-Wl,-z,lazy' ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 2 ;;
esac
cd "$crate_dir"
RUSTFLAGS="${RUSTFLAGS:-} $link" cargo test --release --lib --features napi/noop,napi-derive/noop,napi/dyn-symbols "$@"
