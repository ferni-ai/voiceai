# Target State CI/CD Architecture

> **Version**: 1.0
> **Date**: 2026-01-24
> **Status**: Approved

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PR OPENED / UPDATED                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FAST PR GATE (~6 min)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │  setup   │─▶│   lint   │  │test-unit │  │ security │  (parallel)         │
│  │  cache   │  │typecheck │  │          │  │          │                     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                     │
│        │              │            │             │                           │
│        └──────────────┴────────────┴─────────────┘                           │
│                              │                                               │
│                       ┌──────▼──────┐                                        │
│                       │quality-gates│ (blocking)                             │
│                       └─────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │  PR GATE PASS?  │
                              └────────┬────────┘
                                  YES  │  NO → Block merge
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STAGING PREVIEW (~8 min)                                │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │  Build → Upload artifact → Deploy preview → Post PR comment       │      │
│  └───────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │   MERGE TO MAIN │
                              └────────┬────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MAIN BUILD (~10 min)                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │PR gate   │  │ test-    │  │test-agi  │  │   build  │                     │
│  │(cached)  │  │integration│  │features  │  │(artifact)│                     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                     │
│                              │                                               │
│                       ┌──────▼──────┐                                        │
│                       │e2e-validate │ (non-blocking)                         │
│                       └─────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │  MAIN PASSES?   │
                              └────────┬────────┘
                                  YES  │  NO → Alert, no deploy
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  PRODUCTION DEPLOY (~12 min)                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Download artifact → Deploy (blue) → Health check → Shift traffic    │   │
│  │         │                                   │                         │   │
│  │         │                           FAIL? → Auto-rollback             │   │
│  │         │                                   │                         │   │
│  │         └───────────────────────────────────┘                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │  NIGHTLY (3 AM) │
                              └────────┬────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   DEEP VALIDATION (~45 min)                                  │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │  Full tests │ BTH benchmarks │ Security scan │ Platform builds    │      │
│  │  (all 1100) │ (capability)   │ (deep)        │ (iOS, Electron)    │      │
│  └───────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PR Gate Contract

### Triggers

```yaml
on:
  pull_request:
    branches: [main, develop]
    paths:
      - 'src/**'
      - 'apps/**'
      - 'packages/**'
      - 'design-system/**'
      - '*.json'
      - '*.yaml'
      - '.github/**'
```

### Jobs (All Parallel After Setup)

| Job | Duration | Blocking | Outputs |
|-----|----------|----------|---------|
| setup | 1 min | - | cache-key |
| lint | 2 min | Yes | - |
| test-unit | 2 min | Yes | coverage |
| security | 1 min | Yes | - |
| quality-gates | 1 min | Yes | - |

### Success Criteria

- All jobs pass
- Coverage >= 60%
- No high/critical vulnerabilities
- Quality thresholds met

### Failure Behavior

- Block merge
- Post PR comment with failure details
- Emit CI summary artifact (JSON)

---

## Main Build Contract

### Triggers

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'apps/**'
      - 'packages/**'
      - 'design-system/**'
```

### Additional Jobs (Beyond PR Gate)

| Job | Duration | Blocking | Purpose |
|-----|----------|----------|---------|
| test-integration | 3 min | Yes | External service tests |
| test-agi-features | 2 min | Yes | AI capability tests |
| build | 3 min | Yes | Production build |
| e2e-validation | 5 min | No | Tool/API coverage |

### Artifact Outputs

| Artifact | Contents | Retention |
|----------|----------|-----------|
| dist-{sha} | Backend build | 7 days |
| web-dist-{sha} | Frontend build | 7 days |
| ci-summary-{sha} | JSON metrics | 30 days |
| coverage-{sha} | LCOV report | 30 days |

---

## Staging Deploy Contract

### Triggers

```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
```

### Prerequisites

- PR gate workflow completed successfully
- No merge conflicts

### Behavior

1. Download build artifacts (if available) OR build fresh
2. Deploy to unique preview URL: `pr-{number}.staging.ferni.ai`
3. Run smoke tests against preview
4. Post PR comment with preview URL

### Cleanup

- Delete preview environment when PR is closed/merged

---

## Production Deploy Contract

### Triggers

```yaml
on:
  push:
    branches: [main]
```

### Prerequisites

- Main build workflow completed successfully

### Blue-Green Deployment Steps

1. Download build artifacts
2. Deploy to inactive slot (blue/green)
3. Run health check (`/health` endpoint)
4. If pass: shift 100% traffic
5. If fail: delete new deployment, keep old
6. Monitor error rate for 5 minutes
7. If spike detected: alert Slack

### Rollback

- Manual: `gh workflow run rollback.yml`
- Auto: On health check failure
- Target: < 5 minutes to rollback

---

## Nightly Validation Contract

### Triggers

```yaml
on:
  schedule:
    - cron: '0 3 * * *'  # 3 AM UTC daily
