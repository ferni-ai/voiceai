#!/bin/bash
# Ferni Website Design Linter
#
# The website token rules (no hardcoded colors in portal stylesheets, no local
# :root copies of generated tokens) live in the shared brand check:
# design-system/checks/website-css-tokens.js (Check 8 of `pnpm brand:check`).
#
# Usage: ./scripts/lint-design.sh   (or npm run lint:design)
set -e
cd "$(dirname "$0")/../../../.."
node design-system/check-brand.js
