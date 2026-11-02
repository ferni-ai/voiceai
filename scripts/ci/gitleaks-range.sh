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
# Before scanning, it proves it can still go red: it commits a fake key made up
# at run time into a throwaway repo and requires gitleaks to report it. Nothing
# key-shaped is committed to this repo. The canary uses the same config as the
# real scan, so a change that turns gitleaks off (a broken binary, a config that
# allows everything) fails here instead of passing every PR.
#
# Usage: gitleaks-range.sh <base> <head>
# =============================================================================
set -euo pipefail

base=${1:?usage: gitleaks-range.sh <base> <head>}
head=${2:?usage: gitleaks-range.sh <base> <head>}

canary=$(mktemp -d)
trap 'rm -rf "$canary"' EXIT

# A config in the repo replaces gitleaks' default rules; the canary must face it too.
[ -f .gitleaks.toml ] && cp .gitleaks.toml "$canary/"

# Built in a loop: `tr </dev/urandom | head` dies of SIGPIPE under pipefail.
alphabet=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567
key_id=AKIA
for _ in {1..16}; do key_id+=${alphabet:RANDOM%32:1}; done
git -C "$canary" init --quiet
printf 'aws_access_key_id = %s\n' "$key_id" >"$canary/settings.ini"
git -C "$canary" add settings.ini
git -C "$canary" -c user.name=canary -c user.email=canary@example.com \
  commit --quiet -m canary

set +e
gitleaks git --no-banner --redact --exit-code 1 "$canary" >/dev/null 2>&1
canary_rc=$?
set -e
if [ "$canary_rc" -ne 1 ]; then
  echo "::error::gitleaks did not report a planted fake key (exit $canary_rc), so it can't catch a real one"
  exit 1
fi
echo "Canary: gitleaks reported the planted fake key"

gitleaks git --no-banner --redact --exit-code 1 --log-opts="$base..$head" .
