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
#     into "Binary files differ" with nothing to scan.
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

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Rules and ignore list as of the base commit. With no config there, gitleaks'
# own defaults; with no ignore file there, an empty one.
config="$work/gitleaks.toml"
ignore="$work/gitleaksignore"
git show "$base:.gitleaks.toml" >"$config" 2>/dev/null \
  || printf '[extend]\nuseDefault = true\n' >"$config"
git show "$base:.gitleaksignore" >"$ignore" 2>/dev/null || : >"$ignore"

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
gitleaks git "${flags[@]}" --log-opts="--remerge-diff --text $base..$head" \
  "$(git rev-parse --absolute-git-dir)"
