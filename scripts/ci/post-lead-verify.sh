#!/usr/bin/env bash
# Post the `lead-verify` commit status on the exact SHA a verifier checked, and a PR
# comment starting `RESULT_verifier=PASS|FAIL sha=<40 hex>` (keep FAIL words out of a
# PASS summary: any FAIL wording in a comment blocks):
#   scripts/ci/post-lead-verify.sh <pr> <sha> pass|fail "<summary>"
# Refuses unless <sha> (full, or 9+ hex prefix) is the PR's current head. Lead Verified
# (scripts/ci/lead-verified.ts) counts only the ferni-verifier[bot] app, so this always
# posts as that app (LEAD_VERIFY_TOKEN_CMD mints the token) and never falls back to
# another identity. Repo: $GH_REPO.
set -euo pipefail

usage() { echo "usage: $0 <pr> <sha> pass|fail \"<summary>\"${1:+ ($1)}" >&2; exit 2; }
[ $# -eq 4 ] || usage
pr=$1 sha=$(printf '%s' "$2" | tr 'A-F' 'a-f') summary=$4 repo=${GH_REPO:-ferni-ai/voiceai}
[[ $pr =~ ^[0-9]+$ ]] || usage "pr must be a number"
[[ $sha =~ ^[0-9a-f]{9,40}$ ]] || usage "sha must be 9-40 hex characters"
case $3 in pass) state=success V=PASS ;; fail) state=failure V=FAIL ;; *) usage "verdict must be pass or fail" ;; esac
[ -n "$summary" ] || usage "summary must not be empty"

token_cmd=${LEAD_VERIFY_TOKEN_CMD:-$HOME/.claude/bin/ferni-verifier-token}
if ! GH_TOKEN=$("$token_cmd") || [ -z "$GH_TOKEN" ]; then
  echo "refusing: could not mint a ferni-verifier[bot] token ($token_cmd). Only that app's" >&2
  echo "evidence counts, and this script never posts as another identity." >&2
  exit 4
fi
export GH_TOKEN

head=$(gh api "repos/$repo/pulls/$pr" --jq .head.sha)
if [[ $head != "$sha"* ]]; then
  echo "refusing: $sha is not the head of PR #$pr (head is ${head:0:9}). Verify the head, then post." >&2
  exit 1
fi
# The status is the tamper-proof evidence; the comment is the fallback. If the status
# POST fails (e.g. no statuses:write), still comment, warn, and exit 3.
rc=0
if by=$(gh api -X POST "repos/$repo/statuses/$head" -f state="$state" -f context=lead-verify \
  -f description="${summary:0:140}" --jq .creator.login 2>&1); then
  echo "posted lead-verify=$state on ${head:0:9} (PR #$pr) as $by"
else
  echo "WARNING: lead-verify status NOT posted on ${head:0:9}: $by" >&2
  rc=3
fi
gh pr comment "$pr" -R "$repo" --body "RESULT_verifier=$V sha=$head ($summary)"
exit $rc
