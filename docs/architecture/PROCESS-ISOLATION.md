# Process Isolation & Resilience Architecture

> **Created:** December 2024
> **Status:** Implementation Complete

This document describes the process isolation architecture implemented to make the Ferni voice agent more resilient and optimize the critical path.

---

## Problem Statement

The voice agent was running **everything in a single Node.js process**, creating several risks:

1. **Unhandled promise rejections** from ~48 fire-and-forget operations could crash the process
2. **Memory pressure** from embeddings and vector operations
3. **External API failures** (Twilio, SendGrid) could cascade
4. **Background tasks** running via `setInterval` consumed memory and could fail silently
5. **Race conditions** in speech output caused overlapping audio

---

## Solution Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    VOICE AGENT PROCESS                              │
│                   (Critical Path Only)                              │
├─────────────────────────────────────────────────────────────────────┤
│  ⚡ Critical Path                                                   │
│    - LiveKit connection                                             │
│    - Transcription → LLM → TTS → Audio                             │
│    - Speech Coordinator (serialized output)                         │
│    - Safety guards                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  🛡️ Safety Net                                                      │
│    - registerGlobalErrorHandlers()                                  │
│    - safeFireAndForget() wrapper                                    │
│    - Metrics tracking                                               │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Pub/Sub
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 INTELLIGENCE WORKER (Cloud Run)                     │
├─────────────────────────────────────────────────────────────────────┤
│  Pattern Detection        │  Predictive Intelligence                │
│  Key Moment Detection     │  Trust Recording                        │
│  Response Quality         │  Outreach Extraction                    │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Firestore
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    INSIGHTS DATABASE                                │
│  - Detected patterns      - Predictions                             │
│  - Key moments            - Trust profiles                          │
│  - Community insights     - Persona metrics                         │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Cloud Scheduler
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SCHEDULED JOBS (Cloud Run)                       │
│  - Background task processing                                       │
│  - Session cleanup                                                  │
│  - Community insights aggregation                                   │
│  - Trust profile sync                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Components Implemented

### 1. Safe Fire-and-Forget Utility

**File:** `src/utils/safe-fire-and-forget.ts`

Wraps all async operations that don't need to be awaited:

```typescript
import { safeFireAndForget } from '../utils/safe-fire-and-forget.js';

// Before (dangerous):
void processPatterns(userId, text);

// After (safe):
safeFireAndForget(
  () => processPatterns(userId, text),
  { context: 'pattern-detection' }
);
```

Features:
- Error boundary catches all failures
- Structured logging with context
- Metrics tracking
- Timeout warnings
- Deduplication for repeated failures
- Global error handler registration

### 2. Intelligence Worker

**Location:** `apps/intelligence-worker/`

Separate Cloud Run service that processes:
- Pattern detection (cross-session)
- Predictive intelligence (superhuman predictions)
- Key moment detection (vulnerability, breakthrough, celebration)
- Trust recording
- Response quality tracking

Deployment:
```bash
ferni deploy intelligence
# or
gcloud builds submit --config=cloudbuild-intelligence.yaml
```

### 3. Intelligence Publisher

**File:** `src/services/intelligence-publisher.ts`

Publishes events from voice agent to intelligence worker:

```typescript
import { publishPatternDetection, publishKeyMoment } from '../services/intelligence-publisher.js';

// In turn processor:
publishPatternDetection(userId, sessionId, {
  message: userText,
  topic: detectedTopic,
  emotion: detectedEmotion,
});
```

Supports:
- Pub/Sub publishing (production)
- Firestore queue fallback (development)
- Batch publishing for efficiency

### 4. Speech Coordinator

**File:** `src/agents/shared/speech-coordinator.ts`

Serializes all speech output to prevent overlapping audio:

```typescript
import { getSpeechCoordinator } from './speech-coordinator.js';

const coordinator = getSpeechCoordinator();
coordinator.bind(session);

// All speech goes through coordinator:
await coordinator.speak('Here are the results...', 'tool_result');
await coordinator.speak('Mhm', 'backchannel', { skipIfSpeaking: true });
```

Features:
- Priority-based queuing (tool_result > llm > backchannel)
- Deduplication (same text within 5s)
- Low-priority dropping when busy
- Metrics tracking

### 5. Cloud Scheduler Jobs

**File:** `infra/cloud-scheduler-jobs.yaml`

Replaces in-process `setInterval` calls:

| Job | Schedule | Replaces |
|-----|----------|----------|
| `intelligence-batch-processor` | Every 5 min | fire-and-forget intelligence calls |
| `background-task-processor` | Every 1 min | `setInterval` in background-tasks.ts |
| `session-cleanup` | Every 5 min | `startSessionCleanup()` |
| `community-insights-aggregation` | Daily 3am | Manual aggregation |
| `trust-profile-sync` | Every 6 hours | Batch trust updates |

