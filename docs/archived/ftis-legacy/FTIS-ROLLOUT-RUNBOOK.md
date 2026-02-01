# FTIS Rollout Runbook

> **Version**: 1.0  
> **Last Updated**: January 2026  
> **Owner**: Voice Engineering Team

## Overview

This runbook documents the procedures for rolling out FTIS (Ferni Tool Intelligence System) as the 100% solution for tool routing. It includes step-by-step deployment instructions, monitoring guidelines, and rollback procedures.

---

## Quick Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FTIS_ONLY_MODE` | `false` | Enable FTIS-only mode (disables Gemini tools) |
| `FTIS_ROLLOUT_PERCENTAGE` | `0` | Percentage of traffic using FTIS-only (0-100) |
| `FTIS_ROLLOUT_MIN_ACCURACY` | `0.85` | Minimum accuracy before auto-rollback |
| `FTIS_AUTO_ROLLBACK` | `true` | Enable automatic rollback on degradation |
| `FTIS_COLLECT_TRAINING_DATA` | `false` | Collect routing outcomes for training |
| `FTIS_ROUTING_TIMEOUT_MS` | `200` | Maximum routing latency (ms) |
| `FTIS_CONFIDENCE_FLOOR` | `0.50` | Minimum confidence for tool execution |

### Key Commands

```bash
# Check FTIS health
curl -s http://localhost:8080/api/ftis/health | jq

# View Prometheus metrics
curl -s http://localhost:8080/api/ftis/metrics

# View detailed stats
curl -s http://localhost:8080/api/ftis/stats | jq

# Generate training data
npx tsx scripts/generate-ftis-training-data.ts

# Run FTIS tests
pnpm vitest run src/tests/synthetic/ftis-e2e.test.ts
```

---

## Pre-Rollout Checklist

### Week Before

- [ ] Review audit document: `docs/audits/FTIS-PRODUCTION-READINESS.md`
- [ ] Run all E2E tests and verify passing
- [ ] Generate fresh training data (if model update needed)
- [ ] Notify on-call team of upcoming rollout
- [ ] Schedule rollout during low-traffic period

### Day Before

- [ ] Verify production health (no active incidents)
- [ ] Confirm monitoring dashboards are working
- [ ] Test rollback procedure in staging
- [ ] Document current baseline metrics

### Day Of

- [ ] Announce rollout start in #engineering Slack
- [ ] Verify all team members have access to monitoring
- [ ] Have rollback commands ready

---

## Rollout Phases

### Phase 1: Baseline (5% Traffic)

**Duration**: 2-3 days minimum

**Steps:**
```bash
# Set rollout percentage to 5%
export FTIS_ROLLOUT_PERCENTAGE=5
export FTIS_ONLY_MODE=true
export FTIS_COLLECT_TRAINING_DATA=true

# Deploy
ferni deploy gce
```

**Monitor:**
- Accuracy rate (target: >90%)
- Routing latency p95 (target: <200ms)
- Tool execution success rate
- User complaint rate

**Exit Criteria:**
- [ ] >500 routing decisions in FTIS cohort
- [ ] Accuracy >90%
- [ ] No increase in error rate
- [ ] No negative user feedback

### Phase 2: Canary (10% Traffic)

**Duration**: 2-3 days minimum

**Steps:**
```bash
# Increase to 10%
export FTIS_ROLLOUT_PERCENTAGE=10
ferni deploy gce
```

**Monitor:**
- Same metrics as Phase 1
- Cross-persona routing accuracy
- Handoff suggestion quality

**Exit Criteria:**
- [ ] >1000 routing decisions
- [ ] Accuracy stable at >90%
- [ ] No degradation in Phase 1 metrics

### Phase 3: Expansion (25% Traffic)

**Duration**: 3-5 days minimum

**Steps:**
```bash
export FTIS_ROLLOUT_PERCENTAGE=25
ferni deploy gce
```

**Additional Monitoring:**
- Peak load performance
- Memory/CPU usage on GCE
- Spanner query latency (if using graph)

**Exit Criteria:**
- [ ] >2500 routing decisions
- [ ] Accuracy stable at >90%
- [ ] No performance degradation

### Phase 4: Majority (50% Traffic)

**Duration**: 5-7 days minimum

**Steps:**
```bash
export FTIS_ROLLOUT_PERCENTAGE=50
ferni deploy gce
```

**Exit Criteria:**
- [ ] >5000 routing decisions
- [ ] Accuracy stable at >90%
- [ ] Positive or neutral user feedback
- [ ] No increase in support tickets

### Phase 5: Full Rollout (100% Traffic)

**Steps:**
```bash
export FTIS_ROLLOUT_PERCENTAGE=100
export FTIS_ONLY_MODE=true
ferni deploy gce
```

**Post-Rollout:**
- [ ] Announce completion in #engineering
- [ ] Update documentation
- [ ] Schedule post-mortem (even if successful)
- [ ] Consider removing legacy code paths

---

## Monitoring During Rollout

### Health Endpoint

Check every 5 minutes during rollout:
```bash
curl -s http://34.134.186.63:8080/api/ftis/health | jq '{
  status: .status,
  accuracy: .metrics.accuracy,
  decisions: .metrics.totalDecisions,
  mode: .mode
}'
```

**Expected Response:**
```json
{
  "status": "healthy",
  "accuracy": 0.95,
  "decisions": 1234,
  "mode": "ftis_only"
}
```

### Key Metrics to Watch

