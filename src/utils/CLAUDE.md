# Utilities

> **We believe in making AI human, and the decisions we make will reflect that.**

The utils module contains shared utility functions used across the codebase. These are low-level, stateless helpers that don't contain business logic.

---

## Architecture Level

Utils is at **Level 10** (Infrastructure layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/
Level 30:  memory/
Level 10:  config/, utils/, types/    ← THIS LAYER
```

**Import rules:** Utils can only import from types. All other layers can import from utils.

---

## Key Utilities

### Logging

```typescript
import { createLogger, getLogger } from '../utils/index.js';

// Create a namespaced logger
const log = createLogger({ module: 'MyModule' });

log.debug({ userId }, 'Processing request');
log.info({ result }, 'Operation completed');
log.warn({ attempt }, 'Retry needed');
log.error({ error: String(err) }, 'Operation failed');

// Or use the global logger
getLogger().info('Simple log');
```

**Rules:**
- Always use `createLogger` or `getLogger`, never `console.log`
- Include context object as first parameter
- Convert errors to strings: `{ error: String(err) }`

### Circuit Breaker

```typescript
import { getCircuitBreaker, CircuitOpenError } from '../utils/index.js';

const breaker = getCircuitBreaker('external-api', {
  failureThreshold: 3,
  resetTimeout: 60000,  // 1 minute
  successThreshold: 2,
});

try {
  const result = await breaker.execute(async () => {
    return await callExternalApi();
  });
} catch (error) {
  if (error instanceof CircuitOpenError) {
    // Service is unavailable, use fallback
  }
}

// For services layer to receive state changes:
import { registerCircuitBreakerCallback } from '../utils/index.js';

registerCircuitBreakerCallback((name, state, failures, successes, reason) => {
  // Record metrics, send alerts, etc.
});
```

### Rate Limiter

```typescript
import { RateLimiter, SlidingWindowLimiter } from '../utils/index.js';

// Token bucket limiter
const limiter = new RateLimiter({
  maxTokens: 100,
  refillRate: 10,
  refillInterval: 1000,  // 10 tokens per second
});

if (limiter.tryConsume()) {
  await makeRequest();
} else {
  throw new Error('Rate limited');
}

// Sliding window limiter (stricter)
const slidingLimiter = new SlidingWindowLimiter(100, 60000); // 100 requests per minute
```

### Request Coalescer

Prevents duplicate concurrent API calls by sharing in-flight request promises.

```typescript
import { getRequestCoalescer, hashContent, getAllCoalescerStats } from '../utils/index.js';

// Get or create a coalescer for embeddings
const coalescer = getRequestCoalescer<number[]>('embeddings', {
  pendingTtlMs: 60000,  // Max time to wait for a request (default: 60s)
  maxPending: 10000,    // Max concurrent pending requests (default: 10000)
  // Clone results to prevent mutation bugs when multiple callers share the result
  cloneResult: (arr) => [...arr],  // Optional - use for arrays/objects
});

// These concurrent calls will share the same API request
const [result1, result2] = await Promise.all([
  coalescer.execute(hashContent(text), () => embedApi.embed(text)),
  coalescer.execute(hashContent(text), () => embedApi.embed(text)),
]);
// Only 1 API call made, both get the same result (each gets a clone)

// Get stats for monitoring
const stats = coalescer.getStats();
// { totalRequests: 100, coalescedRequests: 80, actualExecutions: 20, coalesceRate: 0.8 }

// Get stats for all coalescers
const allStats = getAllCoalescerStats();
```

**Key behaviors:**
- Concurrent requests with same key share one in-flight promise
- TTL expiration marks entries as expired (new requests start fresh, existing waiters still get their result)
- Entry identity tracking prevents race conditions during cleanup
- Stats track coalesce rate for monitoring
- Optional `cloneResult` prevents mutation bugs when callers share results

**Observability Callbacks:**

```typescript
import { configureCoalescerMetrics, resetCoalescerMetrics } from '../utils/index.js';

// Configure global metrics callbacks for observability
configureCoalescerMetrics({
  // Called when a request is coalesced with an existing in-flight request
  onCoalesce: (name, key, waiterCount) => {
    prometheus.inc('coalescer_coalesced_total', { name });
  },
  // Called when a coalescer is approaching capacity (>80% full)
  onCapacityWarning: (name, current, max) => {
    logger.warn({ name, current, max }, 'Coalescer approaching capacity');
  },
  // Called when a request completes (success or error)
  onComplete: (name, key, durationMs, success) => {
    prometheus.observe('coalescer_duration_ms', durationMs, { name, success: String(success) });
  },
});

// Reset callbacks (for testing)
resetCoalescerMetrics();
```

**Two-layer caching for embeddings:**

| Function | Coalescing | Persistent Cache | Use When |
|----------|------------|------------------|----------|
| `embed()` | ✅ | ❌ | High-frequency concurrent calls |
| `embedCached()` | ✅ | ✅ (Redis/memory) | Need cross-session caching |

**Coalescers in the codebase:**

| Name | Location | Purpose |
|------|----------|---------|
| `embeddings` | `memory/embeddings.ts` | Embedding generation |
| `tool-domain-load` | `tools/registry/loader.ts` | Tool domain lazy loading |
| `semantic-router` | `tools/semantic-router/router.ts` | Routing query coalescing |
| `firestore-vector-search` | `memory/firestore-vector-store/core.ts` | Vector search coalescing |

### Async Utilities

```typescript
import { sleep, withTimeout, retry, parallelLimit } from '../utils/index.js';

// Sleep
await sleep(1000);  // 1 second

// Timeout
const result = await withTimeout(
  asyncOperation(),
  5000,  // 5 second timeout
  'Operation timed out'
);

// Retry with exponential backoff
const result = await retry(
  () => flakeyOperation(),
  {
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    onRetry: (err, attempt) => console.log(`Retry ${attempt}`)
  }
);

// Parallel execution with concurrency limit
const results = await parallelLimit(
  urls.map(url => () => fetch(url)),
  5  // Max 5 concurrent requests
);
```

### Safe Fire and Forget

```typescript
import { safeFireAndForget, fireAndForget } from '../utils/index.js';

// Safe wrapper for fire-and-forget operations
// Catches errors, logs them, tracks metrics
safeFireAndForget(
  () => processPatterns(userId, text),
  {
    context: 'pattern-detection',
    timeoutMs: 30000,
    critical: false,
  }
);

// Shorter convenience version
fireAndForget(() => analytics.track(event), 'analytics');
```

### Background Tasks

```typescript
import { runBackground, runBackgroundWithTimeout } from '../utils/index.js';

// Run with error logging
runBackground(
  sendNotification(userId),
  { task: 'sendNotification', userId }
);

// Run with timeout warning
runBackgroundWithTimeout(
  fetchExternalData(),
  5000,
  { task: 'fetchExternalData', source: 'api' }
);
```

### Session Registry

```typescript
import { createSessionRegistry, registerGlobalRegistry } from '../utils/index.js';

// Create a registry for your service
const userSessionRegistry = createSessionRegistry(
  (sessionId) => new UserSessionService(sessionId),
  {
    name: 'UserSession',
    cleanup: (service) => service.dispose(),
    verbose: true,
  }
);

// Register for global cleanup
registerGlobalRegistry(userSessionRegistry);

// Use it
const service = userSessionRegistry.get('session-123');
userSessionRegistry.reset('session-123');
userSessionRegistry.resetAll();
```

### Interval Manager

```typescript
import { registerInterval, clearAllIntervals, clearNamedInterval } from '../utils/index.js';

// Register a managed interval
const cancel = registerInterval(
  'cleanup-task',
  () => doCleanup(),
  60000  // Every minute
);

// Cancel specific interval
clearNamedInterval('cleanup-task');

// Cancel all on shutdown
clearAllIntervals();
```

### Lazy Service

```typescript
import { lazyService } from '../utils/index.js';

// Create a lazy-loaded service
const expensiveService = lazyService(
  async () => import('./expensive-service.js'),
  {
    name: 'expensive-service',
    preloadDelay: 30000,  // Preload after 30s
    debug: true,
  }
);

// Only initializes on first access
const service = await expensiveService();
```

**Note:** The `lazyServices` registry has moved to `src/services/lazy-registry.ts`.

### ID Generation

```typescript
import { generateId, generateShortId, getIdPrefix, hasIdPrefix, ID_PREFIXES } from '../utils/index.js';

// Generate a unique ID with optional prefix
const entityId = generateId('ent'); // "ent_a1b2c3d4-e5f6-7890-abcd-ef1234567890"

// Generate a short ID (8 chars) for session-scoped data
const shortId = generateShortId('sess'); // "sess_a1b2c3d4"

// Check ID prefixes
const prefix = getIdPrefix(entityId); // "ent"
const isEntity = hasIdPrefix(entityId, 'ent'); // true

// Standard prefixes
// ID_PREFIXES.ENTITY, .RELATIONSHIP, .FACT, .MENTION, .CORRELATION, etc.
```

### Async Singleton

```typescript
import { createAsyncSingleton, createNullableAsyncSingleton } from '../utils/index.js';

// Thread-safe async singleton - prevents race conditions during init
const getVertexClient = createAsyncSingleton(
  async () => {
    const { VertexAI } = await import('@google-cloud/vertexai');
    return new VertexAI({ project: 'my-project' });
  },
  { name: 'VertexAI' }
);

// All concurrent calls share the same initialization
const [client1, client2] = await Promise.all([
  getVertexClient(),
  getVertexClient(),
]);
// client1 === client2

// Nullable version - returns null on failure instead of throwing
const getOptionalClient = createNullableAsyncSingleton(
  async () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return null;
    return new Client({ apiKey });
  },
  { name: 'OptionalClient' }
);
```

### Validation & Sanitization

```typescript
import {
  isValidEmail, validateEmail, sanitizeEmailForLog,
  isValidPhone, validatePhone, normalizePhone, sanitizePhoneForLog,
  sanitizePlainText, sanitizeForSql,
  isValidStockSymbol, normalizeStockSymbol,
} from '../utils/index.js';

