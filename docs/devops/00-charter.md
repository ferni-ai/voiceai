# CI/CD Charter - Ferni AI Monorepo

> **Mission**: Agent-first, cost-efficient, developer-friendly CI/CD that scales with the monorepo.

## Core Principles

| Principle | What It Means |
|-----------|---------------|
| **Agent-First** | CI must be predictable enough for AI agents to verify changes without human babysitting |
| **Fast PR Gate** | < 10 min feedback loop on PRs; fail fast, succeed quickly |
| **Affected-Only** | Don't rebuild/retest unchanged code (path filters, caching, semantic detection) |
| **Rollback-Ready** | Every deploy can be reverted within 5 minutes |
| **Observable** | Minutes, costs, flake rates are tracked and visible |

## Definition of "Green"

A change is **green** when:

| Gate | Command | Threshold |
|------|---------|-----------|
| TypeScript | `pnpm typecheck` | 0 errors |
| Lint | `pnpm lint` | 0 errors |
| Unit Tests | `pnpm test:unit` | All pass, 60% coverage |
| Integration Tests | `pnpm test:integration` | All pass |
| Quality Gates | `pnpm ci:quality-gates` | Thresholds met |
| Security | `pnpm audit` | No high/critical |

## Canonical Build/Test Commands

### TypeScript Backend

```bash
pnpm quality          # Pre-commit: typecheck + lint + test
pnpm build:fast       # esbuild (~0.9s for 1400 files)
pnpm build            # Full tsc build (slower, type-checking)
pnpm typecheck        # TypeScript only
pnpm test             # All tests
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests (needs env vars)
```

### Frontend (apps/web)

```bash
cd apps/web
pnpm typecheck        # TypeScript
pnpm lint             # ESLint + design token validation
pnpm lint:tokens      # Design token drift check
pnpm build            # Vite production build
pnpm audit:ui         # UI accessibility audit
```

### Design System

```bash
pnpm tokens:sync      # Build & sync all tokens
pnpm tokens:check     # Validate no drift
pnpm build:design-system
```

### Rust (apps/rust-audio, apps/rust-perf)

```bash
cd apps/rust-audio
cargo build --release
cargo test
```

### Mobile (iOS)

```bash
cd apps/ios-native
xcodebuild -scheme Ferni -sdk iphonesimulator
```

## Agent Rules for CI

### Before Committing

```bash
# REQUIRED: Run quality checks
pnpm quality

# If editing design tokens
pnpm tokens:sync && pnpm tokens:check

# If editing frontend
cd apps/web && pnpm lint:tokens
```

### Interpreting CI Failures

| Failure Type | Agent Action |
|--------------|--------------|
| TypeScript error | Fix the type error, don't use `as any` |
| Lint error | Run `pnpm lint:fix`, review changes |
| Test failure | Read test output, fix logic or update test |
| Quality gate | Check threshold violation, reduce debt |
| Security | Review vulnerability, update or accept |
| Flaky test | Re-run once; if still fails, fix or quarantine |

### CI Artifacts to Check

| Artifact | Where | Use |
|----------|-------|-----|
| Coverage | Codecov PR comment | Ensure no regression |
| E2E report | `e2e-validation-report` artifact | Tool/command coverage |
| Build size | `build:check` output | Ensure no bloat |

## Pipeline Layers

| Layer | Trigger | Duration Target | Purpose |
|-------|---------|-----------------|---------|
| **PR Gate** | PR open/update | < 10 min | Fast feedback, blocking |
| **Main Build** | Push to main | < 15 min | Full validation |
| **Staging Deploy** | PR to main | < 12 min | Preview environment |
| **Production Deploy** | Push to main | < 20 min | Blue-green deploy |
| **Nightly** | Scheduled | < 60 min | Deep validation, security |

## Cost Budget

| Metric | Target |
|--------|--------|
| Monthly GitHub Actions minutes | < 3,000 |
| Average PR gate duration | < 10 min |
| Cache hit rate | > 80% |

## Workflow Ownership

| Workflow | Owner | Purpose |
|----------|-------|---------|
| `ci.yml` | Platform | Main CI pipeline |
| `deploy-*.yml` | Platform | Production/staging deploys |
| `design-system.yml` | Frontend | Token validation |
| `*-scan.yml`, `*-monitor.yml` | SRE | Security, observability |

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-24 | Initial charter created | DevOps Redesign |

---

*This charter is the single source of truth for CI/CD conventions. Update it when patterns change.*
