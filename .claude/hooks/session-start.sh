#!/bin/bash
# Installs workspace dependencies so typecheck, lint and tests run in
# Claude Code cloud sessions. Local sessions are left alone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# The repo pins pnpm in package.json; corepack provides that exact version.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

# husky's prepare script needs a git repo and does nothing useful here.
export HUSKY=0

pnpm install --prefer-offline
