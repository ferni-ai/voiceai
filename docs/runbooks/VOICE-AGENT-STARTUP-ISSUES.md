# Voice Agent Startup Issues Runbook

> **Last Updated:** December 13, 2024
> **Author:** Engineering Team
> **Severity:** P1 - User-facing impact

## Overview

This runbook covers diagnosing and fixing voice agent startup issues, particularly the prewarm/entry race condition that caused production outages in December 2024.

## Quick Diagnosis

```bash
# Check for zombie revisions
pnpm ops:zombies

# Check Cloud Run logs for startup errors
gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="voiceai-agent" (textPayload=~"PREWARM" OR textPayload=~"ENTRY" OR textPayload=~"timeout")' --limit=50 --freshness=30m

# Run local startup tests
ferni voice e2e
```

---

## Common Issues

### 1. "assignment for job timed out"

**Symptoms:**
```
[WARN] assignment for job AJ_xxx timed out
```

**Root Cause:** Multiple workers receiving the same job (zombie revisions) OR prewarm not completing before entry.

**Solution:**
```bash
# Fix zombie revisions
pnpm ops:zombies:fix:agent

# If still failing, check prewarm logs
gcloud logging read 'textPayload=~"PREWARM"' --limit=30 --freshness=10m
```

---

### 2. "runner initialization timed out"

**Symptoms:**
```
Error: runner initialization timed out
```

**Root Cause:** Child process taking >30s to respond to LiveKit SDK.

**Solution:**
1. Check prewarm timing in logs
2. Look for slow dependency loads
3. Verify Cloud Run has adequate CPU/memory

```bash
# Check resource allocation
gcloud run services describe voiceai-agent --region=us-central1 --format="yaml(spec.template.spec.containers[0].resources)"
```

---

### 3. "ERR_IPC_CHANNEL_CLOSED"

**Symptoms:**
```
Error [ERR_IPC_CHANNEL_CLOSED]: Channel closed
    at target.send (node:internal/child_process:753:16)
```

**Root Cause:** Child process crashed or exited before parent could communicate.

**Solution:**
1. Check for uncaught exceptions in child process logs
2. Look for memory issues
3. Check for missing dependencies

```bash
# Check for crashes
gcloud logging read 'textPayload=~"UNCAUGHT" OR textPayload=~"crash"' --limit=20
```

---

### 4. Prewarm/Entry Race Condition

**Symptoms:**
- `[ENTRY] Session module: imported` (not PRELOADED)
- Entry runs immediately after prewarm starts
- Session fails with null dependencies

**Root Cause:** LiveKit SDK does NOT await prewarm() before calling entry().

**Fix (Applied December 2024):**
```typescript
// voice-agent-child.ts now has:
// 1. _prewarmReady Promise
// 2. entry() awaits _prewarmReady before using deps
// 3. 25s timeout with graceful resolution
```

**Verify Fix:**
```bash
ferni voice e2e
```

---

## Log Analysis

### Key Log Patterns

| Pattern | Meaning |
|---------|---------|
| `[STARTUP] Module initializing` | Child process started |
| `[PREWARM] Phase 1: External packages` | Loading LiveKit, Google plugins |
| `[PREWARM] Phase 2: Internal modules` | Loading Ferni code |
| `[PREWARM] Phase 3: Heavy resources` | Loading VAD model, persona bundles |
| `[SYNC] Waiting for prewarm` | Entry is waiting for deps |
| `[SYNC] ✅ Prewarm ready!` | Race condition fix working |
| `[TIMING] ⚠️ Entry waited Xms` | Race condition was hit |

### Healthy Startup Sequence

```
╔════════════════════════════════════════════════════════════╗
║  VOICE AGENT CHILD PROCESS STARTING                        ║
╚════════════════════════════════════════════════════════════╝
[STARTUP] Module initializing {"pid":123,"isChild":true}
[TIMING] ✅ @livekit/agents import: 50ms
[STARTUP] Core imports complete {"elapsed":100}
[SYNC] Prewarm synchronization initialized {"state":"pending"}

╔════════════════════════════════════════════════════════════╗
║  PREWARM STARTING                                          ║
╚════════════════════════════════════════════════════════════╝
[PREWARM] Phase 1: Loading external packages...
[TIMING] ✅ @livekit/agents: 500ms
[TIMING] ✅ @livekit/agents-plugin-google: 600ms
[PREWARM] Phase 2: Loading internal modules...
[PREWARM] Phase 3: Loading heavy resources...

╔════════════════════════════════════════════════════════════╗
║  PREWARM COMPLETE                                          ║
╚════════════════════════════════════════════════════════════╝
[SYNC] 🔓 Signaling prewarm complete to waiting entry() calls

╔════════════════════════════════════════════════════════════╗
║  ENTRY: Job AJ_xxx                                         ║
╚════════════════════════════════════════════════════════════╝
[SYNC] ✅ Prewarm ready! {"waitedMs":0}
[ENTRY] Session module: PRELOADED ✅
```

