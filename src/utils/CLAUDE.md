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
import { createLogger } from './utils/safe-logger.js';

const log = createLogger({ module: 'MyModule' });

log.debug({ userId }, 'Processing request');
log.info({ result }, 'Operation completed');
log.warn({ attempt }, 'Retry needed');
log.error({ error: String(err) }, 'Operation failed');
```

**Rules:**
- Always use `createLogger`, never `console.log`
- Include context object as first parameter
- Convert errors to strings: `{ error: String(err) }`

### Circuit Breaker

```typescript
import { createCircuitBreaker } from './utils/circuit-breaker.js';

const breaker = createCircuitBreaker('external-api', {
  failureThreshold: 3,
  recoveryTimeout: 60000,  // 1 minute
  successThreshold: 2,
});

// Use the breaker
const result = await breaker.execute(async () => {
  return await callExternalApi();
});
```

### Rate Limiter

```typescript
import { RateLimiter } from './utils/rate-limiter.js';

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,  // 1 minute
});

if (limiter.isRateLimited(userId)) {
  throw new Error('Rate limited');
}
```

### Async Utilities

```typescript
import { sleep, withTimeout, retry } from './utils/async.js';

// Sleep
await sleep(1000);  // 1 second

// Timeout
const result = await withTimeout(
  asyncOperation(),
  5000,  // 5 second timeout
  'Operation timed out'
);

// Retry
const result = await retry(
  () => flakeyOperation(),
  { maxAttempts: 3, delayMs: 1000 }
);
```

### Background Tasks

```typescript
import { scheduleBackground, cancelBackground } from './utils/background-task.js';

// Schedule a task
const taskId = scheduleBackground(
  'my-task',
  async () => {
    await doBackgroundWork();
  },
  { delayMs: 5000 }  // Run after 5 seconds
);

// Cancel if needed
cancelBackground(taskId);
```

### Firestore Utilities

```typescript
import { getFirestoreDb, withFirestore } from './utils/firestore-utils.js';

// Get Firestore instance (may be null)
const db = getFirestoreDb();
if (!db) return defaultValue;

// Safe Firestore operation
const result = await withFirestore(async (db) => {
  return await db.collection('users').doc(userId).get();
}, defaultValue);
```

### Session Registry

```typescript
import { SessionRegistry } from './utils/session-registry.js';

const registry = new SessionRegistry<SessionData>();

registry.set(sessionId, data);
const session = registry.get(sessionId);
registry.delete(sessionId);
registry.clear();
```

### Interval Manager

```typescript
import { IntervalManager } from './utils/interval-manager.js';

const intervals = new IntervalManager();

// Start managed interval
intervals.start('cleanup', () => {
  cleanupOldData();
}, 60000);  // Every minute

// Stop all on shutdown
intervals.stopAll();
```

### Lazy Service

```typescript
import { LazyService } from './utils/lazy-service.js';

const expensiveService = new LazyService(async () => {
  return await initializeExpensiveService();
});

// Only initializes on first access
const service = await expensiveService.get();
```

---

## Directory Structure

```
utils/
├── index.ts                # Main exports
├── safe-logger.ts          # Structured logging
├── circuit-breaker.ts      # Circuit breaker pattern
├── rate-limiter.ts         # Rate limiting
├── async.ts                # Async helpers (sleep, timeout, retry)
├── background-task.ts      # Background task scheduling
├── firestore-utils.ts      # Firestore helpers
├── session-registry.ts     # Session state registry
├── interval-manager.ts     # Managed intervals
├── lazy-service.ts         # Lazy initialization
├── cleanup-patterns.ts     # Resource cleanup helpers
├── metrics.ts              # Metrics collection
├── performance-metrics.ts  # Performance tracking
├── cognitive-metrics.ts    # AI metrics
└── ddos-protection.ts      # DDoS mitigation
```

---

## Adding New Utilities

1. Create file in `src/utils/`
2. Export from `index.ts`
3. Document usage in this CLAUDE.md
4. Write tests in `src/utils/__tests__/`

### Utility Template

```typescript
/**
 * My Utility
 *
 * Brief description of what this utility does.
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'my-utility' });

export function myUtility(input: string): string {
  log.debug({ input }, 'Processing');
  // Implementation
  return result;
}
```

---

## Rules

### Do
- Keep utilities stateless
- Use TypeScript generics for flexibility
- Handle edge cases gracefully
- Add JSDoc comments for public functions

### Don't
- Include business logic (that goes in services)
- Import from higher architecture levels
- Use `any` types
- Create utilities with side effects

---

*Last updated: December 2024*
