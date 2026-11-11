#!/usr/bin/env bash
# =============================================================================
# GITLEAKS HISTORY
# =============================================================================
# The nightly full-history secret scan (Secret Scan (main) workflow). CI's
# Security Scan checks only each PR's range; this reads every commit reachable
# from <rev> and fails when the number of findings is not exactly the baseline
# in gitleaks-history-baseline.txt.
#
# Why a count and not a list: history already holds findings (mostly docs and
# test fixtures; see the baseline file), and history can't change without a
# rewrite, so the count only moves when something new lands or the scan reads
# something different. A list of fingerprints would publish where each one is.
#   - more than the baseline: a new finding reached main. Run the command printed
#     below locally to see it (redacted), then rotate and fix.
#   - fewer: the scan read less than it should (a shallow checkout, a git error
#     gitleaks swallowed) or the rules changed. Either way it fails; a deliberate
#     change (a gitleaks bump) updates the baseline in the same PR.
#
# Until 2026-11 this scan lived in security-scan.yml behind continue-on-error and
# `|| true`, in a workflow that was disabled, so it could never fail (#3622).
#
# Like gitleaks-range.sh it first proves gitleaks can go red (gitleaks-canary.sh),
# ignores inline `gitleaks:allow`, scans merge commits for what they add, and
# scans through the git dir. Unlike it, it lets git skip binary files (no
# --text): diffing every binary in history as text ran past 30 minutes, and the
# range scan already reads each PR with --text.
#
# Usage: gitleaks-history.sh [<rev>]   (default HEAD; needs gitleaks and jq)
# =============================================================================
set -euo pipefail

rev=${1:-HEAD}
here=$(dirname "${BASH_SOURCE[0]}")
baseline_file="$here/gitleaks-history-baseline.txt"

refuse() {
  echo "::error::$*"
  exit 1
}

git rev-parse --verify --quiet "$rev^{commit}" >/dev/null \
  || refuse "can't resolve '$rev' to a commit"
[ "$(git rev-parse --is-shallow-repository)" = false ] \
  || refuse "the checkout is shallow, so history can't be scanned; check out with fetch-depth: 0"
baseline=$(grep -E '^[0-9]+$' "$baseline_file" | head -n 1 || true)
[ -n "$baseline" ] || refuse "no baseline count in $baseline_file"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Rules and ignore list as of <rev>, gitleaks' defaults and an empty list if absent.
config="$work/gitleaks.toml"
ignore="$work/gitleaksignore"
git show "$rev:.gitleaks.toml" >"$config" 2>/dev/null \
  || printf '[extend]\nuseDefault = true\n' >"$config"
git show "$rev:.gitleaksignore" >"$ignore" 2>/dev/null || : >"$ignore"

flags=(--no-banner --redact --ignore-gitleaks-allow
  --config "$config" --gitleaks-ignore-path "$ignore")

bash "$here/gitleaks-canary.sh" "${flags[@]}"

# Exit 9 for findings, so gitleaks failing outright (exit 1) isn't read as a count.
# Only <rev>'s history: with no --log-opts gitleaks reads --all, which in a full
# checkout is every remote branch.
report="$work/report.json"
log_opts="--remerge-diff --no-textconv $rev"
rc=0
gitleaks git "${flags[@]}" --exit-code 9 --log-level warn \
  --report-format json --report-path "$report" \
  --log-opts="$log_opts" "$(git rev-parse --absolute-git-dir)" 2>"$work/log" || rc=$?
cat "$work/log" >&2
case $rc in
  0 | 9) ;;
  *) refuse "gitleaks failed (exit $rc), so history wasn't scanned" ;;
esac
# gitleaks logs git's own errors (a commit it couldn't diff) and goes on, exit
# code unchanged, so a partly read history would otherwise pass as a full one.
if grep -E '(^|[^A-Za-z])ERR([^A-Za-z]|$)' "$work/log" >/dev/null; then
  refuse "gitleaks logged an error while reading history (above), so the count can't be trusted"
fi
count=$(jq 'length' "$report") || refuse "couldn't read the gitleaks report"
[ "$rc" -eq 0 ] && [ "$count" -ne 0 ] && refuse "gitleaks exited 0 but reported $count findings"
[ "$rc" -eq 9 ] && [ "$count" -eq 0 ] && refuse "gitleaks reported findings but the report is empty"

echo "History of $(git rev-parse --short "$rev"): $count findings (baseline $baseline)"
if [ "$count" -gt "$baseline" ]; then
  echo "::error::$((count - baseline)) new secret finding(s) in history. To see them (redacted):"
  echo "  gitleaks git --no-banner --redact --ignore-gitleaks-allow --log-opts='$log_opts' ."
  exit 1
fi
if [ "$count" -lt "$baseline" ]; then
  refuse "$((baseline - count)) fewer findings than the baseline. History is append-only, so the scan read less than before (shallow or partial checkout?) or the rules changed; if the change is deliberate, set the baseline to $count"
fi
