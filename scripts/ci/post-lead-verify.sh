#!/usr/bin/env bash
# Post the `lead-verify` commit status on the exact SHA a verifier checked:
#   scripts/ci/post-lead-verify.sh <pr> <sha> pass|fail "<summary>"
# Refuses unless <sha> (full, or 9+ hex prefix) is the PR's current head. Lead Verified
# (scripts/ci/lead-verified.ts) counts it only from an allowed author. Repo: $GH_REPO.
set -euo pipefail

usage() { echo "usage: $0 <pr> <sha> pass|fail \"<summary>\"${1:+ ($1)}" >&2; exit 2; }
[ $# -eq 4 ] || usage
pr=$1 sha=$(printf '%s' "$2" | tr 'A-F' 'a-f') summary=$4 repo=${GH_REPO:-ferni-ai/voiceai}
[[ $pr =~ ^[0-9]+$ ]] || usage "pr must be a number"
[[ $sha =~ ^[0-9a-f]{9,40}$ ]] || usage "sha must be 9-40 hex characters"
case $3 in pass) state=success ;; fail) state=failure ;; *) usage "verdict must be pass or fail" ;; esac
[ -n "$summary" ] || usage "summary must not be empty"

head=$(gh api "repos/$repo/pulls/$pr" --jq .head.sha)
if [[ $head != "$sha"* ]]; then
  echo "refusing: $sha is not the head of PR #$pr (head is ${head:0:9}). Verify the head, then post." >&2
  exit 1
fi
# A status description holds at most 140 characters.
by=$(gh api -X POST "repos/$repo/statuses/$head" -f state="$state" -f context=lead-verify \
  -f description="${summary:0:140}" --jq .creator.login)
echo "posted lead-verify=$state on ${head:0:9} (PR #$pr) as $by"
