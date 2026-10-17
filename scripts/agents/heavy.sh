#!/bin/zsh
# Run a heavy check (tsc, vitest beyond 1–2 files, pre-commit, quality:arch)
# under a machine-wide lock with two slots, so parallel agents don't fill the
# disk. On 2026-10-15 several agents running tsc (about 3 GB each) and wide
# vitest pools at once took free disk from 27 GB to 0 within minutes.
#
#   scripts/agents/heavy.sh <label> <command...>
#   e.g. scripts/agents/heavy.sh memory zsh -c 'pnpm typecheck && sh .husky/pre-commit'
#
# It waits for a free slot (and for at least $HEAVY_MIN_FREE_GB of disk),
# writes an owner file, and releases only its own slot on exit. Never remove a
# lock directory by hand: a lock is busy while its owner process runs.
D=${HEAVY_LOCK_DIR:-${TMPDIR:-/tmp}/voiceai-heavy}
MIN=${HEAVY_MIN_FREE_GB:-8}
mkdir -p "$D"
label=$1; shift
me="$$:$label"
L=""
while [ -z "$L" ]; do
  free=$(df -g / | awk 'NR==2{print $4}')
  if [ "$free" -ge "$MIN" ]; then
    for s in slot1 slot2; do
      if mkdir "$D/$s" 2>/dev/null; then L="$D/$s"; break; fi
    done
  fi
  [ -z "$L" ] && sleep 10
done
print -r -- "$me $(date +%T)" > "$L/owner"
release() {
  [ -f "$L/owner" ] && [ "$(cut -d' ' -f1 "$L/owner")" = "$me" ] && rm -f "$L/owner" && rmdir "$L" 2>/dev/null
}
trap release EXIT INT TERM
"$@"
