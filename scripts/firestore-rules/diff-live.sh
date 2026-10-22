#!/usr/bin/env bash
# Diff the Firestore security rules LIVE in a project against a local file.
# Read-only: two GETs to the Firebase Rules API, never a deploy.
#
#   scripts/firestore-rules/diff-live.sh                 # johnb-2025 vs ./firestore.rules
#   scripts/firestore-rules/diff-live.sh <project> <file>
#   scripts/firestore-rules/diff-live.sh johnb-2025 firestore.rules ferni-dev   # the dev database
#   LIVE_OUT=/tmp/live.rules scripts/firestore-rules/diff-live.sh   # also keep the live copy
#
# Needs `gcloud auth login` (or ADC) with firebaserules.releases.get +
# rulesets.get on the project (Firebase Rules Viewer or any Editor/Owner role).
# Exit: 0 = identical, 1 = they differ, 2 = couldn't fetch.
set -euo pipefail

project="${1:-johnb-2025}"
file="${2:-firestore.rules}"
database="${3:-(default)}"
api="https://firebaserules.googleapis.com/v1"
token="$(gcloud auth print-access-token)"
get() { curl -sSf -H "Authorization: Bearer $token" -H "x-goog-user-project: $project" "$1"; }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=new Function("o","return "+process.argv[1])(JSON.parse(s));process.stdout.write(String(v??""))})' "$1"; }

# The release names the ruleset that serves a database: cloud.firestore for
# (default), cloud.firestore/<id> for a named one.
release_name="cloud.firestore"
[[ "$database" == "(default)" ]] || release_name="cloud.firestore/$database"
release="$(get "$api/projects/$project/releases/$release_name")" ||
  { echo "couldn't read the release $release_name" >&2; exit 2; }
ruleset="$(json 'o.rulesetName' <<<"$release")"
updated="$(json 'o.updateTime' <<<"$release")"
[[ -n "$ruleset" ]] || { echo "release has no rulesetName" >&2; exit 2; }

live="$(mktemp)"
trap 'rm -f "$live"' EXIT
get "$api/$ruleset" | json 'o.source.files.map(f => f.content).join("\n")' >"$live" ||
  { echo "couldn't read $ruleset" >&2; exit 2; }

[[ -n "${LIVE_OUT:-}" ]] && cp "$live" "$LIVE_OUT"
echo "live: $ruleset (released $updated)"
echo "file: $file"
status=0
diff -u --label "live ($project/$database)" --label "$file" "$live" "$file" || status=$?
(( status == 0 )) && echo "identical"
exit "$status"