// Email validation
if (isValidEmail(email)) { ... }
const result = validateEmail(email); // { valid: boolean, error?: string }
const safeLog = sanitizeEmailForLog(email); // "jo***@example.com"

// Phone validation (E.164 format)
const normalized = normalizePhone('+1 555-123-4567'); // "+15551234567"
const safePrint = sanitizePhoneForLog(phone); // "+15****67"

// Text sanitization (prevent injection)
const cleanText = sanitizePlainText(userInput); // Removes control chars, angle brackets
const sqlSafe = sanitizeForSql(text); // Escapes single quotes

// Stock symbol validation
const symbol = normalizeStockSymbol('aapl'); // "AAPL"
```

### Firestore Utilities

```typescript
import { cleanForFirestore, removeUndefined, deepRemoveUndefined } from '../utils/index.js';

// Remove undefined values (Firestore doesn't accept undefined)
await docRef.set(removeUndefined({
  name: user.name,
  email: user.email,
  phone: user.phone, // might be undefined - will be filtered out
}));

// Deep clean for nested objects
await docRef.set(cleanForFirestore({
  user: {
    name: 'John',
    createdAt: new Date(),  // Converted to ISO string
    settings: {
      theme: undefined,  // Removed
      lang: 'en',
    }
  }
}));
```

### Performance Metrics

```typescript
import { startTimer, stopTimer, timeAsync, getMetricSummary, METRICS } from '../utils/index.js';

