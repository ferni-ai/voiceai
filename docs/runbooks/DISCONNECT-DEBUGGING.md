# 🔌 Disconnect Debugging Guide

> **Quick Reference**: How to diagnose voice agent disconnects and crashes

---

## Quick Commands

```bash
# Check overall health
curl http://34.134.186.63:8080/health/ready

# Check crash analytics
curl http://34.134.186.63:8080/api/crash-analytics | jq

# Check call quality (disconnect rates, etc)
curl http://34.134.186.63:8080/api/observability | jq '.callQuality'

# View recent logs
pnpm ops:logs

# View error logs only
pnpm ops:logs:errors

# Check for zombie revisions (causes "assignment timed out")
pnpm ops:zombies

# Fix zombie revisions
pnpm ops:zombies:fix
```

---

## Disconnect Reason Cheat Sheet

| Reason | What It Means | Your Fault? | Fix |
|--------|---------------|-------------|-----|
| `client_left` | User closed browser/hung up | No | Normal |
| `participant_left` | User disconnected intentionally | No | Normal |
| `timeout` | Your code took too long | Yes | Check slow operations |
| `runner initialization timed out` | Worker startup > 30s | Yes | Check prewarm, zombie revisions |
| `assignment for job timed out` | Multiple workers fighting | Yes | Run `pnpm ops:zombies:fix` |
| `CONNECTION_ERROR` | Network/WebRTC failure | Maybe | Check user's network |
| `transport_failure` | WebSocket died | No | LiveKit issue |
| `ice_disconnected` | WebRTC ICE failed | No | Network/firewall issue |
| `ice_failed` | ICE negotiation failed | No | Check TURN server config |
| `signal_disconnected` | LiveKit signaling lost | No | LiveKit SFU issue |
| `libc++abi: mutex lock failed` | Native crash (critical!) | Yes | Shutdown race condition |

---

## Diagnosing by Symptom

### "Calls disconnect after 2-5 minutes with no user action"

**Most likely causes:**
1. **Keepalive timeout** - Worker idle too long
2. **WebSocket connection dropped** - Network hiccup

**Diagnosis:**
```bash
# Check for keepalive restarts
pnpm ops:logs | grep -i "connection is dead"

# Check idle time before disconnect
pnpm ops:logs | grep -i "idleTime"
```

**Fix:** Currently keepalive is 5 minutes - consider reducing to 90 seconds in `livekit-keepalive.ts`.

---

### "Calls fail immediately with 'assignment timed out'"

**Root cause:** Zombie revisions competing for jobs

**Diagnosis:**
```bash
pnpm ops:zombies
```

**Fix:**
```bash
pnpm ops:zombies:fix
```

---

### "Agent connects but doesn't speak"

**Root causes:**
1. TTS (Cartesia) API failure
2. LLM (Gemini) timeout
3. Prewarm race condition

**Diagnosis:**
```bash
# Check TTS/LLM health
curl http://34.134.186.63:8080/api/observability/llm | jq

# Check prewarm logs
pnpm ops:logs | grep -i "PREWARM"

# Look for entry waiting
pnpm ops:logs | grep -i "Entry waited"
```

---

### "Calls work sometimes, fail randomly"

**Likely causes:**
1. Memory pressure causing garbage collection pauses
2. Connection pool exhaustion
3. Rate limiting

**Diagnosis:**
```bash
# Check memory usage
curl http://34.134.186.63:8080/api/observability | jq '.system.memoryMb'

# Check error rates
curl http://34.134.186.63:8080/api/observability | jq '.errors'
```

---

### "Native crash: mutex lock failed"

**Root cause:** Race condition during shutdown + LiveKit reconnect

**Diagnosis:**
Look for this in logs:
```
libc++abi: terminating due to uncaught exception of type std::__1::system_error: mutex lock failed: Invalid argument
```

**Fix:** This is documented in `docs/STABILITY-PLAN.md`. The shutdown handler needs to block reconnects.

---

## Log Patterns to Watch

### Healthy Session