```

### Jobs

| Job | Duration | Purpose |
|-----|----------|---------|
| full-test-suite | 15 min | All 1,100 tests |
| bth-benchmarks | 10 min | Capability regression |
| security-deep | 5 min | Full dependency audit |
| lighthouse | 5 min | Performance/a11y |
| build-ios | 15 min | iOS build verification |
| build-electron | 10 min | Desktop build verification |
| build-rust | 5 min | Rust native modules |

### Failure Behavior

- Alert Slack `#ci-alerts` channel
- Create GitHub issue if repeated failure
- Do NOT block production deploys

---

## Caching Strategy

### Cache Hierarchy

```
Level 1: GitHub Actions Cache (fast, 10GB limit)
├── node_modules (key: pnpm-lock hash)
├── pnpm store (automatic)
├── Rust target (key: Cargo.lock + rust version)
└── ONNX models (key: version manifest)

Level 2: Artifacts (build outputs)
├── dist-{sha} (backend build)
├── web-dist-{sha} (frontend build)
└── design-system-{sha} (tokens)

Level 3 (Future): Turborepo Remote Cache
└── All build outputs with content-hash keys
```

### Cache Keys

| Cache | Key Pattern | Restore Keys |
|-------|-------------|--------------|
| node_modules | `node-modules-{pnpm-lock-hash}` | `node-modules-` |
| Rust target | `rust-{Cargo.lock-hash}-{rust-version}` | `rust-` |
| Build output | `dist-{src-hash}` | None (exact match) |

---

## Agent-First Ergonomics

### CI Summary Artifact

Every workflow uploads a `ci-summary.json`:

```json
{
  "workflow": "ci",
  "sha": "abc123",
  "status": "success",
  "duration_seconds": 420,
  "jobs": [
    {"name": "lint", "status": "success", "duration": 120},
    {"name": "test-unit", "status": "success", "duration": 90, "coverage": 72}
  ],
  "failures": [],
  "warnings": ["e2e coverage below 80%"],
  "next_steps": []
}
```

### Structured Error Messages

```
❌ TypeScript Error
   File: src/tools/habit-coaching/index.ts:42
   Error: Type 'string' is not assignable to type 'number'
   Fix: Change the return type or cast appropriately
   Docs: https://ferni.ai/docs/typescript-errors
```

### Agent Retry Logic

```yaml
# Flaky test handling
- name: Run tests
  run: pnpm test:unit
  continue-on-error: true
  id: test1

- name: Retry on flake
  if: steps.test1.outcome == 'failure'
  run: pnpm test:unit --retry=1
```

---

## Workflow Consolidation

### Before (36 workflows)

```
ci.yml, staging.yml, deploy-production.yml, deploy-gce.yml,
deploy-firebase.yml, deploy-worker.yml, design-system.yml,
chromatic.yml, token-check.yml, ... (36 total)
```

### After (Target: ~20 workflows)

| Workflow | Purpose | Replaces |
|----------|---------|----------|
| ci.yml | Fast PR gate | (enhanced) |
| ci-main.yml | Main branch build | (new) |
| staging.yml | Preview deploys | (enhanced) |
| deploy-production.yml | Production | (enhanced) |
| design-system.yml | Tokens | (keep) |
| nightly.yml | Deep validation | bth-benchmarks, lighthouse, build-apps |
| security.yml | Security scans | security-scan |
| metrics.yml | CI observability | ci-metrics, devops-dashboard |

### Merge Candidates

| Merge Into | Absorb |
|------------|--------|
| nightly.yml | bth-benchmarks, lighthouse-ci, build-apps |
| metrics.yml | ci-metrics, devops-dashboard |
| security.yml | security-scan, cost-alerts |

---

## Observability

### Dashboards

| Dashboard | Metrics | Location |
|-----------|---------|----------|
| CI Health | Duration, pass rate, flake rate | Grafana |
| Cost | Minutes by workflow, budget % | Grafana |
| Agent Success | Agent vs human pass rates | Grafana |

### Alerts

| Alert | Threshold | Channel |
|-------|-----------|---------|
| Budget 80% | 2,400 min consumed | Slack #ci-alerts |
| Flake spike | >5% flake rate | Slack #ci-alerts |
| Main build fail | Any failure | Slack #ci-alerts |
| Deploy health fail | Health check timeout | Slack #ops-alerts |

### Metrics Collection

```yaml
# ci-summary artifact for every run
- name: Generate CI summary
  run: |
    echo '{"status":"${{ job.status }}", "duration": ...}' > ci-summary.json

- uses: actions/upload-artifact@v4
  with:
    name: ci-summary-${{ github.sha }}
    path: ci-summary.json
```

---

## Migration Path

| Phase | Changes | Timeline |
|-------|---------|----------|
| 1. Quick Wins | Concurrency, path filters | Week 1 |
| 2. Standardize | Composite action everywhere | Week 2 |
| 3. Consolidate | Merge workflows | Week 3-4 |
| 4. Optimize | Turborepo POC | Month 2 |
| 5. Mature | Full observability | Month 3 |

---

*This target state is reachable incrementally without breaking existing CI.*
