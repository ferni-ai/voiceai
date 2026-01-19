# CI/CD Architecture - Current State

This document describes the current CI/CD architecture after the 2026-01 optimization.

## Overview Diagram

```mermaid
flowchart TB
    subgraph Triggers
        push[Push to main/develop]
        pr[Pull Request]
        schedule[Schedule]
        manual[Manual Dispatch]
    end

    subgraph "CI Pipeline (ci.yml)"
        checkout[Checkout]
        setup[Setup Node + pnpm]

        subgraph "Parallel Jobs"
            lint[Lint & Type Check]
            unit[Unit Tests]
            integration[Integration Tests]
            agi[AGI Feature Tests]
            security[Security Scan]
            quality[Code Quality]
            gates[Quality Gates]
            validation[Validation]
            frontend[Frontend Quality]
            deps[Dependency Check]
        end

        build[Build]
        artifacts[Upload Artifacts]
    end

    subgraph "Deploy Pipeline"
        deploy_gce[Deploy to GCE]
        deploy_firebase[Deploy to Firebase]
        health[Health Check]
        promote[Promote Traffic]
    end

    push --> checkout
    pr --> checkout
    checkout --> setup
    setup --> lint & unit & integration & agi & security & quality & gates & validation & frontend & deps
    lint & unit & integration & agi --> build
    build --> artifacts
    artifacts --> deploy_gce & deploy_firebase
    deploy_gce --> health
    deploy_firebase --> health
    health --> promote
```

## Component Details

### Composite Action

```
.github/actions/setup-node-pnpm/action.yml
├── Setup pnpm (v10)
├── Setup Node.js (v20)
├── Fix local dependencies
└── Install dependencies
```

### Path Filters

```yaml
paths:
  - 'src/**'
  - 'apps/**'
  - 'packages/**'
  - 'design-system/**'
  - 'package.json'
  - 'pnpm-lock.yaml'
  - 'tsconfig*.json'
  - '.github/workflows/ci.yml'
  - '.github/actions/**'
```

### Concurrency Control

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## Workflow Relationships

```mermaid
flowchart LR
    subgraph "Primary Workflows"
        ci[ci.yml]
        deploy_prod[deploy-production.yml]
        deploy_gce[deploy-gce.yml]
    end

    subgraph "Quality Workflows"
        design[design-system.yml]
        chromatic[chromatic.yml]
        bth[bth-benchmarks.yml]
        lighthouse[lighthouse-ci.yml]
        security[security-scan.yml]
    end

    subgraph "Observability"
        metrics[ci-metrics.yml]
        uptime[uptime-monitor.yml]
        errors[error-alerting.yml]
    end

    subgraph "Reusable"
        reusable_design[reusable-design-system.yml]
        composite[setup-node-pnpm action]
    end

    ci --> composite
    deploy_prod --> composite
    deploy_prod --> reusable_design
    design --> composite
    chromatic --> composite
    metrics --> composite
```

## Runner Configuration

| Workflow | Runner | Reason |
|----------|--------|--------|
| ci.yml | self-hosted (GCE) | Fast, no queue |
| deploy-gce.yml | self-hosted (GCE) | Direct VM access |
| Others | ubuntu-latest | Simple, reliable |

## Secrets Used

| Secret | Workflows |
|--------|-----------|
| GITHUB_TOKEN | All |
| CODECOV_TOKEN | ci.yml |
| GCP_SA_KEY | deploy-*.yml |
| LIVEKIT_* | ci.yml, deploy-gce.yml |
| SLACK_WEBHOOK_URL | ci-metrics.yml, bth-benchmarks.yml |

## Optimization Summary

| Before | After | Improvement |
|--------|-------|-------------|
| No path filters | Path filters on all source | 70% fewer runs |
| No concurrency | Cancel in-progress | No pile-up |
| 11 independent installs | Composite action | DRY, consistent |
| pnpm v9/npm mix | pnpm v10 everywhere | No drift |
| 551 line ci.yml | 330 line ci.yml | 40% reduction |
