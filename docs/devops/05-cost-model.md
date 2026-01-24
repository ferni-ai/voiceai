# CI/CD Cost Model

> **Date**: 2026-01-24
> **Budget**: 3,000 GitHub Actions minutes/month

---

## Current State Cost Breakdown

### Monthly Minute Consumption

| Workflow | Runs/Month | Min/Run | Total Min | % Budget | Runner |
|----------|------------|---------|-----------|----------|--------|
| ci.yml | 60 | 10 | 600 | 20% | self-hosted |
| staging.yml | 80 | 12 | 960 | 32% | ubuntu-latest |
| deploy-production.yml | 30 | 15 | 450 | 15% | ubuntu-latest |
| e2e-tests.yml | 40 | 15 | 600 | 20% | ubuntu-latest |
| build-apps.yml | 10 | 20 | 200 | 7% | macos-latest |
| Other (25 workflows) | 100 | 2 | 200 | 6% | ubuntu-latest |
| **Total** | **320** | - | **3,010** | **100%** | - |

### Cost by Runner Type

| Runner | Multiplier | Minutes | Effective Cost |
|--------|------------|---------|----------------|
| ubuntu-latest | 1x | 2,410 | 2,410 min |
| macos-latest | 10x | 200 | 2,000 min equivalent |
| self-hosted | 0x | 600 | $0 (fixed VM cost) |

**Self-hosted saves ~600 min/month** = 20% of budget

---

## Target State Cost Model

### Optimizations

| Optimization | Minutes Saved | % Reduction |
|--------------|---------------|-------------|
| Add concurrency to staging.yml | 200 | 7% |
| Add path filters to staging.yml | 300 | 10% |
| Move integration tests to main-only | 150 | 5% |
| Consolidate nightly workflows | 100 | 3% |
| Restrict build-apps.yml to releases | 150 | 5% |
| **Total Savings** | **900** | **30%** |

### Projected Monthly Consumption

| Workflow | Current | Target | Savings |
|----------|---------|--------|---------|
| ci.yml | 600 | 600 | 0 (already optimized) |
| staging.yml | 960 | 500 | 460 |
| deploy-production.yml | 450 | 400 | 50 |
| e2e-tests.yml | 600 | 400 | 200 |
| nightly.yml (new) | 0 | 300 | -300 (new) |
| build-apps.yml | 200 | 50 | 150 |
| Other | 200 | 150 | 50 |
| **Total** | **3,010** | **2,400** | **610** |

### Budget Utilization

| Metric | Current | Target | Change |
|--------|---------|--------|--------|
| Monthly minutes | 3,010 | 2,400 | -20% |
| Budget utilization | 100% | 80% | -20% |
| Buffer for growth | 0 | 600 min | +600 |

---

## Cost Drivers Analysis

### High-Cost Workflows

| Workflow | Cost Driver | Mitigation |
|----------|-------------|------------|
| staging.yml | Runs on ALL PRs | Add path filters |
| e2e-tests.yml | Long duration (15 min) | Parallelize, cache |
| build-apps.yml | macOS runner (10x) | Restrict to tags |
| deploy-production | Sequential steps | Parallelize where safe |

### Runner Economics

| Runner | Cost/Min | Best For |
|--------|----------|----------|
| ubuntu-latest | $0.008 | Most jobs |
| ubuntu-large | $0.016 | Memory-intensive |
| macos-latest | $0.08 | iOS builds only |
| self-hosted | ~$0.002 | High-frequency jobs |

**Recommendation**: Migrate more jobs to self-hosted runner.

---

## ROI Analysis

### Self-Hosted Runner Expansion

| Scenario | GitHub Cost | Self-Hosted Cost | Savings |
|----------|-------------|------------------|---------|
| Current (1 runner) | $16/month | $25/month | -$9 |
| All ci.yml jobs | $0/month | $25/month | +$16 |
| + staging.yml | $0/month | $25/month | +$24 |
| + e2e-tests.yml | $0/month | $25/month | +$29 |

**Break-even**: Self-hosted pays off when running >3,125 min/month on it.

### Turborepo Remote Cache ROI

| Metric | Without | With | Improvement |
|--------|---------|------|-------------|
| Build time | 3 min | 30 sec | 83% |
| Daily builds | 30 | 30 | - |
| Monthly minutes | 2,700 | 450 | 83% |
| Turborepo cost | $0 | $10/month | - |
| **Net savings** | - | ~$10/month | Positive ROI |

---

## Budget Alerting Thresholds

| Threshold | Trigger | Action |
|-----------|---------|--------|
| 50% (1,500 min) | Day 15 | Info alert |
| 80% (2,400 min) | Any time | Warning alert |
| 90% (2,700 min) | Any time | Critical alert |
| 100% (3,000 min) | Any time | Page on-call |

### Alert Implementation

```yaml
# ci-metrics.yml
- name: Check budget
  run: |
    USED=$(gh api /repos/{owner}/{repo}/actions/billing | jq '.minutes_used')
    if [ $USED -gt 2400 ]; then
      curl -X POST $SLACK_WEBHOOK -d '{"text":"⚠️ CI budget at 80%"}'
    fi
```

---

## Cost Optimization Roadmap

### Phase 1: Quick Wins (Week 1)

| Action | Savings | Effort |
|--------|---------|--------|
| Concurrency on staging.yml | 200 min | 10 min |
| Path filters on staging.yml | 300 min | 30 min |
| Restrict build-apps.yml | 150 min | 10 min |
| **Total** | **650 min** | **~1 hour** |

### Phase 2: Structural (Month 1)

| Action | Savings | Effort |
|--------|---------|--------|
| Consolidate nightly workflows | 100 min | 4 hours |
| Migrate more jobs to self-hosted | 200 min | 2 hours |
| Artifact reuse for builds | 100 min | 4 hours |
| **Total** | **400 min** | **~10 hours** |

### Phase 3: Strategic (Month 2+)

| Action | Savings | Effort |
|--------|---------|--------|
| Turborepo remote cache | 500 min | 20 hours |
| Affected-only testing | 300 min | 40 hours |
| Test parallelization | 200 min | 10 hours |
| **Total** | **1,000 min** | **~70 hours** |

---

## Cost Monitoring Dashboard

### Metrics to Track

| Metric | Source | Frequency |
|--------|--------|-----------|
| Minutes used (MTD) | GitHub Billing API | Daily |
| Minutes per workflow | GitHub API | Weekly |
| Minutes per PR | CI summary artifacts | Per-PR |
| Cache hit rate | Workflow logs | Weekly |
| Build duration trends | CI metrics | Weekly |

### Dashboard Queries

```sql
-- Minutes by workflow (weekly)
SELECT workflow, SUM(duration_minutes) as total
FROM ci_runs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY workflow
ORDER BY total DESC;

-- Cost per PR
SELECT pr_number, SUM(duration_minutes) as total
FROM ci_runs
WHERE pr_number IS NOT NULL
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY pr_number
ORDER BY total DESC
LIMIT 20;
```

---

## Summary

| Metric | Current | Target | Savings |
|--------|---------|--------|---------|
| Monthly minutes | 3,010 | 2,400 | 20% |
| Budget headroom | 0 | 600 min | +600 |
| PR gate duration | 10 min | 8 min | 20% |
| Cache hit rate | 80% | 90% | +10% |

**Total estimated savings**: 600-1,000 min/month (~$5-8/month in GitHub billing)

---

*Cost model should be reviewed monthly and updated after major workflow changes.*
