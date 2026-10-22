#!/usr/bin/env bash
echo "gh $*" >>"$FAKE_DIR/calls.log"
args="$*"
case "$1 $2" in
  "pr list") cat "$FAKE_DIR/prs.tsv"; exit 0 ;;
  "pr update-branch")
    var="FAKE_UPDATE_$3"
    case "${!var:-}" in
      conflict) echo "X Cannot update PR branch due to conflicts" >&2; exit 1 ;;
      error) echo "HTTP 502: Bad Gateway (https://api.github.com/graphql)" >&2; exit 1 ;;
      *) echo "✓ PR branch updated"; echo "$3" >>"$FAKE_DIR/updated.log"; exit 0 ;;
    esac ;;
  "issue list") exit 0 ;;
  "issue create")
    while [[ $# -gt 0 ]]; do
      [[ "$1" == "--body" ]] && printf '%s' "$2" >"$FAKE_DIR/issue-body.md"
      shift
    done
    echo "https://github.com/o/r/issues/1"; exit 0 ;;
esac
case "$args" in
  *branches/main*) printf 'Menu E2E\nUnit Tests\n' ;;
  *graphql*) ;;
  *actions/runs?head_sha=*) echo 0 ;;
  *check-runs*)
    sha=$(sed -E 's#.*commits/([^/]+)/check-runs.*#\1#' <<<"$args")
    var="FAKE_FAIL_CHECKS_$sha"
    [[ -n "${!var:-}" ]] && { echo "HTTP 500: Internal Server Error" >&2; exit 1; }
    echo "Unit Tests" ;;
  */statuses*) ;;
  *repos/o/r/commits/*) echo "2026-01-01T00:00:00Z" ;;
  # ci-health.sh: failed PR runs, then one failed job per run on its own branch.
  *workflows/ci.yml/runs?event=pull_request*)
    for i in $(seq 1 "$FAKE_RUNS"); do printf '%s\tfeat/%s-%s\n' "$i" "$i" "$FAKE_PAD"; done ;;
  *workflows/ci.yml/runs?branch=main*) echo 999999 ;;
  *actions/runs/999999/jobs*) printf 'success\tUnit Tests\n' ;;
  *actions/runs/*/jobs*)
    id=$(sed -E 's#.*actions/runs/([0-9]+)/jobs.*#\1#' <<<"$args")
    printf 'Unit Tests\tfeat/%s-%s\thttps://github.com/o/r/actions/runs/%s/job/%s\n' "$id" "$FAKE_PAD" "$id" "$id" ;;
  *) echo "fake gh: unhandled call: $args" >&2; exit 64 ;;
esac
