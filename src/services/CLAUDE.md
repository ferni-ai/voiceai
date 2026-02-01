# Services Layer

> **We believe in making AI human, and the decisions we make will reflect that.**

The services layer contains the business logic that powers Ferni. Services are stateless, testable, and domain-focused. See `../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## Architecture Level

Services are at **Level 60** in the clean architecture:

```
Level 100: agents/, api/    ← Can import from services
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/        ← THIS LAYER
Level 30:  memory/
Level 10:  config/, utils/, types/
```

**Import rules:** Services can import from lower levels (memory, config, utils) but NOT from higher levels (agents, api, tools).

---

## Directory Structure

```
services/
├── superhuman/           # 70+ "Better than Human" capabilities (see README.md)
├── trust-systems/        # 47 trust-building services
├── trust-and-identity/   # Voice identity, 2FA, verification
├── outreach/             # Proactive messaging and delivery
├── calendar/             # Calendar integration and awareness
├── contacts/             # Contact management and relationships
├── coaching/             # Life coaching frameworks
├── self-healing/         # Error recovery, circuit breakers, resilience
├── data-layer/           # Domain stores, semantic memory, intelligent loading
├── session-manager/      # Session lifecycle (22 modules)
├── observability/        # Health metrics, alerting, cost tracking (20 files)
├── cache/                # Caching layer
├── brand/                # Brand consistency
├── di/                   # Dependency injection container
├── identity/             # Identity linking, OAuth
├── voice/                # Voice services
└── [200+ individual service files]
```

---

## Key Services by Domain

### Superhuman (Better than Human)
See `superhuman/README.md` for detailed documentation.

| Service | File | Purpose |
|---------|------|---------|
| Commitment Keeper | `superhuman/commitment-keeper.ts` | Track promises/intentions |
| Predictive Coaching | `superhuman/predictive-coaching.ts` | Anticipate struggles |
| Life Narrative | `superhuman/life-narrative.ts` | Build life story |
| Capacity Guardian | `superhuman/capacity-guardian.ts` | Prevent burnout |

### Trust & Identity

| Service | File | Purpose |
|---------|------|---------|
| Identity Orchestrator | `trust-and-identity/identity-orchestrator.ts` | Voice identity flow |
| Human-First 2FA | `trust-and-identity/human-first-2fa.ts` | Natural verification |
| Verification Store | `trust-and-identity/verification-store.ts` | Token storage |

### Outreach & Notifications

| Service | File | Purpose |
|---------|------|---------|
| Delivery Tracker | `outreach/delivery/delivery-tracker.ts` | Track message delivery |
| SMS Delivery | `outreach/delivery/sms-delivery.ts` | Twilio SMS integration |
| Push Notifications | `outreach/delivery/push-notifications.ts` | Mobile push |
| Thinking of You | `trust-systems/thinking-of-you.ts` | Proactive check-ins |

### Session Management

| Service | File | Purpose |
|---------|------|---------|
| Session Manager | `session-manager.ts` | Session lifecycle |
| DI Container | `di-container.ts` | Dependency injection |
| Service Context | `service-context.ts` | Request context |

### Calendar & Scheduling

| Service | File | Purpose |
|---------|------|---------|
| Calendar Integration | `calendar/index.ts` | Google Calendar sync |
| Calendar Awareness | `calendar/ambient-calendar-awareness.ts` | Context injection |
| Meeting Follow-up | `calendar/meeting-followup-automation.ts` | Auto follow-ups |

---

## Service Patterns

### 1. Session-Scoped Services

Services that maintain per-session state should use the session pattern:

```typescript
const instances = new Map<string, MyService>();

export function getMyService(sessionId: string): MyService {
  if (!instances.has(sessionId)) {
    instances.set(sessionId, new MyService(sessionId));
  }
  return instances.get(sessionId)!;
}

export function resetMyService(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.cleanup();
    instances.delete(sessionId);
  }
}
```

### 2. Stateless Services

Most services should be stateless functions:

```typescript
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'my-service' });

export async function doSomething(userId: string, data: InputData): Promise<Result> {
  try {
    // Business logic here
    return { success: true, data: result };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Operation failed');
    return { success: false, error: 'Operation failed' };
  }
}
```

### 3. Firestore Integration

For persistent data, use the Firestore patterns:

```typescript
import { getFirestoreDb } from './firestore-utils.js';

export async function saveData(userId: string, data: Data): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return; // Graceful degradation

  await db.collection('bogle_users').doc(userId)
    .collection('my_data').add({
      ...data,
      createdAt: new Date().toISOString(),
    });
}
```

---

## Creating New Services

### Checklist

- [ ] Create file in appropriate subdirectory
- [ ] Use `createLogger({ module: 'service-name' })` for logging
- [ ] Export functions (not classes, unless session-scoped)
- [ ] Add types to a `types.ts` file if complex
- [ ] Handle errors gracefully (no throwing to callers)
- [ ] Write tests in `__tests__/`
- [ ] Export from index.ts if needed by external modules

### Template

```typescript
/**
 * My Service
 *
 * Brief description of what this service does.
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'my-service' });

// Types
interface MyInput {
  userId: string;
  data: string;
}

interface MyResult {
  success: boolean;
  output?: string;
  error?: string;
}

// Main function
export async function processData(input: MyInput): Promise<MyResult> {
  const { userId, data } = input;

  try {
    log.debug({ userId }, 'Processing data');

    // Business logic
    const output = await doBusinessLogic(data);

    log.info({ userId }, 'Data processed successfully');
    return { success: true, output };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to process data');
    return { success: false, error: 'Processing failed' };
  }
}
```

---

## Rules

### Do
- Return Result types for expected failures
- Log errors with context (userId, sessionId)
- Use `readonly` for input parameters
- Keep services focused (single responsibility)
- Gracefully degrade when dependencies unavailable

### Don't
- Import from agents/, api/, or tools/
- Throw errors to callers (return Result types)
- Use `console.log` (use `createLogger`)
- Create god services (split large services)
- Store session state in module-level variables (use session pattern)

---

## Testing

```bash
# Run all service tests
pnpm vitest run src/services/__tests__/

# Run specific service tests
pnpm vitest run src/services/superhuman/__tests__/

# Watch mode
pnpm vitest src/services/
```

---

## Key Subdirectory Documentation

- `superhuman/README.md` - 70+ "Better than Human" capabilities
- `superhuman/CLAUDE.md` - Superhuman service patterns
- `trust-systems/CLAUDE.md` - 47 trust-building services
- `data-layer/CLAUDE.md` - Domain stores, semantic memory, WAL
- `session-manager/CLAUDE.md` - Session lifecycle (22 modules)
- `calendar/CLAUDE.md` - Calendar integration and providers
- `observability/CLAUDE.md` - Health metrics and alerting
- `self-healing/CLAUDE.md` - Circuit breakers and resilience
- `outreach/README.md` - Outreach and delivery system

---

*Last updated: January 2026*