### Unhealthy Patterns

```
# BAD: Entry called before prewarm started
[ENTRY] Job=xxx sinceStart=50ms
[SYNC] ⏳ Waiting for prewarm {"prewarmState":"pending"}
[SYNC] ✅ Prewarm ready! {"waitedMs":3500}  <-- HAD TO WAIT

# BAD: Prewarm timeout
[SYNC] 🚨 PREWARM TIMEOUT - took more than 25 seconds!

# BAD: Missing dependencies
[STATE] Dependencies: 8 loaded, 4 missing {"missing":"voice,google,silero,genai"}
```

---

## Performance Budgets

| Phase | Target | Max |
|-------|--------|-----|
| Core imports | <500ms | 5s |
| Phase 1 (external) | <3s | 8s |
| Phase 2 (internal) | <2s | 5s |
| Phase 3 (heavy) | <5s | 10s |
| **Total prewarm** | **<10s** | **25s** |
| LiveKit timeout | - | 30s |

---

## Monitoring & Alerts

### Cloud Monitoring Queries

```
# Prewarm duration
resource.type="cloud_run_revision"
resource.labels.service_name="voiceai-agent"
textPayload=~"PREWARM.*COMPLETE"

# Entry wait time
resource.type="cloud_run_revision" 
textPayload=~"Entry waited"

# Failures
resource.type="cloud_run_revision"
severity>=WARNING
textPayload=~"timeout|failed|crash"
```

### Recommended Alerts

1. **Prewarm > 20s** → Warning
2. **Prewarm > 25s** → Critical
3. **Entry wait > 5s** → Warning (race condition being hit)
4. **"assignment timed out"** → Critical
5. **"ERR_IPC_CHANNEL_CLOSED"** → Critical

---

## Testing

### Local Testing

```bash
# Run comprehensive startup tests
ferni voice e2e

# With chaos testing
ferni voice e2e --chaos

# Run E2E test suite
npx vitest run src/agents/__tests__/voice-agent-e2e.test.ts
```

### Pre-Deploy Checklist

- [ ] `npm run build:fast` succeeds
- [ ] `npm run typecheck` passes (or known pre-existing errors only)
- [ ] `ferni voice e2e` all green
- [ ] Local dev test with voice call works
- [ ] No zombie revisions exist (`pnpm ops:zombies`)

---

## Deployment

### Safe Deployment Process

```bash
# 1. Check for zombies first
pnpm ops:zombies

# 2. Deploy with blue-green
npm run deploy:agent:async

# 3. Monitor logs
gcloud logging read 'resource.labels.service_name="voiceai-agent"' --limit=50 --freshness=5m

# 4. Verify health
curl https://app.ferni.ai/health

# 5. Test voice call
# Open app.ferni.ai and make a test call
```

### Rollback

```bash
# List revisions
gcloud run revisions list --service=voiceai-agent --region=us-central1

# Route traffic to previous revision
gcloud run services update-traffic voiceai-agent \
  --to-revisions=voiceai-agent-00188-xxx=100 \
  --region=us-central1
```

---

## Architecture

### Prewarm/Entry Synchronization

```
┌─────────────────────────────────────────────────────────────┐
│  LIVEKIT SDK                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Spawn child process                                       │
│  2. Call prewarm() ──────────────────┐                        │
│  3. Call entry() (immediately!)       │  NOT AWAITED!         │
│                                       │                        │
└───────────────────────────────────────│────────────────────────┘
                                        │
┌───────────────────────────────────────│────────────────────────┐
│  VOICE-AGENT-CHILD.TS                 │                        │
├───────────────────────────────────────│────────────────────────┤
│                                       │                        │
│  prewarm():                           ▼                        │
│    - Load external packages           │                        │
│    - Load internal modules            │ _prewarmReady Promise   │
│    - Load VAD model                   │                        │
│    - Initialize bundles               │                        │
│    - _prewarmResolve() ───────────────┘                        │
│                                                                │
│  entry():                                                      │
│    - await _prewarmReady  ◄────────── WAITS HERE!              │
│    - Use preloaded deps (safe now)                             │
│    - Run session                                               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### File Locations

| File | Purpose |
|------|---------|
| `src/agents/voice-agent-child.ts` | Child process entry point |
| `src/agents/voice-agent-entry.ts` | Session entry logic |
| `src/agents/voice-agent-session.ts` | Session runner |
| `src/agents/shared/startup-health.ts` | Health check utilities |
| `scripts/test-voice-agent-startup.ts` | Local test harness |
| `apps/cli/src/commands/ops/cleanup-zombies.ts` | Zombie revision cleanup |

---

## Escalation

If none of the above resolves the issue:

1. Check Cloud Run service health dashboard
2. Check GCP incident status
3. Check LiveKit status page
4. Contact: @seth in #ferni-engineering Slack

