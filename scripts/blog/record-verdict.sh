#!/usr/bin/env bash
# Runs a blog check (check-post.ts or judge-post.ts) for blog-drafts.yml, keeps
# its output in LOG for the job summary, and records its verdict as the step
# output `verdict`: pass (exit 0), rejected (exit 3, REJECTED in exit-codes.ts)
# or error (anything else, a crash included). Exits with the check's own code.
#
#   bash scripts/blog/record-verdict.sh LOG command [args...]
set -uo pipefail
log=$1
shift
rc=0
"$@" > "$log" 2>&1 || rc=$?
cat "$log"
case $rc in
  0) verdict=pass ;;
  3) verdict=rejected ;;
  *) verdict=error ;;
esac
echo "verdict=$verdict" >> "${GITHUB_OUTPUT:?}"
exit "$rc"