```
[voice-agent-entry] 🚀 Starting session
[voice-agent-entry] ✅ Connected to room
[voice-agent-entry] 👤 Participant joined
... (conversation) ...
[voice-agent-entry] 🔌 Disconnected (reason: client_left, duration: 180000ms)
```

### Unhealthy - Prewarm Race

```
[ENTRY] Job=xxx sinceStart=50ms
[SYNC] ⏳ Waiting for prewarm {"prewarmState":"pending"}
[SYNC] ✅ Prewarm ready! {"waitedMs":3500}  <-- BAD: Entry had to wait
```

### Unhealthy - Zombie Competition

```
[WARN] assignment for job AJ_xxx timed out
```

### Unhealthy - Connection Death

```
LiveKit worker connection is dead. Container passes health checks but cannot receive room dispatches.
```

---

## Metrics to Monitor

### Via /api/observability

```bash
curl http://34.134.186.63:8080/api/observability | jq '{
  callQuality: .callQuality.qualityScore,
  disconnectRate: .callQuality.disconnectRate,
  connectionSuccessRate: .callQuality.connectionSuccessRate,
  avgFirstResponseTimeMs: .callQuality.avgFirstResponseTimeMs,
  llmLatency: .llm.avgLatencyMs,
  errorRate: .errors.errorRate
}'
```

### Key Thresholds

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Connection Success Rate | > 98% | 95-98% | < 95% |
| Disconnect Rate | < 5% | 5-10% | > 10% |
| First Response Time | < 2s | 2-3s | > 3s |
| LLM Latency | < 500ms | 500-1000ms | > 1000ms |
| Quality Score | > 85 | 70-85 | < 70 |

---

## Slack Alerts (If Configured)

The `call-quality-monitor.ts` sends Slack alerts for:
- Connection success rate < 95% (warning) or < 90% (critical)
- First response time > 3s (warning) or > 5s (critical)
- Disconnect rate > 5% (warning) or > 10% (critical)
- Quality score < 85 (warning) or < 70 (critical)

To enable, set `SLACK_WEBHOOK_URL` in environment.

---

## LiveKit Dashboard

Check LiveKit's own dashboard for their-side issues:
- https://cloud.livekit.io/projects/p_1gcwootg9al (dev)
- https://cloud.livekit.io/projects/test-rvg91u1z (prod)

Look for:
- Room creation failures
- SFU node health
- WebSocket connection counts
- Egress/ingress issues

---

## GCP Monitoring

```bash
# Check Cloud Run CPU/memory
gcloud monitoring dashboards list

# Check error logs (last 30 min)
gcloud logging read 'resource.type="cloud_run_revision" severity>=ERROR' \
  --freshness=30m --limit=50

# Check for OOM kills
gcloud logging read 'resource.type="cloud_run_revision" textPayload=~"memory"' \
  --freshness=1h --limit=20
```

---

## Escalation Path

1. **First**: Check zombie revisions (`pnpm ops:zombies`)
2. **Second**: Check crash analytics (`/api/crash-analytics`)
3. **Third**: Check call quality metrics (`/api/observability`)
4. **Fourth**: Check LiveKit dashboard
5. **Fifth**: Check GCP Cloud Logging

---

## Quick Fixes by Symptom

| Symptom | Quick Fix |
|---------|-----------|
| assignment timed out | `pnpm ops:zombies:fix` |
| High disconnect rate | Check network/LiveKit status |
| High latency | Check LLM/TTS quotas |
| Memory issues | Redeploy: `ferni deploy gce` |
| Persistent failures | Full redeploy with cleanup |

---

## Related Docs

- [STABILITY-PLAN.md](../STABILITY-PLAN.md) - Crash prevention architecture
- [VOICE-AGENT-STARTUP-ISSUES.md](./VOICE-AGENT-STARTUP-ISSUES.md) - Prewarm/startup issues
- [RUNBOOK.md](../guides/RUNBOOK.md) - General operations guide
- [VOICE-AGENT-AUDIT.md](../audits/VOICE-AGENT-AUDIT.md) - Known issues catalog

