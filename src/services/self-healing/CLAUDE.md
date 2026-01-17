# Self-Healing Service

> **We believe in making AI human, and the decisions we make will reflect that.**

The self-healing module provides automatic error recovery, circuit breakers, anomaly detection, and system resilience patterns. It enables the system to detect and recover from failures without human intervention.

---

## Architecture Level

Self-healing is at **Level 60** (Services layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/self-healing/    ← THIS LAYER
Level 30:  memory/
Level 10:  config/, utils/, types/
```

---

## Directory Structure

```
self-healing/
├── index.ts               # Main exports
├── circuit-breaker.ts     # Circuit breaker implementation
├── circuit-alerting.ts    # Circuit state alerts
├── resilient-http.ts      # HTTP client with retries
├── resilient-executor.ts  # Generic resilient execution
├── health-monitors.ts     # Periodic health checks
├── anomaly-detection.ts   # Detect unusual patterns
├── session-recovery.ts    # Session state recovery
├── conversation-health.ts # Conversation quality monitoring
├── error-humanizer.ts     # User-friendly error messages
├── ai-diagnostics.ts      # AI-powered diagnostics
├── cloud-metrics.ts       # Cloud platform metrics
└── cloud-run-restart.ts   # Container restart logic
```

---

## Core Components

### Circuit Breaker

Prevents cascading failures by "breaking" on repeated errors:

```typescript
import { createCircuitBreaker, CircuitBreaker } from './self-healing/index.js';

const breaker = createCircuitBreaker('gemini-api', {
  failureThreshold: 3,      // Open after 3 failures
  recoveryTimeout: 60000,   // Wait 60s before half-open
  successThreshold: 2,      // Close after 2 successes
});

// Use the breaker
try {
  const result = await breaker.execute(async () => {
    return await callGeminiApi(prompt);
  });
} catch (error) {
  if (error.message === 'Circuit is open') {
    // Fail fast - don't even try
    return fallbackResponse();
  }
  throw error;
}

// Check state
const state = breaker.getState(); // 'closed' | 'open' | 'half_open'
```

### Circuit States

```
CLOSED ──(failures >= threshold)──> OPEN
   ^                                   │
   │                                   │
   └──(successes >= threshold)── HALF_OPEN <──(recovery timeout)──┘
```

### Resilient HTTP Client

HTTP client with automatic retries and circuit breaker:

```typescript
import { resilientFetch } from './self-healing/index.js';

const response = await resilientFetch('https://api.example.com/data', {
  method: 'POST',
  body: JSON.stringify(data),
  retries: 3,
  retryDelay: 1000,
  timeout: 5000,
});
```

### Health Monitors

Periodic health checks for critical services:

```typescript
import {
  startPeriodicHealthChecks,
  stopPeriodicHealthChecks,
  runAllHealthChecks,
} from './self-healing/index.js';

// Start monitoring (every 30 seconds)
startPeriodicHealthChecks(30000);

// Manual health check
const results = await runAllHealthChecks();
// [
//   { service: 'firestore', healthy: true, latencyMs: 45 },
//   { service: 'redis', healthy: true, latencyMs: 12 },
//   { service: 'livekit', healthy: true, latencyMs: 80 },
// ]

// Stop on shutdown
stopPeriodicHealthChecks();
```

### Anomaly Detection

Detects unusual patterns in metrics:

```typescript
import { AnomalyDetector } from './self-healing/index.js';

const detector = new AnomalyDetector({
  windowSize: 100,
  threshold: 2.5,  // Standard deviations
});

// Record data points
detector.record('latency', 450);
detector.record('latency', 480);
detector.record('latency', 2500);  // Anomaly!

// Check for anomalies
const anomalies = detector.getAnomalies();
// [{ metric: 'latency', value: 2500, deviation: 3.2 }]
```

### Session Recovery

Recover session state after disconnection:

```typescript
import { SessionRecovery } from './self-healing/index.js';

const recovery = new SessionRecovery();

// Save checkpoint
await recovery.saveCheckpoint(sessionId, {
  lastTurn: turnData,
  context: conversationContext,
});

// Recover after reconnect
const restored = await recovery.recover(sessionId);
if (restored) {
  // Resume from checkpoint
}
```

### Error Humanizer

Convert technical errors to user-friendly messages:

```typescript
import { humanizeError } from './self-healing/index.js';

try {
  await riskyOperation();
} catch (error) {
  const friendlyMessage = humanizeError(error);
  // "I'm having trouble connecting right now. Let me try again."
}
```

---

## Exported Functions

```typescript
import {
  // Circuit breakers
  createCircuitBreaker,
  getAllCircuitStats,
  getAllClientStats,
  getUnhealthyClients,

  // Health monitoring
  startPeriodicHealthChecks,
  stopPeriodicHealthChecks,
  runAllHealthChecks,

  // Anomaly detection
  getAnomalyHistory,

  // Recovery
  getRestartHistory,
} from './services/self-healing/index.js';
```

---

## Integration with Observability

Self-healing metrics are exposed via:

```
GET /api/observability/self-healing
{
  "overallHealth": "healthy",
  "circuits": [...],
  "healthMonitors": [...],
  "anomalyHistory": [...],
  "restartHistory": [...],
  "stats": {
    "anomaliesLast5Min": 0,
    "autoHealsToday": 3,
    "uptimePercent": 0.998
  }
}
```

---

## Testing

```bash
# Run self-healing tests
pnpm vitest run src/services/self-healing/__tests__/
```

---

## Rules

### Do
- Use circuit breakers for external API calls
- Set appropriate thresholds for your use case
- Log circuit state changes
- Provide fallbacks when circuits open

### Don't
- Set thresholds too low (causes flapping)
- Ignore circuit breaker errors
- Skip health checks in production
- Assume services are always available

---

*Last updated: December 2024*
