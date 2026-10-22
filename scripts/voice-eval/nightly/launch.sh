#!/bin/bash
# launchd entry for the nightly sweep (com.ferni.nightly-sweep.plist). Runs only in the hour that
# is 07 UTC. Skips, with a board line, while ferni-prod is claimed (claims/ or an unreleased board
# CLAIM in the last 3 h: a prod deploy may be using this checkout) or the checkout has any change,
# untracked files included. Otherwise moves ~/Projects/voiceai to origin/main and runs the sweep.
# The braces make bash read the whole script before the checkout below can change this file.
{
  [ "$(date -u +%H)" = 07 ] || exit 0
  REPO=$HOME/Projects/voiceai COORD=$HOME/.claude/coordination
  skip() {
    printf '%s | nightly-sweep | NOTE | ferni-dev nightly %s: SKIPPED before start: %s, exit 3 | -\n' \
      "$(date -u +%FT%H:%MZ)" "$(date -u +%F)" "$1" >> "$COORD/board.md"
    exit 3
  }
  prod=$(python3 "$COORD/claim.py" status ferni-prod 2>&1) || skip "claim.py status failed"
  case $prod in *": free" | *EXPIRED*) ;; *) skip "ferni-prod is claimed" ;; esac
  last=$(grep -E '\| (CLAIM|RELEASE) \| ferni-prod' "$COORD/board.md" 2> /dev/null | tail -1)
  case $last in *"| CLAIM |"*) [[ ${last:0:17} < $(date -u -v-3H +%FT%H:%MZ) ]] || skip "ferni-prod CLAIM on the board" ;; esac
  cd "$REPO" || skip "no $REPO"
  [ -z "$(git status --porcelain)" ] || skip "$REPO has changes or untracked files"
  { git fetch -q origin main && git checkout -q --detach origin/main; } || skip "could not move $REPO to origin/main"
  exec "$REPO/scripts/voice-eval/nightly/run-nightly.sh"
}