// Manual timing
const timerId = startTimer(METRICS.TURN_PROCESSING);
await processUserTurn();
const durationMs = stopTimer(timerId);

// Automatic timing
const result = await timeAsync(METRICS.CONTEXT_BUILDING, async () => {
  return await buildContext();
});

// Get summary
const summary = getMetricSummary(METRICS.TURN_PROCESSING);
// { count: 100, avgMs: 250, p95Ms: 450, p99Ms: 520 }
```

### DDoS Protection

```typescript
import {
  hardenServer,
  parseBodySafe,
  handleHealthEndpoint,
  createOAuthStateManager,
} from '../utils/index.js';

// Harden HTTP server
hardenServer(server);

// Safe body parsing with size limits
const body = await parseBodySafe(req, res, { maxSize: 1024 * 1024 });

// Rate-limited health endpoint
if (handleHealthEndpoint(req, res, pathname, 'my-service')) {
  return;
}

// Secure OAuth state management
const oauthStates = createOAuthStateManager();
const state = oauthStates.create({ userId: '123' });
const data = oauthStates.consume(state); // One-time use
```

---

## Directory Structure

```
utils/
├── index.ts                 # Main exports (USE THIS for imports)
├── CLAUDE.md                # This documentation
├── safe-logger.ts           # Structured logging
├── circuit-breaker.ts       # Circuit breaker pattern
├── rate-limiter.ts          # Token bucket & sliding window
├── request-coalescer.ts     # Request coalescing for deduplication
├── async.ts                 # Async helpers (sleep, timeout, retry)
├── safe-fire-and-forget.ts  # Safe fire-and-forget wrappers
├── background-task.ts       # Background task utilities
├── session-registry.ts      # Session state management
├── interval-manager.ts      # Managed intervals
├── lazy-service.ts          # Lazy initialization utility
├── firestore-utils.ts       # Firestore helpers
├── cleanup-patterns.ts      # Resource cleanup helpers
├── metrics.ts               # General metrics collection
├── performance-metrics.ts   # Performance tracking
├── cognitive-metrics.ts     # AI-specific metrics
├── ddos-protection.ts       # DDoS mitigation
└── __tests__/               # Unit tests
    ├── request-coalescer.test.ts
    ├── request-coalescer-edge-cases.test.ts
    └── safe-fire-and-forget.test.ts
