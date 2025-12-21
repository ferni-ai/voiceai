# Workers

> **We believe in making AI human, and the decisions we make will reflect that.**

The workers module contains background processing jobs that run asynchronously from the main request flow. Workers handle CPU-intensive or long-running tasks like embeddings, summarization, analytics, and outreach.

---

## Architecture Level

Workers are at **Level 60** (Services layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/, workers/    ← THIS LAYER
Level 30:  memory/
Level 10:  config/, utils/, types/
```

---

## Directory Structure

```
workers/
├── index.ts                  # Worker initialization & management
├── server.ts                 # Worker HTTP server (health checks)
├── base-worker.ts            # Base class for all workers
├── analytics-worker.ts       # Usage analytics processing
├── audio-analysis-pool.ts    # Audio processing pool
├── embedding-worker.ts       # Vector embedding generation
├── outreach-worker.ts        # Proactive outreach delivery
├── predictions-worker.ts     # Predictive insights processing
├── summarization-worker.ts   # Conversation summarization
├── trust-worker.ts           # Trust metric calculations
└── __tests__/                # Worker tests
```

---

## Worker Lifecycle

### Initialization

```typescript
import { startAllWorkers, stopAllWorkers } from './workers/index.js';

// Start with 30s timeout (prevents deploy hangs)
await Promise.race([
  startAllWorkers(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Worker startup timeout')), 30000)
  )
]);
```

### Health Checks

Workers expose readiness via `/health/ready`:

```typescript
// Ready when at least one worker is accepting jobs
{
  "ready": true,
  "workers": [
    { "id": "embedding-1", "ready": true, "jobsProcessed": 150 },
    { "id": "summarization-1", "ready": true, "jobsProcessed": 42 }
  ]
}
```

---

## Creating a New Worker

### 1. Extend BaseWorker

```typescript
import { BaseWorker, WorkerConfig } from './base-worker.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'MyWorker' });

interface MyJob {
  userId: string;
  data: string;
}

export class MyWorker extends BaseWorker<MyJob> {
  constructor(config: WorkerConfig) {
    super({
      name: 'my-worker',
      concurrency: 5,
      pollInterval: 1000,
      ...config,
    });
  }

  async processJob(job: MyJob): Promise<void> {
    log.info({ userId: job.userId }, 'Processing job');

    // Do the work
    await doExpensiveOperation(job.data);

    log.info({ userId: job.userId }, 'Job complete');
  }
}
```

### 2. Register in index.ts

```typescript
import { MyWorker } from './my-worker.js';

const workers = [
  new EmbeddingWorker(config),
  new SummarizationWorker(config),
  new MyWorker(config),  // Add here
];
```

---

## Job Queue Patterns

### Pub/Sub Integration

```typescript
import { publishJob } from '../services/pubsub/index.js';

// Enqueue a job
await publishJob('embedding-queue', {
  userId: 'user123',
  texts: ['text to embed'],
});
```

### Backpressure

Workers implement backpressure to prevent overload:

```typescript
const MAX_QUEUE_DEPTH = 1000;

if (queue.length >= MAX_QUEUE_DEPTH) {
  log.warn({ queueDepth: queue.length }, 'Backpressure: dropping job');
  return { accepted: false, reason: 'queue_full' };
}
```

---

## Worker Types

| Worker | Purpose | Queue |
|--------|---------|-------|
| `EmbeddingWorker` | Generate vector embeddings | `embedding-queue` |
| `SummarizationWorker` | Summarize conversations | `summarization-queue` |
| `AnalyticsWorker` | Process usage analytics | `analytics-queue` |
| `OutreachWorker` | Deliver proactive messages | `outreach-queue` |
| `PredictionsWorker` | Generate predictive insights | `predictions-queue` |
| `TrustWorker` | Calculate trust metrics | `trust-queue` |
| `AudioAnalysisPool` | Analyze audio for emotion | In-memory pool |

---

## Monitoring

### Resilience Metrics

```typescript
import { resilienceMetrics } from '../services/observability/index.js';

// Track worker events
resilienceMetrics.recordWorkerEvent('embedding-worker', 'job_processed');
resilienceMetrics.recordWorkerEvent('embedding-worker', 'job_failed');
```

### Health Endpoint

```
GET /health/ready
{
  "ready": true,
  "workersAvailable": true,
  "readyWorkerCount": 3,
  "uptime": 45000
}
```

---

## Testing

```bash
# Run worker tests
pnpm vitest run src/workers/__tests__/

# Test with Pub/Sub emulator
PUBSUB_EMULATOR_HOST=localhost:8085 pnpm vitest run src/workers/
```

---

## Rules

### Do
- Extend `BaseWorker` for new workers
- Implement backpressure (max queue depth)
- Log job start/complete with userId
- Handle graceful shutdown
- Report metrics to observability

### Don't
- Block the main thread with CPU work
- Skip error handling in `processJob()`
- Ignore queue depth limits
- Use sync operations for I/O
- Forget to register in `index.ts`

---

*Last updated: December 2024*