### 6. Scheduled Jobs API

**File:** `src/api/scheduled-jobs.routes.ts`

Endpoints for Cloud Scheduler:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/jobs/process-background-tasks` | Process pending tasks |
| `POST /api/jobs/check-scheduled` | Trigger due jobs |
| `POST /api/jobs/cleanup-sessions` | Clean orphaned sessions |
| `POST /api/jobs/aggregate-community-insights` | Daily aggregation |

---

## Migration Guide

### For Fire-and-Forget Calls

**Before:**
```typescript
void (async () => {
  try {
    const result = await riskyOperation();
  } catch {
    // Silent failure
  }
})();
```

**After:**
```typescript
safeFireAndForget(
  () => riskyOperation(),
  { context: 'risky-operation', critical: true }
);
```

### For Intelligence Operations

**Before:**
```typescript
void processTranscriptForPatterns(userId, text, topic, emotion);
```

**After:**
```typescript
publishPatternDetection(userId, sessionId, {
  message: text,
  topic,
  emotion,
});
```

### For Background Tasks

**Before (in-process):**
```typescript
setInterval(() => {
  checkSchedules();
}, 60000);
```

**After (Cloud Scheduler):**
```yaml
- name: background-task-processor
  schedule: "* * * * *"
  uri: https://ui-server/api/jobs/process-background-tasks
```

---

## Monitoring

### Fire-and-Forget Metrics

```typescript
import { getFireAndForgetMetrics } from '../utils/safe-fire-and-forget.js';

const metrics = getFireAndForgetMetrics();
// {
//   totalCalls: 1234,
//   successCount: 1200,
//   failureCount: 34,
//   successRate: '97.2%',
//   byContext: [
//     { context: 'pattern-detection', calls: 500, successes: 495, failures: 5 },
//     ...
//   ]
// }
```

### Speech Coordinator Metrics

```typescript
const coordinator = getSpeechCoordinator();
const metrics = coordinator.getMetrics();
// {
//   queueLength: 0,
//   isProcessing: false,
//   totalRequests: 567,
//   processed: 560,
//   dropped: 7,
//   deduplicated: 12,
// }
```

### Intelligence Worker Metrics

```bash
curl https://intelligence-worker.run.app/metrics
```

---

## Deployment

### Deploy Intelligence Worker

```bash
# Via Ferni CLI (recommended)
ferni deploy intelligence

# Or via Cloud Build
gcloud builds submit --config=cloudbuild-intelligence.yaml
```

### Set Up Cloud Scheduler

```bash
# Create jobs from YAML config
# (See infra/cloud-scheduler-jobs.yaml for full list)

gcloud scheduler jobs create http intelligence-batch-processor \
  --schedule="*/5 * * * *" \
  --uri="https://intelligence-worker.run.app/process-batch" \
  --http-method=POST \
  --location=us-central1
```

### Enable Pub/Sub

```bash
# Set environment variable
INTELLIGENCE_PUBSUB_ENABLED=true
```

---

## Expected Improvements

| Metric | Before | After |
|--------|--------|-------|
| Process crash risk | High | Low |
| Fire-and-forget reliability | Unknown | Tracked + Safe |
| Background task reliability | setInterval (fragile) | Cloud Scheduler (durable) |
| Speech overlapping | Race conditions | Serialized |
| Memory usage | ~800MB | ~500MB |

---

## Future Improvements

1. **Embedding Worker** - Move heavy vector operations to separate worker
2. **Memory Service** - Dedicated microservice for vector search
3. **Trust Service** - Dedicated service for trust system queries
4. **Circuit Breakers** - Add circuit breakers for external APIs

---

## Files Modified

| File | Change |
|------|--------|
| `src/utils/safe-fire-and-forget.ts` | New - Safety wrapper utility |
| `src/agents/shared/speech-coordinator.ts` | New - Unified speech output |
| `src/services/intelligence-publisher.ts` | New - Event publishing |
| `src/api/scheduled-jobs.routes.ts` | New - Job endpoints |
| `apps/intelligence-worker/*` | New - Worker service |
| `src/agents/processors/turn-processor.ts` | Updated - Use new utilities |
| `src/agents/gce-voice-worker.ts` | Updated - Global error handlers |
| `infra/cloud-scheduler-jobs.yaml` | New - Scheduler config |
| `cloudbuild-intelligence.yaml` | New - Build config |
| `pnpm-workspace.yaml` | Updated - Add new apps |

---

*Last updated: December 2024*

