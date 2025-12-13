# Ferni Microservices Architecture

> Future-proof architecture for scaling Ferni to millions of users

## Current State (Monolith)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Voice Agent (Cloud Run)                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ LiveKit │ │ Personas│ │  Trust  │ │Analytics│ │ Context │   │
│  │  Agent  │ │  System │ │ Systems │ │ Engine  │ │ Builder │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  Speech │ │Humanize │ │  Tools  │ │ Memory  │ │  Games  │   │
│  │ Services│ │  Engine │ │  System │ │  Store  │ │ Engine  │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    Firestore    │
                    │  (everything)   │
                    └─────────────────┘
```

**Problems:**
- Cold starts are slow (all services load together)
- Single point of failure
- Can't scale components independently
- Memory pressure from unused services

---

## Target State (Microservices)

```
                           ┌─────────────┐
                           │   Frontend  │
                           │ (Firebase)  │
                           └──────┬──────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      API Gateway          │
                    │   (Firebase Hosting)      │
                    └─────────────┬─────────────┘
                                  │
        ┌───────────────┬─────────┴────────┬───────────────┐
        │               │                  │               │
        ▼               ▼                  ▼               ▼
┌───────────────┐ ┌───────────┐ ┌───────────────┐ ┌───────────────┐
│ Voice Agent   │ │  Context  │ │    Trust      │ │   Analytics   │
│ (Cloud Run)   │ │  Service  │ │   Service     │ │   Service     │
│               │ │(Cloud Run)│ │ (Cloud Run)   │ │ (Cloud Run)   │
│ - LiveKit     │ │           │ │               │ │               │
│ - STT/TTS     │ │ - RAG     │ │ - Milestones  │ │ - Community   │
│ - Personas    │ │ - Memory  │ │ - Boundaries  │ │ - Evolution   │
│               │ │ - Context │ │ - Growth      │ │ - Patterns    │
└───────┬───────┘ └─────┬─────┘ └───────┬───────┘ └───────┬───────┘
        │               │               │                 │
        └───────────────┴───────┬───────┴─────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │      Pub/Sub          │
                    │  (Event Bus)          │
                    └───────────┬───────────┘
                                │
        ┌───────────────┬───────┴───────┬───────────────┐
        │               │               │               │
        ▼               ▼               ▼               ▼
┌───────────────┐ ┌───────────┐ ┌───────────────┐ ┌───────────────┐
│    User DB    │ │  Vector   │ │   Trust DB    │ │  Analytics    │
│  (Firestore)  │ │   Store   │ │ (Firestore)   │ │    (BQ)       │
│               │ │(Pinecone) │ │               │ │               │
└───────────────┘ └───────────┘ └───────────────┘ └───────────────┘
```

---

## Service Definitions

### 1. Voice Agent Service
**Responsibility:** Real-time voice interaction only

```yaml
name: voiceai-agent
memory: 2Gi
cpu: 2
min-instances: 1
max-instances: 100

endpoints:
  - LiveKit WebSocket (voice)
  - /health

dependencies:
  - context-service (gRPC)
  - LiveKit Cloud
  - Cartesia TTS
  - Gemini STT
```

**What stays here:**
- LiveKit agent orchestration
- Real-time STT/TTS
- Persona loading (cached)
- Greeting generation

**What moves out:**
- Trust system updates → Trust Service
- Analytics → Analytics Service
- Context building → Context Service

### 2. Context Service
**Responsibility:** Build conversation context with RAG

```yaml
name: ferni-context
memory: 1Gi
cpu: 1
min-instances: 0
max-instances: 20

endpoints:
  - POST /context/build
  - POST /context/search
  - GET /context/user/:userId

dependencies:
  - Vector store (Pinecone/Firestore)
  - User DB (Firestore)
```

**API:**
```typescript
// Build context for a turn
POST /context/build
{
  userId: string;
  userMessage: string;
  personaId: string;
  sessionId: string;
}
→ {
  injections: ContextInjection[];
  relevantMemories: Memory[];
  emotionalContext: EmotionalState;
}

// Semantic search
POST /context/search
{
  query: string;
  userId: string;
  limit?: number;
}
→ {
  results: SearchResult[];
}
```

### 3. Trust Service
**Responsibility:** Trust systems & relationship tracking

```yaml
name: ferni-trust
memory: 512Mi
cpu: 1
min-instances: 0
max-instances: 10

endpoints:
  - POST /trust/update
  - POST /trust/milestone
  - GET /trust/profile/:userId
  - Pub/Sub subscriber

dependencies:
  - Trust DB (Firestore)
```

**Events consumed:**
- `conversation:end`
- `trust:update`
- `relationship:stage-change`

### 4. Analytics Service
**Responsibility:** Learning, patterns, community insights

```yaml
name: ferni-analytics
memory: 512Mi
cpu: 1
min-instances: 0
max-instances: 10

