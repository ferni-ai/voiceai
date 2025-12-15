# Outreach Worker Architecture

> **Status**: Proposal
> **Created**: 2025-12-15
> **Problem**: Loading 300k+ triggers on voice agent startup causes memory issues and slow cold starts

## Executive Summary

The outreach system is currently coupled with the voice agent, loading all pending triggers into memory on startup. This causes:
- **Memory bloat**: 3.7GB heap usage processing 300k triggers
- **Slow cold starts**: Agent can't connect to LiveKit until triggers are loaded
- **Single point of failure**: Outreach processing blocks voice functionality

**Solution**: Extract outreach into a separate, dedicated worker architecture.

---

## Current Problems

### 1. Startup Bottleneck
```typescript
// src/services/outreach/index.ts line 383-392
const pendingTriggers = await loadAllPendingTriggers();  // Loads 300k+ docs
for (const trigger of pendingTriggers) {
  engine.addTrigger(trigger.trigger);  // In-memory processing
}
```

### 2. Memory Pressure
- Voice agent heap grows to 3.7GB+ processing triggers
- Triggers never reach "Phase 4: Connect to LiveKit"
- Workers time out before becoming ready

### 3. Coupled Architecture
```
Current: Monolith
┌──────────────────────────────────────────┐
│           Voice Agent (GCE)              │
│  ┌────────────────────────────────────┐  │
│  │  LiveKit Connection (WebRTC/UDP)   │  │
│  │  TTS, VAD, LLM                     │  │
│  │  Session Management                │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Outreach System (300k triggers)   │  │ ← PROBLEM
│  │  Decision Engine, Delivery         │  │
│  │  Analytics, A/B Testing            │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## Proposed Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Voice Agent (GCE VM)                              │
│  - LiveKit WebRTC/UDP                                                    │
│  - Real-time voice processing                                            │
│  - Session management                                                    │
│  - Trigger PRODUCER (writes to Pub/Sub)                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Google Pub/Sub
                                    │ (outreach-triggers topic)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Outreach Worker (Cloud Run Jobs)                      │
│  - Trigger CONSUMER (reads from Pub/Sub)                                 │
│  - Decision Engine (should we reach out?)                                │
│  - Timing Intelligence (when is optimal?)                                │
│  - Channel Selection (SMS, email, call, push)                            │
│  - Message Generation (persona voice)                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Google Cloud Tasks
                                    │ (scheduled delivery)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Delivery Workers (Cloud Run Services)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ SMS Worker  │  │Email Worker │  │ Call Worker │  │ Push Worker │     │
│  │ (Twilio)    │  │ (SendGrid)  │  │(SIP Bridge) │  │   (FCM)     │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Firestore (Shared State)                              │
│  - outreach_profiles/{userId}                                            │
│  - outreach_triggers/{triggerId} (with status tracking)                  │
│  - outreach_history/{userId}/records/{recordId}                          │
│  - outreach_context/{userId}                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Voice Agent (Producer)

**Responsibility**: Detect outreach opportunities during conversations, publish triggers

**Changes Required**:
```typescript
// src/services/outreach/trigger-publisher.ts (NEW)
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();
const topic = pubsub.topic('outreach-triggers');

