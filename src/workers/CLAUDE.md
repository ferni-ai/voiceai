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
├── audio-analysis-worker-thread.ts # Audio worker thread (Node worker_threads)
├── embedding-worker.ts       # Vector embedding generation
├── outreach-worker.ts        # Proactive outreach delivery
├── predictions-worker.ts     # Predictive insights processing
├── summarization-worker.ts   # Conversation summarization
├── trust-worker.ts           # Trust metric calculations
├── memory-maintenance-worker.ts # Memory maintenance background worker
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
  new Promise((_, reject) => setTimeout(() => reject(new Error('Worker startup timeout')), 30000)),
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
  new MyWorker(config), // Add here
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

### Persistent Workers (Event-Driven)

These workers run continuously, subscribing to AsyncEvents and processing in real-time:

| Worker                | Purpose                      | Queue                 | Started With |
| --------------------- | ---------------------------- | --------------------- | ------------ |
| `EmbeddingWorker`     | Generate vector embeddings   | `embedding-queue`     | `startAllWorkers()` |
| `SummarizationWorker` | Summarize conversations      | `summarization-queue` | `startAllWorkers()` |
| `AnalyticsWorker`     | Process usage analytics      | `analytics-queue`     | `startAllWorkers()` |
| `PredictionsWorker`   | Generate predictive insights | `predictions-queue`   | `startAllWorkers()` |
| `TrustWorker`         | Calculate trust metrics      | `trust-queue`         | `startAllWorkers()` |
| `AudioAnalysisPool`   | Analyze audio for emotion    | In-memory pool        | `startAllWorkers()` |

### Batch Workers (Cloud Run Jobs)

These workers run on a schedule, process a batch, then exit:

| Worker                | Purpose                      | Schedule              | Entry Point |
| --------------------- | ---------------------------- | --------------------- | ----------- |
| `OutreachWorker`      | Deliver proactive messages   | Every 5 min (cron)    | `processPendingTriggers()` |

**Important**: Batch workers are NOT started by `startAllWorkers()`. They run as separate Cloud Run Jobs triggered by Cloud Scheduler.

---

## Monitoring

### Resilience Metrics

```typescript
import { resilienceMetrics } from '../services/observability/index.js';

// Track worker events
resilienceMetrics.recordWorkerEvent('embedding-worker', 'job_processed');
resilienceMetrics.recordWorkerEvent('embedding-worker', 'job_failed');
```

### Health Endpoints

```
GET /health/ready
{
  "ready": true,
  "workersAvailable": true,
  "readyWorkerCount": 3,
  "uptime": 45000
}

GET /health/workers
{
  "status": "healthy",
  "workers": {
    "trust": { "messagesReceived": 100, "messagesProcessed": 98, "messagesFailed": 2 },
    "analytics": { "messagesReceived": 500, "messagesProcessed": 500, "messagesFailed": 0 },
    "predictions": { "messagesReceived": 200, "messagesProcessed": 195, "messagesFailed": 5 },
    "embedding": { "messagesReceived": 1000, "messagesProcessed": 1000, "messagesFailed": 0 },
    "summarization": { "messagesReceived": 50, "messagesProcessed": 48, "messagesFailed": 2 }
  },
  "asyncEvents": {
    "queueLength": 15,
    "emitted": 1850,
    "processed": 1835,
    "errors": 7,
    "dropped": 0
  }
}

GET /api/workers/stats (detailed stats via API routes)
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

*Last updated: January 2026*
