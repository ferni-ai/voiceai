# Multi-Lens CI Review

This document provides a comprehensive review of the CI/CD system from multiple perspectives.

## Lens A: GitHub Actions Correctness

### Action Pinning

| Status | Action | Current | Recommendation |
|--------|--------|---------|----------------|
| ✅ | actions/checkout | @v4 | Latest major |
| ✅ | actions/setup-node | @v4 | Latest major |
| ✅ | pnpm/action-setup | @v4 | Latest major |
| ✅ | actions/upload-artifact | @v6 | Latest major |
| ⚠️ | trufflesecurity/trufflehog | @main | Pin to specific version |
| ⚠️ | chromaui/action | @latest | Pin to specific version |

### Permissions

| Workflow | Permissions | Assessment |
|----------|-------------|------------|
| ci.yml | Default (read) | ✅ Appropriate |
| security-scan.yml | contents: read, security-events: write | ✅ Minimal required |
| ci-metrics.yml | actions: read, contents: read | ✅ Minimal required |

### Secret Usage

| Secret | Used In | Secure |
|--------|---------|--------|
| CODECOV_TOKEN | ci.yml | ✅ |
| CHROMATIC_PROJECT_TOKEN | chromatic.yml | ✅ |
| NPM_TOKEN | design-system.yml | ✅ |
| SLACK_WEBHOOK_URL | Multiple | ✅ |

## Lens B: Monorepo Efficiency

### Path Filters

| Workflow | Has Path Filters | Coverage |
|----------|------------------|----------|
| ci.yml | ✅ | src, apps, packages, design-system, configs |
| design-system.yml | ✅ | design-system, packages/ferni-react |
| chromatic.yml | ✅ | design-system, packages/ferni-react |
| bth-benchmarks.yml | ✅ | BTH-related paths |
| lighthouse-ci.yml | ✅ | promo/* |
| security-scan.yml | ✅ | Code files, package.json |

### Affected Build Strategy

Currently: All-or-nothing builds

Recommendation: Consider Nx or custom affected detection for:
- `apps/web` - Only when web code changes
- `design-system` - Only when design tokens change
- `packages/*` - Only when package code changes

### Dependency Caching

| Workflow | Cache Strategy |
|----------|----------------|
| ci.yml | pnpm cache via setup-node |
| design-system.yml | pnpm cache via setup-node |
| All others | pnpm cache via composite action |

## Lens C: AI-Platform Awareness

### LLM Test Gating

| Test Type | Gating | Cost Control |
|-----------|--------|--------------|
| Unit tests | ✅ Required for merge | No LLM calls |
| Integration tests | ✅ Required for merge | Mock LLM responses |
| AGI feature tests | ✅ Required for merge | Synthetic data |
| BTH benchmarks | ⚠️ Weekly only | Real LLM calls |

### Voice Agent Tests

| Test | Runs On | Notes |
|------|---------|-------|
| Voice quality | Manual | Requires LiveKit |
| TTS validation | CI | Mocked responses |
| STT accuracy | Manual | Requires audio samples |

## Lens D: Security

### Code Scanning

| Tool | Coverage | Frequency |
|------|----------|-----------|
| CodeQL | JavaScript/TypeScript | Daily + PRs |
| Gitleaks | Secrets | Daily + PRs |
| pnpm audit | Dependencies | Daily + PRs |
| TruffleHog | Secrets | CI runs |

### Dependency Updates

| Strategy | Implementation |
|----------|----------------|
| Automated PRs | Dependabot (configured) |
| Audit on PR | security-scan.yml |
| Breaking change detection | Manual review |

### Token/Secret Rotation

| Secret | Rotation Policy | Last Rotated |
|--------|-----------------|--------------|
| GITHUB_TOKEN | Automatic | N/A |
| GCP_SA_KEY | Manual, 90 days | Check Secret Manager |
| NPM_TOKEN | Manual, annual | Check 1Password |

## Lens E: Developer Experience

### PR Gate Speed

| Gate | Current Time | Target |
|------|--------------|--------|
| Lint + Type check | ~2 min | < 3 min |
| Unit tests | ~3 min | < 5 min |
| Integration tests | ~5 min | < 10 min |
| **Total PR gate** | **~10 min** | **< 15 min** |

### Feedback Quality

| Metric | Current | Improvement |
|--------|---------|-------------|
| Error messages | Good | Add links to docs |
| PR comments | Lighthouse, Chromatic | Add coverage comments |
| Status checks | All pass/fail | Add partial success |

### Local Development Parity

```bash
# Replicate CI locally
pnpm quality       # Same as CI quality gates
pnpm test          # Same as CI unit tests
pnpm build         # Same as CI build

# Verify before push
pnpm pre-commit    # Run pre-commit checks
```

## Recommendations Summary

### High Priority

1. Pin `trufflesecurity/trufflehog` to specific version
2. Add coverage comments to PRs
3. Implement affected detection for faster PR feedback

### Medium Priority

1. Add PR comment with Lighthouse scores
2. Consolidate quality workflows
3. Add local CI verification script

### Low Priority

1. Evaluate Nx for monorepo tooling
2. Add visual diff to PR comments
3. Implement PR size analysis
