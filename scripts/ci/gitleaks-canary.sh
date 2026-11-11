#!/usr/bin/env bash
# =============================================================================
# GITLEAKS CANARY
# =============================================================================
# Proves gitleaks can still go red before a scan's "no leaks" is believed: it
# commits a fake key made up at run time into a throwaway repo and requires
# gitleaks, run with the caller's flags (rules, ignore list), to report it. A
# broken binary or rules that allow everything fail here instead of passing.
# Nothing key-shaped is committed to this repo.
#
# Used by gitleaks-range.sh (CI's PR and merge-queue scan) and
# gitleaks-history.sh (the nightly full-history scan).
#
# Usage: gitleaks-canary.sh <gitleaks flags...>
# =============================================================================
set -euo pipefail

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

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
# Its own exit code for a finding, so a config gitleaks can't load (exit 1) isn't
# mistaken for the planted key being found. The last --exit-code given wins.
gitleaks git "$@" --exit-code 9 "$canary" >/dev/null 2>&1
canary_rc=$?
set -e
if [ "$canary_rc" -ne 9 ]; then
  echo "::error::gitleaks did not report a planted fake key (exit $canary_rc), so it can't catch a real one"
  exit 1
fi
echo "Canary: gitleaks reported the planted fake key"
