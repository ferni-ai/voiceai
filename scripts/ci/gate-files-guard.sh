#!/usr/bin/env bash
# =============================================================================
# GATE FILES GUARD
# =============================================================================
# A PR can weaken the gate that judges it. From July to September every test
# and build step in CI carried continue-on-error, so CI stayed green over 214
# failures. This fails a PR whose ADDED lines under .github/workflows/ or
# scripts/ci/ switch a check off:
#
#   continue-on-error: true, `|| true`, `set +e`, passWithNoTests
#   `if: false` on a job or step                          (workflows only)
#   a new paths: / paths-ignore: filter on a workflow with a merge_group
#   trigger (a required check that never reports stalls the PR and the queue)
#   a required check's job deleted or renamed (lists read from the BASE copy
#   of required-checks.sh, so dropping the entry too doesn't hide it)
#
# Only the diff counts: lines already on main never fail. Full-line comments
# are ignored. The threat is an honest agent "unblocking" its own PR, not an
# attacker, so it reads text, not YAML semantics.
#
# Escape hatch: the PR label ci-gate-change-ok (the lead applies it). Findings
# are still printed, as warnings, and the check passes.
#
# Usage: gate-files-guard.sh <base-ref> <head-ref>
# Env:   PR_LABELS  comma-separated labels (skips the lookup), or
#        PR_NUMBER  + GH_TOKEN to look the labels up with gh.
# Exit:  0 clean or labelled | 1 findings | 2 usage
# =============================================================================
set -euo pipefail

BASE="${1:?usage: gate-files-guard.sh <base-ref> <head-ref>}"
HEAD="${2:?usage: gate-files-guard.sh <base-ref> <head-ref>}"
LABEL=ci-gate-change-ok
ROOTS=(.github/workflows scripts/ci)

for ref in "$BASE" "$HEAD"; do
  git rev-parse -q --verify "$ref^{commit}" >/dev/null || { echo "gate-files-guard: cannot resolve $ref" >&2; exit 2; }
done

findings=()
add() { findings+=("$1:$2: $3"); }

# --- Added lines: "<file>\t<line>\t<text>" -----------------------------------
added=$(git diff -U0 -M --no-color --no-ext-diff "$BASE" "$HEAD" -- "${ROOTS[@]}" | awk '
  /^\+\+\+ / { file = substr($0, 7); next }   # "+++ b/<path>" ("/dev/null" when deleted)
  /^@@ / { split($3, h, ","); line = substr(h[1], 2) + 0; next }
  /^\+/ { print file "\t" line "\t" substr($0, 2); line++ }
')

has_merge_group() { git show "$HEAD:$1" 2>/dev/null | grep -Eq '^[[:space:]]*merge_group:'; }

while IFS=$'\t' read -r file line text; do
  [ -n "$file" ] || continue
  [[ "$text" =~ ^[[:space:]]*# ]] && continue
  if [[ "$text" =~ continue-on-error:[[:space:]]*[\'\"]?true ]]; then
    add "$file" "$line" "continue-on-error: true lets a failing step pass"
  fi
  if [[ "$text" =~ \|\|[[:space:]]*true([^[:alnum:]_]|$) ]]; then
    add "$file" "$line" "'|| true' swallows the command's failure"
  fi
  if [[ "$text" =~ (^|[^[:alnum:]_])set[[:space:]]+\+e([^[:alnum:]_]|$) ]]; then
    add "$file" "$line" "'set +e' stops failures from failing the script"
  fi
  if [[ "$text" =~ pass[Ww]ith[Nn]o[Tt]ests|pass-with-no-tests ]]; then
    add "$file" "$line" "passWithNoTests lets a run that found no tests pass"
  fi
  [[ "$file" == .github/workflows/* ]] || continue
  if [[ "$text" =~ ^[[:space:]]*(-[[:space:]]+)?if:[[:space:]]*(false|\$\{\{[[:space:]]*false[[:space:]]*\}\})[[:space:]]*$ ]]; then
    add "$file" "$line" "'if: false' switches the job or step off"
  fi
  if [[ "$text" =~ ^[[:space:]]*(paths|paths-ignore): ]] && has_merge_group "$file"; then
    add "$file" "$line" "path filter on a merge_group workflow: a required check that never reports blocks the queue"
  fi
done <<<"$added"

# --- Required checks deleted -------------------------------------------------
# Job display names ("name:" under a job, else the job id), one per line, with
# ${{ ... }} turned into a glob so "Integration Tests (${{ matrix.shard }}/3)"
# matches "Integration Tests (1/3)".
job_globs() {
  git show "$1" 2>/dev/null | awk -v q="'" '
    /^jobs:/ { in_jobs = 1; next }
    in_jobs && /^[^[:space:]#]/ { in_jobs = 0 }
    !in_jobs { next }
    /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { if (id != "") print (name != "" ? name : id); id = $1; sub(/:.*/, "", id); name = ""; next }
    /^    name:/ { name = $0; sub(/^    name:[[:space:]]*/, "", name); gsub("^[\"" q "]|[\"" q "][[:space:]]*$", "", name) }
    END { if (id != "") print (name != "" ? name : id) }
  ' | sed -E 's/[][*?\\]/\\&/g; s/\$\{\{[^}]*\}\}/*/g'
}
has_job() { # <ref:path> <check name>
  local g
  while IFS= read -r g; do
    # shellcheck disable=SC2053  # $g is a glob on purpose
    [ -n "$g" ] && [[ "$2" == $g ]] && return 0
  done < <(job_globs "$1")
  return 1
}

required=""
if git cat-file -e "$BASE:scripts/ci/required-checks.sh" 2>/dev/null; then
  required=$(git show "$BASE:scripts/ci/required-checks.sh" | awk '
    /^REQUIRED_CI=\(/ { arr = "ci"; next }
    /^REQUIRED_OTHER=\(/ { arr = "other"; next }
    arr && /^\)/ { arr = ""; next }
    arr && /"/ { match($0, /"[^"]*"/); v = substr($0, RSTART + 1, RLENGTH - 2)
                 print (arr == "ci" ? "ci.yml|" v : v) }
  ')
fi
while IFS='|' read -r wf name; do
  [ -n "$wf" ] || continue
  path=.github/workflows/$wf
  if has_job "$BASE:$path" "$name" && ! has_job "$HEAD:$path" "$name"; then
    add "$path" 0 "required check '$name' (scripts/ci/required-checks.sh) no longer has a job"
  fi
done <<<"$required"

# --- Report --------------------------------------------------------------------
(( ${#findings[@]} )) || { echo "gate-files-guard: no gate-weakening lines added"; exit 0; }

labels=${PR_LABELS-}
if [ -z "${PR_LABELS+x}" ] && [ -n "${PR_NUMBER:-}" ]; then
  labels=$(gh pr view "$PR_NUMBER" ${GITHUB_REPOSITORY:+-R "$GITHUB_REPOSITORY"} --json labels --jq '[.labels[].name] | join(",")')
fi
ok=""
[[ ",$labels," == *",$LABEL,"* ]] && ok=1
level=$([ -n "$ok" ] && echo warning || echo error)

for f in "${findings[@]}"; do
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    loc=${f%%: *}
    echo "::$level file=${loc%:*},line=${loc##*:}::$f"
  else
    echo "$f"
  fi
done
if [ -n "$ok" ]; then
  echo "gate-files-guard: ${#findings[@]} finding(s) allowed by the $LABEL label"
  exit 0
fi
echo "gate-files-guard: ${#findings[@]} finding(s). Fix them, or ask the lead for the $LABEL label if the change is intended."
exit 1