export async function publishTrigger(trigger: Omit<OutreachTrigger, 'id' | 'createdAt'>): Promise<string> {
  const triggerId = `trigger-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const fullTrigger: OutreachTrigger = {
    ...trigger,
    id: triggerId,
    createdAt: new Date(),
  };

  // Publish to Pub/Sub (async, non-blocking)
  await topic.publishMessage({
    data: Buffer.from(JSON.stringify(fullTrigger)),
    attributes: {
      userId: trigger.userId,
      type: trigger.type,
      priority: trigger.priority,
    },
  });

  return triggerId;
}
```

**What stays in voice agent**:
- Session integration (`analyzeSessionForOutreach`, `extractCommitments`)
- Trigger detection logic
- Context updates during conversation

**What moves out**:
- Decision engine processing
- Delivery infrastructure
- Analytics aggregation
- A/B test evaluation

### 2. Outreach Worker (Cloud Run Job)

**Responsibility**: Process triggers, make decisions, schedule delivery

**Deployment**: Cloud Run Job (scheduled every 5 minutes)

```yaml
# cloudbuild-outreach-worker.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'Dockerfile.outreach', '-t', 'gcr.io/$PROJECT_ID/outreach-worker', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/outreach-worker']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args:
      - 'run'
      - 'jobs'
      - 'update'
      - 'outreach-worker'
      - '--image'
      - 'gcr.io/$PROJECT_ID/outreach-worker'
      - '--region'
      - 'us-central1'
      - '--max-retries'
      - '3'
```

**Processing Logic**:
```typescript
// src/workers/outreach/processor.ts (NEW)
export async function processPendingTriggers(): Promise<void> {
  // Pull messages from Pub/Sub (max 100 per batch)
  const subscription = pubsub.subscription('outreach-triggers-sub');
  const [messages] = await subscription.pull({ maxMessages: 100 });

  for (const message of messages) {
    const trigger = JSON.parse(message.data.toString()) as OutreachTrigger;

    try {
      // 1. Make decision
      const decision = await evaluateTrigger(trigger);

      if (decision.shouldSend) {
        // 2. Schedule delivery via Cloud Tasks
        await scheduleDelivery({
          trigger,
          decision,
          deliverAt: decision.optimalTime,
        });
      }

      // 3. Update trigger status in Firestore
      await updateTriggerStatus(trigger.id, decision.shouldSend ? 'scheduled' : 'rejected');

      // 4. Ack the message
      message.ack();
    } catch (error) {
      // NACK for retry
      message.nack();
    }
  }
}
```

### 3. Delivery Workers (Cloud Run Services)

**Responsibility**: Execute actual delivery via external services

**Why separate services?**:
- Different rate limits (Twilio vs SendGrid)
- Independent scaling per channel
- Isolated failure domains
- Channel-specific retry logic

```
┌────────────────────────────────────────────────────────────────┐
│              SMS Delivery Worker                               │
│  POST /deliver                                                 │
│  - Validates phone number                                      │
│  - Checks Twilio rate limits                                   │
│  - Sends via Twilio API                                        │
│  - Records delivery status                                     │
│  Trigger: Cloud Tasks HTTP target                              │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              Email Delivery Worker                             │
│  POST /deliver                                                 │
│  - Validates email                                             │
│  - Checks SendGrid rate limits                                 │
│  - Generates HTML from template                                │
│  - Sends via SendGrid/Resend                                   │
│  - Tracks opens/clicks                                         │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              Call Delivery Worker                              │
│  POST /initiate                                                │
│  - Creates LiveKit room for outbound call                      │
│  - Initiates SIP trunk connection                              │
│  - Spawns conversational agent                                 │
│  - Handles voicemail detection                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              Push Delivery Worker                              │
│  POST /deliver                                                 │
│  - Looks up FCM tokens                                         │
│  - Sends via Firebase Cloud Messaging                          │
│  - Handles token invalidation                                  │
└────────────────────────────────────────────────────────────────┘
```

### 4. Scheduled Jobs

**Cloud Scheduler triggers for maintenance tasks**:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `outreach-worker` | Every 5 min | Process pending triggers |
| `outreach-maintenance` | Daily 3am | Cleanup old triggers, prune history |
| `outreach-analytics` | Daily 4am | Aggregate daily analytics |
| `thinking-of-you` | Every 4 hours | Evaluate users for random outreach |

---

## Data Flow

### Trigger Lifecycle

```
1. DETECTION (Voice Agent)
   User says: "I'll start exercising tomorrow morning"
   → analyzeSessionForOutreach() detects commitment
   → publishTrigger({ type: 'commitment_check', ... })

2. QUEUING (Pub/Sub)
   Message stored with ordering key (userId)
   → Delivery guarantee
   → At-least-once semantics

3. PROCESSING (Outreach Worker)
   Pull from subscription
   → Decision: Should we check in?
   → Timing: When is optimal?
   → Channel: SMS, email, or push?
   → Message: Generate in persona voice

4. SCHEDULING (Cloud Tasks)
   Create task with scheduled time
   → HTTP target: delivery worker
   → Automatic retry on failure

5. DELIVERY (Delivery Worker)
   Receive task
   → Send via Twilio/SendGrid/FCM
   → Update status in Firestore
   → Record analytics event

6. TRACKING (Webhooks)
   Twilio/SendGrid status callback
   → Update delivery status
   → Trigger response tracking
```

### State Management

**Firestore Collections** (unchanged structure, new usage pattern):

```typescript
// Trigger states now tracked by workers
type TriggerStatus =
  | 'pending'      // In Pub/Sub, not yet processed
  | 'scheduled'    // Decision made, in Cloud Tasks queue
  | 'processing'   // Delivery worker picked it up
  | 'sent'         // Successfully delivered
  | 'failed'       // Delivery failed after retries
  | 'rejected'     // Decision engine said "don't send"
  | 'expired';     // Timed out before delivery
```

---

## Migration Plan

### Phase 1: Decouple (Week 1)
- [x] Disable outreach in voice agent (`global-services.ts`)
- [ ] Create `trigger-publisher.ts` using Pub/Sub
- [ ] Update session integration to use publisher
- [ ] Deploy voice agent without outreach overhead

### Phase 2: Worker Infrastructure (Week 2)
- [ ] Create `Dockerfile.outreach` for worker
- [ ] Implement `outreach-worker` Cloud Run Job
- [ ] Set up Pub/Sub topic and subscription
- [ ] Create Cloud Scheduler job (5 min intervals)

### Phase 3: Delivery Workers (Week 3)
- [ ] Extract SMS delivery to standalone service
- [ ] Extract email delivery to standalone service
- [ ] Set up Cloud Tasks queue
- [ ] Configure delivery scheduling

### Phase 4: Verification & Cleanup (Week 4)
- [ ] Monitor trigger processing latency
- [ ] Verify delivery success rates
- [ ] Remove deprecated code from voice agent
- [ ] Update monitoring dashboards

---

## Infrastructure Requirements

### Google Cloud Resources

```terraform
# Pub/Sub
resource "google_pubsub_topic" "outreach_triggers" {
  name = "outreach-triggers"
}

resource "google_pubsub_subscription" "outreach_triggers_sub" {
  name  = "outreach-triggers-sub"
  topic = google_pubsub_topic.outreach_triggers.name

  ack_deadline_seconds = 60
  message_retention_duration = "604800s"  # 7 days

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

# Cloud Tasks
resource "google_cloud_tasks_queue" "outreach_delivery" {
  name     = "outreach-delivery"
  location = "us-central1"

  rate_limits {
    max_concurrent_dispatches = 10
    max_dispatches_per_second = 5
  }

  retry_config {
    max_attempts = 5
    min_backoff = "1s"
    max_backoff = "300s"
  }
}

# Cloud Scheduler
resource "google_cloud_scheduler_job" "outreach_worker" {
  name     = "outreach-worker-trigger"
  schedule = "*/5 * * * *"  # Every 5 minutes

  http_target {
    uri         = "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project}/jobs/outreach-worker:run"
    http_method = "POST"
  }
}
```

### Cost Estimate

| Resource | Usage | Monthly Cost |
|----------|-------|--------------|
| Cloud Run Job (outreach-worker) | 288 runs/day × 30s each | ~$5 |
| Cloud Run Services (delivery) | ~10k requests/day | ~$10 |
| Pub/Sub | ~50k messages/day | ~$2 |
| Cloud Tasks | ~10k tasks/day | ~$1 |
| Cloud Scheduler | 4 jobs | ~$1 |
| **Total** | | **~$19/month** |

---

## Benefits

### Voice Agent
- **Faster cold starts**: No trigger loading on startup
- **Lower memory**: ~500MB instead of 3.7GB
- **Better reliability**: Outreach failures don't affect voice

### Outreach System
- **Independent scaling**: Scale workers based on queue depth
- **Fault isolation**: Channel failures don't cascade
- **Observability**: Clear queue depths, processing times
- **Testability**: Workers can be tested in isolation

### Operations
- **Cost efficiency**: Pay only when processing
- **Monitoring**: Clear metrics per stage
- **Debugging**: Trace triggers through system

---

## Monitoring & Alerts

### Key Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| `outreach_queue_depth` | Pub/Sub | > 1000 messages |
| `trigger_processing_latency_p99` | Worker | > 30s |
| `delivery_success_rate` | Workers | < 95% |
| `delivery_worker_error_rate` | Cloud Run | > 5% |

### Dashboards

1. **Outreach Pipeline Health**
   - Queue depth over time
   - Processing throughput
   - Delivery success by channel

2. **User Experience**
   - Time from trigger to delivery
   - Response rates by trigger type
   - Optimal timing accuracy

---

## Open Questions

1. **Batching**: Should workers process triggers in batches or one at a time?
   - Recommendation: Batches of 10-50 for efficiency

2. **Ordering**: Does trigger order matter per user?
   - Recommendation: Yes, use Pub/Sub ordering keys

3. **Deduplication**: How to handle duplicate triggers?
   - Recommendation: Idempotency key in Firestore

4. **Rate Limiting**: How to respect per-user outreach limits?
   - Recommendation: Check limits in decision engine, before scheduling

---

## References

- [Current Outreach Code](../../src/services/outreach/)
- [Cloud Run Jobs Documentation](https://cloud.google.com/run/docs/create-jobs)
- [Pub/Sub Best Practices](https://cloud.google.com/pubsub/docs/best-practices)
- [Cloud Tasks Documentation](https://cloud.google.com/tasks/docs)
