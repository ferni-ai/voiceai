#!/bin/bash

# Create GitHub issues for CI/CD backlog items
# Run with: ./scripts/devops/create_backlog_issues.sh
# Requires: gh CLI authenticated

set -e

echo "Creating CI/CD backlog issues..."

# P1 Issues (remaining)
gh issue create \
  --title "[P1] Add shared node_modules cache across ci.yml jobs" \
  --label "ci,devops,P1" \
  --body "## Problem
Each job in ci.yml does independent pnpm install, wasting time.

## Solution
Use actions/cache/save in a setup job and actions/cache/restore in dependent jobs.

## Expected Impact
- 5-10 min savings per CI run
- Better cache hit rates

## Implementation
See docs/architecture/ci-deployment-target.md for target architecture."

gh issue create \
  --title "[P1] Migrate remaining workflows to composite action" \
  --label "ci,devops,P1" \
  --body "## Problem
Some workflows still have inline pnpm setup instead of using the composite action.

## Files to Update
- design-system.yml
- chromatic.yml
- bth-benchmarks.yml

## Expected Impact
- 2-3 min savings per workflow
- Consistent setup behavior

## Implementation
Replace inline setup steps with:
\`\`\`yaml
- uses: ./.github/actions/setup-node-pnpm
\`\`\`"

gh issue create \
  --title "[P1] Add concurrency control to design-system.yml" \
  --label "ci,devops,P1" \
  --body "## Problem
Multiple design system builds can run in parallel, wasting resources.

## Solution
Add concurrency control:
\`\`\`yaml
concurrency:
  group: design-system-\${{ github.ref }}
  cancel-in-progress: true
\`\`\`

## Expected Impact
- Prevent duplicate builds
- Faster feedback on rapid pushes"

gh issue create \
  --title "[P1] Conditional macOS builds" \
  --label "ci,devops,P1" \
  --body "## Problem
macOS builds run on every push, but are expensive and only needed for releases.

## Solution
Add condition to only run on release tags:
\`\`\`yaml
if: startsWith(github.ref, 'refs/tags/v')
\`\`\`

## Expected Impact
- Save \$1-2 per unnecessary build
- Faster CI for non-release pushes"

# P2 Issues
gh issue create \
  --title "[P2] Add PR coverage comments" \
  --label "ci,devops,P2" \
  --body "## Problem
Coverage information is not visible on PRs.

## Solution
Enable codecov PR comments or use a custom action.

## Expected Impact
- Better developer feedback
- Catch coverage regressions early"

gh issue create \
  --title "[P2] Add Lighthouse scores to PR comments" \
  --label "ci,devops,P2" \
  --body "## Problem
Lighthouse scores are only visible in workflow run.

## Solution
Add step to post scores as PR comment.

## Expected Impact
- Better visibility of performance impact
- Catch accessibility regressions"

gh issue create \
  --title "[P2] Pin floating action versions" \
  --label "ci,devops,P2,security" \
  --body "## Problem
Some actions use floating versions like @main or @latest:
- trufflesecurity/trufflehog@main
- chromaui/action@latest

## Solution
Pin to specific commit SHA or version tag.

## Expected Impact
- More reproducible builds
- Protection from supply chain attacks"

# P3 Issues
gh issue create \
  --title "[P3] Evaluate Nx for monorepo tooling" \
  --label "ci,devops,P3,enhancement" \
  --body "## Context
Consider adopting Nx for:
- Affected-only testing
- Distributed caching
- Better dependency graph

## Decision
See docs/monorepo/nx-evaluation.md

## Trigger
Re-evaluate when:
- Package count > 15
- CI time consistently > 20 min"

echo "Done! Created backlog issues."
