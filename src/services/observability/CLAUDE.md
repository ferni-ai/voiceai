# Observability Service

> **We believe in making AI human, and the decisions we make will reflect that.**

The observability module provides comprehensive metrics, health monitoring, and alerting for the Ferni platform. It enables real-time visibility into system health and performance.

---

## Architecture Level

Observability is at **Level 60** (Services layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/observability/    ← THIS LAYER
Level 30:  memory/
Level 10:  config/, utils/, types/
```

---

## Directory Structure

```
observability/
├── index.ts              # Main exports
├── hub.ts                # Central observability hub
├── llm-health.ts         # LLM API health metrics
├── connection-health.ts  # WebRTC/LiveKit connection health
├── ux-quality.ts         # User experience metrics
├── memory-health.ts      # Memory/RAG system health
├── cost-tracking.ts      # API cost tracking
├── error-recovery.ts     # Error and recovery metrics
├── persona-health.ts     # Persona performance metrics
├── resilience-metrics.ts # Workers, queues, circuits
└── finops.ts             # Financial operations metrics
```

---

## API Endpoints

All metrics are exposed via `/api/observability/*`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/observability` | GET | Full observability snapshot |
| `/api/observability/llm` | GET | LLM health metrics |
| `/api/observability/connection` | GET | Connection health |
| `/api/observability/ux` | GET | UX quality metrics |
| `/api/observability/memory` | GET | Memory/RAG metrics |
| `/api/observability/cost` | GET | Cost tracking |
| `/api/observability/errors` | GET | Error & recovery |
| `/api/observability/personas` | GET | Persona health |
| `/api/observability/resilience` | GET | Resilience metrics |
| `/api/observability/self-healing` | GET | Self-healing dashboard |
| `/api/observability/intelligence` | GET | Collective learning |
| `/api/observability/alerts` | GET | Recent alerts |
| `/api/observability/clear` | POST | Clear metrics (admin) |

---

## Core Components

### Observability Hub

Central coordinator for all metrics:

```typescript
import { observabilityHub } from './observability/index.js';

// Get full snapshot
const snapshot = observabilityHub.getSnapshot(windowMinutes);

// Get recent alerts
const alerts = observabilityHub.getRecentAlerts(50);

// Clear metrics
observabilityHub.clearAlerts();
```

### LLM Health Metrics

```typescript
import { llmHealthMetrics } from './observability/index.js';

// Record LLM call
llmHealthMetrics.recordCall({
  provider: 'google',
  model: 'gemini-2.0-flash',
  latencyMs: 450,
  tokensIn: 100,
  tokensOut: 250,
  success: true,
});

// Get snapshot
const health = llmHealthMetrics.getSnapshot(60);
// { avgLatencyMs: 420, successRate: 0.98, callsPerMinute: 15 }
```

### Connection Health

```typescript
import { connectionHealthMetrics } from './observability/index.js';

// Record connection event
connectionHealthMetrics.recordConnection({
  sessionId,
  event: 'connected',
  latencyMs: 150,
});

// Record disconnection
connectionHealthMetrics.recordDisconnection({
  sessionId,
  reason: 'user_hangup',
  duration: 300000,
});
```

### UX Quality Metrics

```typescript
import { uxQualityMetrics } from './observability/index.js';

// Record user experience event
uxQualityMetrics.recordEvent({
  type: 'turn_complete',
  latencyMs: 800,
  satisfaction: 'positive',
});

// Get UX health
const ux = uxQualityMetrics.getSnapshot(60);
// { avgTurnLatency: 750, satisfactionScore: 0.92 }
```

### Cost Tracking

```typescript
import { costMetrics } from './observability/index.js';

// Record API cost
costMetrics.recordCost({
  service: 'gemini',
  cost: 0.0025,
  tokens: 500,
});

// Get cost summary
const costs = costMetrics.getSnapshot();
// { totalCost: 12.50, byService: { gemini: 8.00, cartesia: 4.50 } }
```

### Resilience Metrics

```typescript
import { resilienceMetrics } from './observability/index.js';

// Record worker event
resilienceMetrics.recordWorkerEvent('embedding-worker', 'job_processed');

// Record cleanup event
resilienceMetrics.recordCleanupEvent('session-cleanup', 'success');

// Record queue depth
resilienceMetrics.recordQueueDepth('outreach-queue', 45);

// Get resilience snapshot
const resilience = resilienceMetrics.getSnapshot();
```

---

## Alerting

### Alert Levels

| Level | Threshold | Action |
|-------|-----------|--------|
| `info` | Normal operation | Log only |
| `warning` | Degraded performance | Log + dashboard |
| `critical` | Service impact | Log + notification |

### Creating Alerts

```typescript
observabilityHub.createAlert({
  level: 'warning',
  category: 'llm',
  message: 'LLM latency above threshold',
  details: { avgLatency: 2500 },
});
```

---

## Dashboard Integration

Metrics are consumed by:
- Admin dashboard (`apps/web/src/admin/`)
- Grafana (via `/api/observability` endpoint)
- Alerting systems

---

## Testing

```bash
# Run observability tests
pnpm vitest run src/services/observability/__tests__/
```

---

## Rules

### Do
- Use typed metrics (not raw counters)
- Include context (userId, sessionId) when relevant
- Set appropriate time windows for snapshots
- Create alerts for actionable issues

### Don't
- Log PII in metrics
- Create high-cardinality labels
- Skip error handling in metric recording
- Alert on transient issues

---

*Last updated: December 2024*
