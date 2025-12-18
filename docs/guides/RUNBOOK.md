# 🚨 Ferni AI Operations Runbook

A guide for handling incidents, monitoring system health, and maintaining SLOs.

---

## Service Level Objectives (SLOs)

### Voice Agent

| Metric | Target | Measurement | Alert Threshold |
|--------|--------|-------------|-----------------|
| **Availability** | 99.9% | Uptime over 30 days | < 99.5% |
| **Response Latency (p50)** | < 200ms | First voice response | > 300ms |
| **Response Latency (p99)** | < 800ms | First voice response | > 1000ms |
| **Handoff Success Rate** | > 98% | Successful agent transfers | < 95% |
| **Error Rate** | < 1% | 5xx errors / total requests | > 2% |

### UI Server

| Metric | Target | Measurement | Alert Threshold |
|--------|--------|-------------|-----------------|
| **Availability** | 99.9% | Uptime over 30 days | < 99.5% |
| **Page Load (p50)** | < 1s | Time to interactive | > 2s |
| **API Response (p99)** | < 500ms | API endpoint latency | > 1000ms |
| **Error Rate** | < 0.5% | 5xx errors / total requests | > 1% |

### DORA Metrics Targets

| Metric | Elite | Current Target |
|--------|-------|----------------|
| **Deployment Frequency** | Multiple/day | Daily |
| **Lead Time for Changes** | < 1 hour | < 4 hours |
| **Change Failure Rate** | < 5% | < 10% |
| **Mean Time to Recovery** | < 1 hour | < 2 hours |

---

## Monitoring Dashboards

### Primary Dashboards

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| **Cognitive Intelligence** | `/cognitive-dashboard.html` | AI decision metrics |
| **Handoff Diagnostics** | `/api/diagnostics/handoffs/dashboard` | Agent transfer health |
| **DORA Metrics** | `/api/dora/dashboard` | Deployment performance |
| **Observability** | `/api/observability/dashboard` | System-wide metrics |

### Key Metrics to Monitor

```
# Voice Agent Health
- voice_agent_sessions_active
- voice_agent_response_latency_ms
- voice_agent_error_rate
- handoff_success_rate
- llm_token_usage

# UI Server Health
- ui_server_requests_per_second
- ui_server_error_rate
- api_latency_p99

# External Services
- livekit_connection_status
- cartesia_tts_latency
- gemini_llm_latency
- firestore_operation_latency
```

---

## Incident Response

### Severity Levels

| Level | Impact | Response Time | Examples |
|-------|--------|---------------|----------|
| **P1 Critical** | Complete service outage | 15 minutes | Voice not working, no connections |
| **P2 Major** | Major feature broken | 1 hour | Handoffs failing, high error rate |
| **P3 Minor** | Minor feature degraded | 4 hours | Slow responses, UI glitches |
| **P4 Low** | Cosmetic/minor issue | 24 hours | Typos, minor UI issues |

### Incident Response Checklist

```markdown
## Incident Checklist

### Initial Response (< 15 min for P1)
- [ ] Acknowledge incident in communication channel
- [ ] Assess severity level
- [ ] Check dashboards for anomalies
- [ ] Check recent deployments (last 24h)
- [ ] Check external service status (LiveKit, GCP, Cartesia)

### Investigation
- [ ] Review error logs in GCP Cloud Logging
- [ ] Check Sentry for new errors
- [ ] Review recent code changes
- [ ] Check infrastructure metrics

### Resolution
- [ ] Implement fix or rollback
- [ ] Verify fix in production
- [ ] Update stakeholders
- [ ] Record incident in DORA API

### Post-Incident
- [ ] Write post-mortem (for P1/P2)
- [ ] Create follow-up tickets
- [ ] Update runbook if needed
```

---

## Common Issues & Fixes

### 1. Voice Agent Not Responding

**Symptoms**: Users can connect but agent doesn't speak

**Quick Checks**:
```bash
# Check voice agent health
curl https://voice-agent-url/health

# Check LiveKit room status
curl -H "Authorization: Bearer $LIVEKIT_API_KEY" \
  https://your-livekit-url/twirp/livekit.RoomService/ListRooms

# Check voice agent logs (GCE)
npm run ops:logs
```

**Common Fixes**:
- Restart voice agent: Trigger new deployment
- Check Cartesia API key validity
- Check Gemini API quota

### 2. High Latency

