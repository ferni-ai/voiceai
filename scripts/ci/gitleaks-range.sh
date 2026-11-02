#!/usr/bin/env bash
# =============================================================================
# GITLEAKS RANGE
# =============================================================================
# Fails the Security Scan job when the change (base..head, from
# secret-scan-range.sh) adds anything shaped like a credential.
#
# trufflehog runs first in the same job, but it fails only on keys it can verify
# against the provider (or whose check didn't finish). A key it can't verify —
# revoked, from a provider it can't reach, or a bare access key id — passes. On
# 2026-11-02 a planted, regex-valid fake AWS key passed trufflehog with 0
# findings. gitleaks matches on shape, so it catches that key whether or not it
# is live. Until this script it ran only in security-scan.yml, after `|| true`,
# and only when OPTIONAL_CI was on, so it could never fail anything.
#
# A change must not be able to excuse itself, so:
#   - the rules (.gitleaks.toml) and the ignore list (.gitleaksignore) come from
#     the BASE commit, never from the change being scanned (gitleaks would
#     otherwise load both from the checkout);
#   - inline `gitleaks:allow` comments are ignored;
#   - merge commits are scanned for what they add (--remerge-diff), so a key
#     slipped in while resolving a conflict is caught too;
#   - diffs are always text (--text): gitleaks reads `git log -p`, and a
#     .gitattributes saying `-diff` or `binary` would otherwise turn the change
#     into "Binary files differ" with nothing to scan; --no-textconv for the
#     same reason;
#   - three things the scan can't see through are refused outright: base rules
#     that `[extend]` a file (gitleaks reads it from the checkout, i.e. from the
#     change), octopus merges (--remerge-diff doesn't diff them), and Git LFS
#     (history holds only a pointer; the content sits in LFS storage);
#   - a base or head that doesn't resolve fails (gitleaks would report "no
#     leaks" for a range it couldn't read).
#
# Before scanning, it proves it can still go red: it commits a fake key made up
# at run time into a throwaway repo and requires gitleaks to report it under the
# same rules. A broken binary or rules that allow everything fail here instead of
# passing every PR. Nothing key-shaped is committed to this repo.
#
# Usage: gitleaks-range.sh <base> <head>
# =============================================================================
set -euo pipefail

base=${1:?usage: gitleaks-range.sh <base> <head>}
head=${2:?usage: gitleaks-range.sh <base> <head>}

refuse() {
  echo "::error::$*"
  exit 1
}

# gitleaks exits 0 when its own `git log` fails, so a range that doesn't resolve
# would otherwise pass as "no leaks".
for ref in "$base" "$head"; do
  git rev-parse --verify --quiet "$ref^{commit}" >/dev/null \
    || refuse "can't resolve '$ref' to a commit, so there is no range to scan"
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Rules and ignore list as of the base commit. With no config there, gitleaks'
# own defaults; with no ignore file there, an empty one.
config="$work/gitleaks.toml"
ignore="$work/gitleaksignore"
git show "$base:.gitleaks.toml" >"$config" 2>/dev/null \
  || printf '[extend]\nuseDefault = true\n' >"$config"
git show "$base:.gitleaksignore" >"$ignore" 2>/dev/null || : >"$ignore"

# `[extend] path` is resolved against the checkout, so rules that extend a file
# could be loosened by the change editing that file. Parsed as TOML, not matched
# with regexes: quoted keys (`["extend"]`, `"path" =`) are the same key to
# gitleaks, and its config loader (viper) ignores key case, so `[Extend]` and
# `PATH` count too. A config that won't parse, or no tomllib, refuses as well.
set +e
python3 -I -c '
import sys
try:
    import tomllib
    with open(sys.argv[1], "rb") as f:
        config = tomllib.load(f)
except Exception as e:
    print(e, file=sys.stderr)
    sys.exit(3)
for key, value in config.items():
    if key.lower() == "extend" and isinstance(value, dict):
        if any(k.lower() == "path" for k in value):
            sys.exit(1)
' "$config"
extend_rc=$?
set -e
case $extend_rc in
  0) ;;
  1) refuse "the base .gitleaks.toml uses [extend] path, which gitleaks reads from the change being scanned; inline those rules instead" ;;
  *) refuse "couldn't check the base .gitleaks.toml for [extend] path (exit $extend_rc); it must parse as TOML with python3 tomllib" ;;
esac

# --remerge-diff skips merges with three or more parents.
if [ -n "$(git rev-list --min-parents=3 "$base..$head")" ]; then
  refuse "the range has an octopus merge (3+ parents), which the scan can't diff; merge one branch at a time"
fi

# Git LFS keeps only a pointer in history, so a key stored through LFS is never
# scanned (and is downloadable from a public repo). The diffs go to files, not
# pipes: under set -e a failed git log stops the script instead of reading as
# "no match". Added lines are marked '>' rather than '+', so a content line
# can't be mistaken for a '+++' file header or vice versa.
log_p=(git log --format= -p -U0 --text --no-textconv --remerge-diff
  --output-indicator-new='>' "$base..$head")
"${log_p[@]}" -- ':(glob,icase)**/.gitattributes' >"$work/attributes.diff"
"${log_p[@]}" >"$work/added.diff"
if grep -E '^>.*filter=lfs' "$work/attributes.diff" >/dev/null; then
  refuse "the range adds a filter=lfs attribute; LFS content isn't scanned for secrets"
fi
# Every spec URL git-lfs accepts in a pointer (lfs/pointer.go v1Aliases), with
# the surrounding whitespace and CRLF its parser strips.
lfs_specs='https://git-lfs\.github\.com/spec/v1|https://hawser\.github\.com/spec/v1|http://git-media\.io/v/2'
if grep -E "^>[[:space:]]*version ($lfs_specs)[[:space:]]*\$" "$work/added.diff" >/dev/null; then
  refuse "the range adds a Git LFS pointer file; LFS content isn't scanned for secrets"
fi

flags=(--no-banner --redact --exit-code 1 --ignore-gitleaks-allow
  --config "$config" --gitleaks-ignore-path "$ignore")

# Built in a loop: `tr </dev/urandom | head` dies of SIGPIPE under pipefail.
alphabet=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567
key_id=AKIA
for _ in {1..16}; do key_id+=${alphabet:RANDOM%32:1}; done
canary="$work/canary"
git init --quiet "$canary"
printf 'aws_access_key_id = %s\n' "$key_id" >"$canary/settings.ini"
git -C "$canary" add settings.ini
git -C "$canary" -c user.name=canary -c user.email=canary@example.com \
  commit --quiet -m canary

set +e
gitleaks git "${flags[@]}" "$canary" >/dev/null 2>&1
canary_rc=$?
set -e
if [ "$canary_rc" -ne 1 ]; then
  echo "::error::gitleaks did not report a planted fake key (exit $canary_rc), so it can't catch a real one"
  exit 1
fi
echo "Canary: gitleaks reported the planted fake key"

# Scan through the .git directory, not the working tree: gitleaks also reads a
# .gitleaksignore from the directory it scans, and the change could add one there.
gitleaks git "${flags[@]}" --log-opts="--remerge-diff --text --no-textconv $base..$head" \
  "$(git rev-parse --absolute-git-dir)"
