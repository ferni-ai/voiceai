# shellcheck shell=bash
# Sourced by run-nightly.sh, and alone by its tests (no network). The caller defines log().
#
# 2026-10-29: one ListAgents timeout, before anything was built or uploaded, cost the whole
# night. A deploy that dies on the network that early is retried once; anything later is not.

# A Go transport error from lk's request (the 10-29 one ended "read: operation timed out").
DEPLOY_TRANSIENT_RE='operation timed out|i/o timeout|connection reset|TLS handshake timeout|no such host|unexpected EOF|: EOF$'
# The deploy got past agent selection: it started (server side), built, or failed for real.
DEPLOY_STARTED_RE='This deploy continues|Starting build|[Uu]ploading|^#[0-9]+ |error TS[0-9]{4}|ERROR:|[Bb]uild failed|unable to deploy agent'

# deploy_log_is_transient LOG: 0 when the deploy failed on the network before it started, else 1.
deploy_log_is_transient() {
  [ -s "$1" ] && grep -qE "$DEPLOY_TRANSIENT_RE" "$1" && ! grep -qE "$DEPLOY_STARTED_RE" "$1" && return 0
  return 1
}

# deploy_with_retry LOG PAUSE_S CMD...: CMD into LOG; once more after PAUSE_S when the first
# attempt's log is transient. Both attempts stay in LOG, split by a separator line.
deploy_with_retry() {
  local dlog=$1 pause=$2; shift 2
  "$@" > "$dlog" 2>&1
  deploy_log_is_transient "$dlog" || return 0
  log "deploy: network error before the build started; retrying once in ${pause}s"
  sleep "$pause"
  printf '\n----- retry after a network error before the build -----\n' >> "$dlog"
  "$@" >> "$dlog" 2>&1
}
