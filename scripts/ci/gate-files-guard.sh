#!/usr/bin/env bash
# =============================================================================
# GATE FILES GUARD
# =============================================================================
# A PR can weaken the gate that judges it. From July to September every test
# and build step in CI carried continue-on-error, so CI stayed green over 214
# failures. This fails a PR whose diff under .github/workflows/,
# .github/actions/ or scripts/ci/ switches a check off:
#
#   added   continue-on-error that isn't false; `set +e` / `+o errexit`;
#           passWithNoTests; `|| true`, `|| :`, `|| exit 0`, `|| echo` on a
#           line that runs a test/lint/build tool or a scripts/ci/ script;
#           `if: false`; `exit 0` as the last line of a run block; a paths
#           filter under pull_request or merge_group in a workflow the merge
#           queue runs
#   removed `set -e` from a script that no longer has it; a line running a
#           test/lint/typecheck tool or a scripts/ci/ script from a required
#           check's job; a `needs:` entry of a required check's job
#   changed a required check's job deleted or renamed, or its job-level `if:`
#           added or changed (a skipped required job reports success); the
#           guard's own step, or what runs before it or around it (below)
#
# Required checks come from the BASE copy of required-checks.sh, so dropping
# the entry too doesn't hide a deletion. Lines already on main never fail, and
# full-line comments are ignored. The threat is an honest agent "unblocking"
# its own PR, not an attacker: it reads text, not YAML semantics. CI runs the
# base branch's copy of this file, so a PR can't loosen the guard that judges it.
#
# Escape hatch: the label ci-gate-change-ok, added by a person (actor type
# User) after this CI run started; a later push needs it added again. The label
# is only as trustworthy as who holds write access: agents currently hold the
# owner's credentials, so the actor check can't tell the lead from an agent.
#
# Usage: gate-files-guard.sh <base-ref> <head-ref>
# Env:   PR_NUMBER, GITHUB_RUN_ID, GITHUB_REPOSITORY, GH_TOKEN (label check;
#        without them the label can't approve anything).
# Exit:  0 clean or approved | 1 findings | 2 usage
# =============================================================================
set -euo pipefail

BASE="${1:?usage: gate-files-guard.sh <base-ref> <head-ref>}"
HEAD="${2:?usage: gate-files-guard.sh <base-ref> <head-ref>}"
LABEL=ci-gate-change-ok
ROOTS=(.github/workflows .github/actions scripts/ci)
TOOLS='(^|[^[:alnum:]_.-])(pnpm|npm|npx|yarn|vitest|jest|tsc|eslint|playwright|cargo|pytest)([^[:alnum:]_-]|$)'
CI_SCRIPT='(^|[;&|(]|run:)[[:space:]]*(\./)?scripts/ci/|(^|[^[:alnum:]_.-])(bash|sh|node|tsx)[[:space:]]+(\./)?scripts/ci/'
CHECKS="$TOOLS|$CI_SCRIPT|ratchet|lint|typecheck|type-check|gate-files-guard"  # removal from a required job is flagged
# This file sits under scripts/ci, so it scans itself: the two names below are
# built so its own lines never match them.
COE=continue-on-error
PWNT=passWith""NoTests
# Any key spelling YAML accepts: quoted, or with a space before the colon.
coe_key="[\"']?${COE}[\"']?[[:space:]]*:[[:space:]]*([^#]*)"
if_false="^[[:space:]]*(-[[:space:]]+)?[\"']?if[\"']?[[:space:]]*:[[:space:]]*[\"']?(\\\$\\{\\{[[:space:]]*)?[Ff]alse([[:space:]]*\\}\\})?[\"']?[[:space:]]*(#.*)?$"

for ref in "$BASE" "$HEAD"; do
  git rev-parse -q --verify "$ref^{commit}" >/dev/null || { echo "gate-files-guard: cannot resolve $ref" >&2; exit 2; }
done

findings=() removed=()
add() { findings+=("$1:$2: $3"); }  # line 0: a file-level or main-side finding