**Symptoms**: Response times > 500ms

**Quick Checks**:
```bash
# Check latency breakdown
curl https://ui-url/api/observability/llm

# Check database latency
curl https://ui-url/api/observability/memory
```

**Common Fixes**:
- Scale up Cloud Run instances
- Check for slow database queries
- Review context builder performance

### 3. Handoff Failures

**Symptoms**: Agent transfers failing, stuck in wrong persona

**Quick Checks**:
```bash
# Check handoff dashboard
curl https://ui-url/api/diagnostics/handoffs

# Check recent handoff attempts
curl https://ui-url/api/diagnostics/handoffs/failures
```

**Common Fixes**:
- Verify persona bundles are loaded
- Check voice ID assignments
- Review handoff trigger configuration

### 4. Authentication Errors

**Symptoms**: 401/403 errors on API calls

**Quick Checks**:
```bash
# Test auth endpoint
curl -H "X-API-Key: $API_KEY" https://ui-url/api/agents

# Check JWT validity (if using JWT)
# Decode at jwt.io
```

**Common Fixes**:
- Regenerate API keys
- Check JWT_SECRET in environment
- Verify CORS configuration

### 5. Database Connection Issues

**Symptoms**: Firestore errors, memory not persisting

**Quick Checks**:
```bash
# Check Firestore status
gcloud firestore databases list

# Test write operation
curl -X POST https://ui-url/api/test-firestore
```

**Common Fixes**:
- Check service account permissions
- Verify GOOGLE_CLOUD_PROJECT env var
- Check Firestore quotas

---

## Rollback Procedures

### Quick Rollback (< 5 minutes)

```bash
# Rollback voice agent - redeploy previous commit
git checkout HEAD~1 -- src/agents/
npm run deploy:agent

# Rollback UI server
gcloud run services update-traffic john-bogle-ui \
  --region=us-central1 \
  --to-revisions=john-bogle-ui-PREVIOUS:100
```

### Full Rollback via GitHub

1. Go to Actions → Rollback workflow
2. Select the service and target revision
3. Trigger the rollback

### Verify Rollback

```bash
# Check current serving revision
gcloud run services describe voiceai-agent --region=us-central1 --format="value(status.traffic)"

# Run smoke tests
npx tsx scripts/smoke-test.ts --url=https://your-production-url
```

---

## Useful Commands

### GCP Cloud Run

```bash
# List services
gcloud run services list --region=us-central1

# Get service details
gcloud run services describe voiceai-agent --region=us-central1

# View recent logs
gcloud logging read "resource.type=cloud_run_revision" --limit=100 --format="table(timestamp,textPayload)"

# Scale service
gcloud run services update voiceai-agent --region=us-central1 --max-instances=20
```

### Database Operations

```bash
# Export Firestore collection
gcloud firestore export gs://your-bucket/backup-$(date +%Y%m%d)

# Check collection stats
firebase firestore:indexes
```

### Local Development

```bash
# Run all services locally
npm run token-server &
PORT=3002 node ui-server.js &
cd apps/web && npm run dev

# Run smoke tests locally
npx tsx scripts/smoke-test.ts --url=http://localhost:3001
```

---

## Escalation Contacts

| Role | Contact | When to Escalate |
|------|---------|------------------|
| On-Call Engineer | (rotation) | First responder |
| Backend Lead | @backend-lead | Voice agent issues |
| Frontend Lead | @frontend-lead | UI issues |
| DevOps | @devops | Infrastructure issues |

---

## Post-Incident Template

```markdown
# Post-Incident Review: [TITLE]

**Date**: YYYY-MM-DD
**Duration**: X hours Y minutes
**Severity**: P1/P2/P3
**Incident Commander**: Name

## Summary
Brief description of what happened.

## Timeline
- HH:MM - First alert triggered
- HH:MM - Incident acknowledged
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Incident resolved

## Root Cause
What caused the incident?

## Impact
- X users affected
- Y minutes of downtime
- Z failed transactions

## Resolution
What fixed it?

## Action Items
- [ ] Action 1 - Owner - Due date
- [ ] Action 2 - Owner - Due date

## Lessons Learned
What did we learn?
```

---

## Related Documents

- [SDLC Audit](../audits/SDLC-AUDIT.md)
- [Architecture Overview](./architecture/architecture.md)
- [DORA Metrics API](./guides/api-reference.md#dora-metrics)