| Metric | Alert Threshold | Critical Threshold |
|--------|-----------------|-------------------|
| `ftis_accuracy_rate` | < 0.90 | < 0.85 |
| `ftis_routing_latency_ms{quantile="0.95"}` | > 150ms | > 300ms |
| `ftis_routing_failure_total` / total | > 5% | > 10% |
| `ftis_alert_state` | = 1 | - |

### Dashboard Queries (Prometheus)

```promql
# Accuracy over time
ftis_accuracy_rate

# Routing success rate
rate(ftis_routing_success_total[5m]) / rate(ftis_routing_decisions_total[5m])

# p95 latency
histogram_quantile(0.95, rate(ftis_routing_latency_ms_bucket[5m]))

# Error rate by tool
rate(ftis_tool_failure_total[5m]) / rate(ftis_tool_execution_total[5m])
```

---

## Rollback Procedures

### Automatic Rollback

FTIS will automatically pause rollout if:
- Accuracy drops below `FTIS_ROLLOUT_MIN_ACCURACY` (default: 85%)
- After at least 100 routing decisions (configurable)

When auto-rollback triggers:
1. `rolloutState.isPaused` is set to `true`
2. All traffic routes to legacy (JSON workaround)
3. Alert is logged at ERROR level
4. Investigate and fix before resuming

### Manual Rollback

**Option 1: Reduce Percentage**
```bash
export FTIS_ROLLOUT_PERCENTAGE=0
ferni deploy gce
```

**Option 2: Full Disable**
```bash
export FTIS_ONLY_MODE=false
export FTIS_ROLLOUT_PERCENTAGE=0
ferni deploy gce
```

**Option 3: Emergency (Immediate)**
```bash
# SSH to GCE
gcloud compute ssh voiceai-agent

# Inside container
docker exec -it $(docker ps -q) /bin/sh
export FTIS_ONLY_MODE=false
# Container will need restart - do full deploy
```

### Rollback Verification

After rollback, verify:
```bash
# Check mode is not FTIS-only
curl -s http://34.134.186.63:8080/api/ftis/health | jq '.mode'
# Should return: "legacy" or "hybrid"

# Check rollout percentage is 0
curl -s http://34.134.186.63:8080/api/ftis/health | jq '.percentage'
# Should return: 0
```

---

## Incident Response

### Severity Levels

| Level | Definition | Response Time |
|-------|------------|---------------|
| **P1** | Complete FTIS failure, all tool routing broken | Immediate rollback |
| **P2** | Accuracy <85%, significant user impact | Rollback within 15 min |
| **P3** | Accuracy 85-90%, moderate user impact | Investigate, consider rollback |
| **P4** | Minor issues, <5% of users affected | Monitor, fix in next deploy |

### P1 Incident Procedure

1. **Immediate**: Execute rollback
   ```bash
   export FTIS_ONLY_MODE=false
   ferni deploy gce
   ```

2. **Notify**: Post in #incidents
   ```
   🚨 P1: FTIS rollback executed
   Impact: [describe]
   Actions: Investigating root cause
   ```

3. **Investigate**: Check logs
   ```bash
   ferni logs agent --errors --since 1h
   ```

4. **Post-mortem**: Schedule within 24h

### P2 Incident Procedure

1. **Assess**: Check health endpoint
2. **Decision**: If accuracy <85%, rollback
3. **Notify**: Update #engineering
4. **Monitor**: Watch for recovery
5. **Document**: Create incident ticket

---

## Troubleshooting

### "Accuracy Suddenly Dropped"

**Symptoms:** `ftis_accuracy_rate` < 0.85

**Possible Causes:**
1. New tool added without domain bridge mapping
2. Changed tool behavior without updating training data
3. External API failure affecting tool execution

**Investigation:**
```bash
# Check which tools are failing
curl -s http://localhost:8080/api/ftis/stats | jq '.tools.failureRates'

# Check recent logs
ferni logs agent --search "FTIS" --since 30m
```

### "High Latency"

**Symptoms:** p95 latency > 200ms

**Possible Causes:**
1. Router model inference slow
2. Domain bridge lookups slow
3. Tool execution slow (not FTIS issue)

**Investigation:**
```bash
# Check component latencies
curl -s http://localhost:8080/api/ftis/stats | jq '.routing'
```

### "User Reports Wrong Tool"

**Symptoms:** User says "I asked for X but got Y"

**Investigation:**
1. Check domain bridge mapping exists
2. Check confidence score for the query
3. Check if similar queries have different outcomes

**Resolution:**
1. Add/fix domain bridge mapping
2. Add training example
3. Lower confidence threshold if borderline

---

## Post-Rollout

### When 100% Rollout is Stable

1. **Remove Legacy Code** (optional)
   - Comment out JSON workaround code
   - Remove unused FC prompt modules
   - Clean up environment variable checks

2. **Update Documentation**
   - Mark FTIS as default in CLAUDE.md
   - Update architecture diagrams
   - Archive old tool routing docs

3. **Celebrate** 🎉
   - Post announcement in #general
   - Document learnings
   - Plan next improvements

### Ongoing Maintenance

- **Weekly**: Review accuracy metrics, retrain if needed
- **Monthly**: Audit domain bridge coverage
- **Quarterly**: Review and update training data

---

## Contacts

| Role | Person | Slack |
|------|--------|-------|
| FTIS Owner | Engineering Lead | @eng-lead |
| On-Call | Rotating | @oncall |
| Escalation | CTO | @cto |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial release |

---

*This runbook is a living document. Update it as procedures evolve.*