```

---

## Callback Patterns (Architecture Compliance)

Utils layer cannot import from services. Use callback registration:

```typescript
// In utils/circuit-breaker.ts:
export function registerCircuitBreakerCallback(callback) { ... }

// In services/observability/resilience-metrics.ts:
import { registerCircuitBreakerCallback } from '../../utils/circuit-breaker.js';

registerCircuitBreakerCallback((name, state, failures, successes, reason) => {
  resilienceMetrics.recordCircuitBreakerEvent(name, state, failures, successes, reason);
});
```

---

## Adding New Utilities

1. Create file in `src/utils/`
2. Export from `index.ts`
3. Update this CLAUDE.md
4. Write tests in `src/utils/__tests__/`

### Utility Template

```typescript
/**
 * My Utility
 *
 * Brief description of what this utility does.
 *
 * @module utils/my-utility
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'my-utility' });

// Types
export interface MyOptions {
  name: string;
  timeout?: number;
}

// Main export
export function myUtility(input: string, options: MyOptions): string {
  log.debug({ input, options }, 'Processing');
  // Implementation
  return result;
}

// Reset for testing (if stateful)
export function resetMyUtility(): void {
  // Clear state
}
```

---

## Rules

### Do
- Keep utilities stateless (or provide reset functions)
- Use TypeScript generics for flexibility
- Handle edge cases gracefully
- Add JSDoc comments for public functions
- Export from `index.ts`
- Use callback patterns for cross-layer communication

### Don't
- Include business logic (that goes in services)
- Import from higher architecture levels (services, agents, tools)
- Use `any` types
- Create utilities with side effects that can't be cleaned up
- Leave module-level intervals/timers unmanaged

---

*Last updated: January 2026*