endpoints:
  - POST /analytics/record
  - GET /analytics/patterns/:personaId
  - Pub/Sub subscriber

dependencies:
  - BigQuery (analytics)
  - Firestore (patterns)
```

**Events consumed:**
- `analytics:interaction`
- `learning:pattern-detected`
- `conversation:turn`

---

## Communication Patterns

### Synchronous (gRPC/HTTP)
For latency-sensitive operations:

```
Voice Agent ──gRPC──▶ Context Service
                      (during turn processing)
```

### Asynchronous (Pub/Sub)
For non-critical operations:

```
Voice Agent ──publish──▶ Pub/Sub ──subscribe──▶ Trust Service
                                  ──subscribe──▶ Analytics Service
```

### Event Types

```typescript
// Core events
conversation:start    // New session
conversation:end      // Session ended
conversation:turn     // Each turn

// Trust events  
trust:update          // Incremental update
trust:milestone       // Achievement
relationship:stage-change

// Analytics events
analytics:interaction // User interaction
analytics:emotion-detected
learning:pattern-detected
```

---

## Migration Path

### Phase 1: Current (In-Process Workers)
```
Voice Agent
├── AsyncEvents (in-memory queue)
├── TrustWorker (local)
└── AnalyticsWorker (local)
```

### Phase 2: Pub/Sub Workers
```
Voice Agent ──▶ Pub/Sub
                  ├──▶ Trust Worker (same container)
                  └──▶ Analytics Worker (same container)
```

### Phase 3: Separate Services
```
Voice Agent ──▶ Pub/Sub
                  ├──▶ Trust Service (separate Cloud Run)
                  └──▶ Analytics Service (separate Cloud Run)
```

### Phase 4: Full Microservices
```
Voice Agent ──gRPC──▶ Context Service
            ──Pub/Sub──▶ Trust Service
            ──Pub/Sub──▶ Analytics Service
```

---

## Infrastructure Requirements

### Pub/Sub Topics

```bash
# Create topics
gcloud pubsub topics create ferni-events
gcloud pubsub topics create ferni-trust
gcloud pubsub topics create ferni-analytics

# Create subscriptions
gcloud pubsub subscriptions create ferni-trust-sub \
  --topic=ferni-events \
  --filter='attributes.type="trust:*"'

gcloud pubsub subscriptions create ferni-analytics-sub \
  --topic=ferni-events \
  --filter='attributes.type="analytics:*"'
```

### Service Accounts

```yaml
# Voice Agent
roles:
  - pubsub.publisher
  - firestore.user (read-only)
  - run.invoker (for context service)

# Context Service  
roles:
  - firestore.user
  - aiplatform.user (for embeddings)

# Trust Service
roles:
  - firestore.user
  - pubsub.subscriber

# Analytics Service
roles:
  - bigquery.dataEditor
  - pubsub.subscriber
```

### Cloud Run Services

```bash
# Deploy context service
gcloud run deploy ferni-context \
  --image gcr.io/johnb-2025/ferni-context \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 20 \
  --region us-central1

# Deploy trust service
gcloud run deploy ferni-trust \
  --image gcr.io/johnb-2025/ferni-trust \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --region us-central1
```

---

## Cost Optimization

### Current (Monolith)
- 1 Cloud Run service
- 4GB memory per instance
- ~$200/month at moderate traffic

### Target (Microservices)
| Service | Memory | Min | Max | Est. Cost |
|---------|--------|-----|-----|-----------|
| Voice Agent | 2Gi | 1 | 100 | $150/mo |
| Context | 1Gi | 0 | 20 | $30/mo |
| Trust | 512Mi | 0 | 10 | $10/mo |
| Analytics | 512Mi | 0 | 10 | $10/mo |
| **Total** | | | | **$200/mo** |

**Benefits:**
- Scale components independently
- Pay only for what's used
- Faster cold starts per service

---

## Next Steps

1. **Immediate:** Enable AsyncEvents in voice agent
2. **Week 1:** Deploy workers as in-process (Phase 1)
3. **Week 2:** Set up Pub/Sub topics and test
4. **Week 3:** Extract Context Service (biggest latency win)
5. **Month 2:** Extract Trust & Analytics Services

---

## Files Created

```
src/
├── services/
│   └── async-events/
│       └── index.ts          # Event bus
├── workers/
│   ├── index.ts              # Worker management
│   ├── base-worker.ts        # Base class
│   ├── trust-worker.ts       # Trust processing
│   └── analytics-worker.ts   # Analytics processing
├── agents/
│   └── shared/
│       └── lazy-loader.ts    # Deferred imports
└── docs/
    └── MICROSERVICES-ARCHITECTURE.md  # This doc
```