# Attributes can hide a diff (`-diff`, `binary`, a textconv driver), so in-tree
# .gitattributes and the user's attributes file are ignored, and any
# .gitattributes change is read too (flagged below when it reaches the roots).
gitx=(git -c core.attributesFile=/dev/null)
empty=$(git hash-object -t tree /dev/null)
"${gitx[@]}" --attr-source="$empty" rev-parse HEAD >/dev/null 2>&1 && gitx+=(--attr-source="$empty")

# "<+|->\t<file>\t<line>\t<text>"; removed lines carry main's path and line.
changes=$("${gitx[@]}" diff -U0 -M --text --no-textconv --no-ext-diff --no-color "$BASE" "$HEAD" \
  -- "${ROOTS[@]}" .gitattributes '*/.gitattributes' | awk '
  /^diff --git / { hdr = 1; next }
  hdr && /^--- / { old = substr($0, 7); next }
  hdr && /^\+\+\+ / { new = substr($0, 7); next }
  /^@@ / { hdr = 0; split($2, o, ","); ol = substr(o[1], 2) + 0; split($3, h, ","); nl = substr(h[1], 2) + 0; next }
  hdr { next }
  /^-/ { print "-\t" old "\t" ol++ "\t" substr($0, 2); next }
  /^\+/ { print "+\t" new "\t" nl++ "\t" substr($0, 2) }
')

# Readers take a blob as `< <(show ...)`, never `show ... | grep -q`: a reader
# that stops early (grep -q, awk exit) kills git show with SIGPIPE once the file
# outgrows the pipe buffer, and pipefail turns that into a failed check. That
# dropped findings on the real 68 KB ci.yml and made up others.
show() { git show "$1" 2>/dev/null; }
trim() { sed -E 's/^[[:space:]]+|[[:space:]]+$//g'; }
indent() { local s=${1%%[! ]*}; echo ${#s}; }
# <line> is a top-level line of a `run: |` block and the block's last line.
ends_block() {
  awk -v n="$2" '
    function ind() { return match($0, /[^ ]/) - 1 }
    NR < n && /^[[:space:]]*(-[[:space:]]+)?run:[[:space:]]*[|>]/ { r = NR; bi = -1; next }
    NR < n && r && bi < 0 && NF { bi = ind() }
    NR == n { if (!r) exit 1; if (bi < 0) bi = ind(); if (ind() != bi) exit 1; next }
    NR > n && NF { exit !(ind() < bi) }
  ' < <(show "$HEAD:$1")
}
# The key a line sits under: nearest earlier line indented less.
parent_key() {
  awk -v n="$2" -v d="$3" 'NR < n && NF && $1 !~ /^#/ { m = match($0, /[^ ]/); if (m - 1 < d) k = $1 } END { print k }' \
    < <(show "$HEAD:$1")
}
errexit='(^|[;[:space:]])set[[:space:]]+(-[[:alpha:]]*e|-o[[:space:]]+errexit)'

while IFS=$'\t' read -r sign file line text; do
  [ -n "$sign" ] || continue
  [[ "$text" =~ ^[[:space:]]*# ]] && continue
  if [[ "$file" == .gitattributes || "$file" == */.gitattributes ]]; then
    # A pattern with no slash, or one under a scanned root, can reach CI files.
    pat=${text%%[[:space:]]*}; pat=${pat#/}; pat=${pat#"**/"}
    if [ "$sign" = + ] && [[ "$text" =~ (^|[[:space:]])(-diff|binary|diff=|-text|text=|merge=|filter=) ]] \
      && [[ "$pat" != */* || "$pat" == .github* || "$pat" == scripts* || "$pat" == "*"* ]]; then
      add "$file" "$line" "attribute on CI files can hide their diff from review and from this guard"
    fi
    continue
  fi
  yaml=""; [[ "$file" == .github/* ]] && yaml=1
  if [ "$sign" = - ]; then
    if [[ "$text" =~ $errexit ]] && show "$HEAD:$file" >/dev/null && ! grep -Eq "$errexit" < <(show "$HEAD:$file"); then
      add "$file" 0 "removed errexit (main's line $line): failures no longer stop the script"
    fi
    if [[ "$file" == .github/workflows/* && "$text" =~ $CHECKS && ! "$text" =~ ^[[:space:]]*(-[[:space:]]+)?name: ]]; then
      removed+=("$file|$line|$(trim <<<"$text")")
    fi
    continue
  fi
  if [[ "$text" =~ $coe_key ]]; then
    # Allowlist: only an explicit false passes (quotes and spaces stripped).
    v=$(tr -d "\"' " <<<"${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')
    # shellcheck disable=SC2016  # '${{false}}' is a GitHub expression, not a shell one
    case "$v" in
      false | '${{false}}') ;;
      *) add "$file" "$line" "$COE: $v can let a failing step pass" ;;
    esac
  fi
  if [[ "$text" =~ \|\|[[:space:]]*(true|:|exit[[:space:]]+0|echo)([^[:alnum:]_]|$) ]]; then
    s=${BASH_REMATCH[1]}
    [[ "$text" =~ $TOOLS || "$text" =~ $CI_SCRIPT ]] && add "$file" "$line" "'|| $s' swallows a test/lint/build failure"
  fi
  if [[ "$text" =~ (^|[^[:alnum:]_])set([[:space:]]+[-+][[:alpha:]]+)*[[:space:]]+(\+[[:alpha:]]*e[[:alpha:]]*|\+o[[:space:]]+errexit) ]]; then
    add "$file" "$line" "'set ${BASH_REMATCH[3]}' stops failures from failing the script"
  fi
  if [[ "$text" =~ pass[Ww]ith[Nn]o[Tt]ests|pass-with-no-test[s] ]]; then
    add "$file" "$line" "$PWNT lets a run that found no tests pass"
  fi
  [ -n "$yaml" ] || continue
  if [[ "$text" =~ $if_false ]]; then
    add "$file" "$line" "'if: false' switches the job or step off"
  fi
  if [[ "$text" =~ ^[[:space:]]*exit[[:space:]]+0[[:space:]]*$ ]] && ends_block "$file" "$line"; then
    add "$file" "$line" "'exit 0' ends the run block: the step passes whatever ran before"
  fi
  if [[ "$file" == .github/workflows/* && "$text" =~ ^[[:space:]]*(paths|paths-ignore): ]] \
    && [[ "$(parent_key "$file" "$line" "$(indent "$text")")" =~ ^(pull_request|merge_group): ]] \
    && grep -Eq '^[[:space:]]*merge_group:' < <(show "$HEAD:$file"); then
    add "$file" "$line" "path filter on a merge-queue workflow: a required check that never reports blocks the PR"
  fi
done <<<"$changes"

# --- Required checks ---------------------------------------------------------
# "<start>\t<end>\t<display name or id>\t,<needs>,\t<job-level if>\t<if line>"
# per job. The needs field is never empty: read collapses runs of tabs.
jobs_of() {
  awk -v q="'" '
    function out() { if (id != "") print start "\t" NR - 1 "\t" (name != "" ? name : id) "\t," nd ",\t" cond "\t" cl }
    function need(v) { sub(/[[:space:]]*#.*/, "", v); gsub("[][[:space:]\"" q "]", "", v); return v }
    /^jobs:/ { on = 1; next }
    on && /^[^[:space:]#]/ { out(); id = ""; on = 0 }
    !on { next }
    /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { out(); id = $1; start = NR; name = cond = cl = nd = ""; ln = 0; next }
    ln && /^    (  )?-/ { v = $0; sub(/^ *- */, "", v); v = need(v); nd = nd (nd == "" ? "" : ",") v; next }
    /^    [^[:space:]#]/ { ln = 0 }
    /^    needs:/ { v = $0; sub(/^    needs:/, "", v); nd = need(v); ln = (nd == "") }
    /^    name:/ { name = $0; sub(/^    name:[[:space:]]*/, "", name); gsub("^[\"" q "]|[\"" q "][[:space:]]*$", "", name) }
    /^    if:/ { cond = $0; sub(/^    if:[[:space:]]*/, "", cond); cl = NR }
    END { NR++; out() }
  ' < <(show "$1")
}
# The job (jobs_of row) whose name, with ${{ }} as a wildcard, matches <check>.
job_for() {
  local s e n d c l g
  while IFS=$'\t' read -r s e n d c l; do
    g=$(sed -E 's/[][*?\\]/\\&/g; s/\$\{\{[^}]*\}\}/*/g' <<<"$n")
    # shellcheck disable=SC2053  # $g is a glob on purpose
    [[ "$2" == $g ]] && { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$s" "$e" "$n" "$d" "$c" "$l"; return; }
  done < <(jobs_of "$1")
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
while IFS='|' read -r wf check; do
  [ -n "$wf" ] || continue
  path=.github/workflows/$wf
  IFS=$'\t' read -r bs be bn bd bc _ < <(job_for "$BASE:$path" "$check") || continue
  if ! IFS=$'\t' read -r hs he hn hd hc hl < <(job_for "$HEAD:$path" "$check"); then
    add "$path" 0 "required check '$check' (scripts/ci/required-checks.sh) no longer has a job"
    continue
  fi
  [ -n "$hc" ] && [ "$hc" != "$bc" ] && add "$path" "$hl" "job-level if: on required job '$hn' can skip it, and a skipped required job passes"
  # "Unit Tests" only sums up its shards: drop the need and it passes without them.
  IFS=, read -ra needs <<<"$bd"
  for nd in "${needs[@]}"; do
    [ -z "$nd" ] || [[ "$hd" == *",$nd,"* ]] || add "$path" 0 "required job '$hn' no longer needs '$nd'"
  done
  for r in "${removed[@]+"${removed[@]}"}"; do
    IFS='|' read -r rf rl rt <<<"$r"
    if [ "$rf" != "$path" ] || (( rl <= bs || rl > be )); then continue; fi
    # Moved within the same job is fine; anywhere else it no longer gates.
    grep -Fqx -- "$rt" < <(show "$HEAD:$path" | sed -n "${hs},${he}p" | trim) \
      || add "$path" 0 "removed '$rt' (main's line $rl) from required job '$bn'"
  done
done <<<"$required"

# --- The guard's own step ----------------------------------------------------
# Main's copy of this file runs, but the step in the PR's ci.yml decides
# whether and how. Any change to it, or its removal, needs the label.
guard_step() {
  awk '
    /^[[:space:]]*- name:[[:space:]]*Gate files guard[[:space:]]*$/ { on = 1; d = match($0, /-/); print; next }
    on && NF { if (match($0, /[^ ]/) <= d) exit; print }
  ' < <(show "$1") | trim
}
ci_yml=.github/workflows/ci.yml
if base_step=$(guard_step "$BASE:$ci_yml") && [ -n "$base_step" ]; then
  head_step=$(guard_step "$HEAD:$ci_yml")
  if [ -z "$head_step" ]; then
    add "$ci_yml" 0 "the 'Gate files guard' step is gone (or renamed) from ci.yml"
  elif [ "$head_step" != "$base_step" ]; then
    add "$ci_yml" 0 "the 'Gate files guard' step changed: main's version decides whether and how the guard runs"
  fi
fi

# --- What runs before or around the guard ------------------------------------
# The step can stay byte-identical while the job around it changes what it
# compares: a checkout of another ref makes HEAD^1 the PR's own commit, an
# earlier step can rewrite history, and a shell, an env var bash or git reads
# (BASH_ENV, PATH, GIT_*) or a defaults: working-directory reach every run step.
# Steps after the guard can't touch it, so they and the usual job keys pass.
guard_job() {  # "<job start> <job end> <guard step start> <job id>"
  awk '
    !NF || /^[[:space:]]*#/ { next }
    g && match($0, /[^ ]/) <= 3 { exit }
    !g && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { js = NR; id = $1; sub(/:$/, "", id) }
    !g && js && /^[[:space:]]*- name:[[:space:]]*Gate files guard[[:space:]]*$/ { g = NR }
    { last = NR }
    END { if (g) print js, last, g, id }
  ' < <(show "$1")
}
env_names='(BASH_ENV|ENV|BASH_FUNC_[^[:space:]:]*|SHELLOPTS|BASHOPTS|PATH|HOME|XDG_CONFIG_HOME|GIT_[A-Z_]*|LD_[A-Z_]*|DYLD_[A-Z_]*)'
if read -r js je gs gid < <(guard_job "$HEAD:$ci_yml"); then
  read -r _ _ _ bid < <(guard_job "$BASE:$ci_yml") || bid=$gid
  [ "$bid" = "$gid" ] || add "$ci_yml" "$gs" "the 'Gate files guard' step moved from job $bid to job $gid"
  while IFS=$'\t' read -r n why; do add "$ci_yml" "$n" "$why"; done < <(awk -v js="$js" -v je="$je" -v gs="$gs" \
    -v f="$ci_yml" -v envs="(^|[{,[:space:]])[\"']?${env_names}[\"']?[[:space:]]*:" '
    NR == FNR { if ($1 == "+" && $2 == f && $4 !~ /^[[:space:]]*#/) add[$3] = $4; next }
    !NF || /^[[:space:]]*#/ { next }
    { n = FNR; i = match($0, /[^ ]/) - 1; k = $0; sub(/^ */, "", k); sub(/:.*/, "", k) }
    i == 0 { top = k }
    i == 4 && n > js && n <= je { jk = k }
    !(n in add) { next }
    top == "defaults" { print n "\tdefaults: at workflow level sets the shell and directory of the gate files guard step too"; next }
    top == "env" && add[n] ~ envs { print n "\tworkflow env that bash or git reads reaches the gate files guard step"; next }
    n <= js || n > je { next }
    jk == "steps" && n < gs && add[n] ~ /^[[:space:]]*(ref|repository)[[:space:]]*:/ {
      print n "\ta checkout of another ref in the guard'"'"'s job: HEAD^1 is then not main, so it compares the wrong commits"; next }
    jk == "steps" && n < gs { print n "\ta step ahead of the gate files guard in its job runs first and can change what it compares"; next }
    jk != "steps" && jk !~ /^(name|runs-on|timeout-minutes|needs|if|permissions|concurrency|outputs|strategy)$/ {
      print n "\t" jk ": on the job that runs the gate files guard can change its shell, env or container" }
  ' FS='\t' <(printf '%s\n' "$changes") FS=' ' <(show "$HEAD:$ci_yml"))
fi

# --- Report --------------------------------------------------------------------
mapfile -t findings < <(printf '%s\n' "${findings[@]+"${findings[@]}"}" | awk 'NF && !seen[$0]++')
(( ${#findings[@]} )) || { echo "gate-files-guard: nothing that switches a gate off"; exit 0; }

# The last labeled/unlabeled event for the label must be a person adding it
# after this CI run was created. The run's created_at is GitHub's clock (the
# push or open that started it) and survives re-runs; a commit's own dates are
# whatever its author set. Anything unreadable counts as not approved.
approved() {
  [ -n "${PR_NUMBER:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] || return 1
  local since
  since=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" | jq -er '.created_at | fromdateiso8601') || return 1
  gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/events" --paginate \
    | jq -se --arg l "$LABEL" --argjson since "$since" '
        [add | .[] | select((.event == "labeled" or .event == "unlabeled") and .label.name == $l)] | last
        | . != null and .event == "labeled" and .actor.type == "User"
          and (.created_at | fromdateiso8601) > $since' >/dev/null
}
ok=""; approved && ok=1
level=$([ -n "$ok" ] && echo warning || echo error)

for f in "${findings[@]}"; do
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    loc=${f%%: *}; n=${loc##*:}
    echo "::$level file=${loc%:*}$([ "$n" = 0 ] || echo ",line=$n")::$f"
  else
    echo "$f"
  fi
done
if [ -n "$ok" ]; then
  echo "gate-files-guard: ${#findings[@]} finding(s) approved by the $LABEL label"
  exit 0
fi
echo "gate-files-guard: ${#findings[@]} finding(s). Fix them, or ask the lead for the $LABEL label" \
  "(added by a person after your last push) if the change is intended."
exit 1
