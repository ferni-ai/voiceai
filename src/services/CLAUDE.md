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
├── core/                 # DDD adapters, shared interfaces (NEW Feb 2026)
│   └── adapters.ts       # Typed adapter interfaces for cross-layer DI
│
├── # ── Consolidated Bounded Contexts (DDD Refactor Feb 2026) ──
├── session/              # Session lifecycle (20+ modules, consolidated from root)
├── memory/               # Memory orchestration, persistence, knowledge graph
│   ├── persistence/      # Firestore/Spanner persistence policies
│   ├── knowledge-graph/  # Entity relationship graph
│   └── semantic/         # Semantic store and embedding matching
├── trust/                # Trust framework, intent detection, tone analysis
├── identity/             # Identity linking, OAuth, contacts
│   └── contacts/         # Contact management (consolidated from root)
├── superhuman/           # 70+ "Better than Human" capabilities (see README.md)
│   └── validation/       # Capability benchmarks and test cases
├── outreach/             # Proactive messaging and delivery
│   ├── delivery/         # Channel implementations (SMS, push, email)
│   ├── scheduling/       # Send window optimization
│   ├── engagement/       # Personalization, voice generation
│   └── analytics/        # Engagement metrics
│
├── # ── Phase 2 Bounded Contexts (DDD Refactor Feb 2026) ──
├── communication/        # WebSocket, broadcast, Slack (12 files)
├── engagement/           # Celebrations, milestones, rituals (9 files)
├── performance/          # Alerts, profiling, ops orchestration (12 files)
├── billing/              # Stripe, Apple IAP, subscriptions (5 files)
├── persona/              # Content loading, behavior, modes (6 files)
├── intelligence/         # Emotion detection, awareness, memory (7-9 files)
├── social/               # Conversations, teams, relationships (5-7 files)
├── external-apis/        # Google Places, Yelp, Twilio, food delivery (8 files)
├── platform/             # Feature flags, security, data export (9-10 files)
├── data/                 # Persistence, WAL, caching (7 files)
├── session-ext/          # Session warmup, variety tracking (1-5 files)
│
├── # ── Existing Domains ──
├── trust-systems/        # 47 trust-building services (→ shims point to trust/)
├── trust-and-identity/   # Voice identity, 2FA, verification
├── calendar/             # Calendar integration and awareness
├── contacts/             # Contact management (→ shims point to identity/contacts/)
├── coaching/             # Life coaching frameworks
├── self-healing/         # Error recovery, circuit breakers, resilience
├── data-layer/           # Domain stores (→ some shims point to memory/)
├── session-manager/      # Legacy (→ shims point to session/)
├── observability/        # Health metrics, alerting, cost tracking (20 files)
├── cache/                # Caching layer
├── brand/                # Brand consistency
├── di/                   # Dependency injection container
├── voice/                # Voice services
└── [~25 root-level infrastructure files + ~90 re-export shims]
```

### DDD Migration Status (Feb 2026)

| Domain | Status | Old Location → New Location |
|--------|--------|---------------------------|
| Session | ✅ Consolidated | `session-manager.ts` + `session-manager/` → `session/` |
| Memory | ✅ Consolidated | `unified-memory-service.ts` + `data-layer/` → `memory/` |
| Trust | ✅ Split & moved | `trust-systems/reading-between-lines.ts` → `trust/` (3 files) |
| Identity/Contacts | ✅ Consolidated | `contacts.ts` + `contacts/` → `identity/contacts/` |
| Superhuman | ✅ Organized | `superhuman/index.ts` extracted → `superhuman-service.ts` |
| Outreach | ✅ Reorganized | Added `scheduling/`, `engagement/`, `analytics/` subdirs |
| Communication | ✅ Consolidated | 12 root WebSocket/broadcast files → `communication/` |
| Engagement | ✅ Consolidated | 9 root celebration/ritual files → `engagement/` |
| Performance | ✅ Consolidated | 12 root perf/ops files → `performance/` |
| Billing | ✅ Consolidated | 5 root Stripe/IAP files → `billing/` |
| Persona | ✅ Consolidated | 6 root persona files → `persona/` |
| Intelligence | ✅ Consolidated | 7-9 root awareness/detection files → `intelligence/` |
| Social | ✅ Consolidated | 5-7 root conversation/team files → `social/` |
| External APIs | ✅ Consolidated | 8 root API integration files → `external-apis/` |
| Platform | ✅ Consolidated | 9-10 root platform files → `platform/` |
| Data | ✅ Consolidated | 7 root persistence files → `data/` |

**Re-export shims** at old paths ensure backward compatibility. Import from new paths for new code.

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
| Trust Framework | `trust/trust-framework.ts` | Core trust model |
| Reading Between Lines | `trust/reading-between-lines.ts` | Detect unsaid signals |
| Intent Detector | `trust/intent-detector.ts` | Intent/emotion detection |
| Tone Analyzer | `trust/tone-analyzer.ts` | Tone/deflection analysis |
| Identity Orchestrator | `trust-and-identity/identity-orchestrator.ts` | Voice identity flow |
| Contact Management | `identity/contacts/contacts-management.ts` | Contact CRUD |

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
| Session Manager | `session/session-manager.ts` | Session lifecycle (consolidated) |
| Session Warmup | `session/session-warmup.ts` | Pre-session cache warming |
| Pre-Session Briefing | `session/pre-session-briefing.ts` | Context briefing |
| DI Container | `di-container.ts` | Dependency injection |

### Memory & Data

| Service | File | Purpose |
|---------|------|---------|
| Memory Service | `memory/memory-service.ts` | Memory orchestrator |
| Entity Policies | `memory/persistence/entity-policies.ts` | Persistence policies |
| Knowledge Graph | `memory/knowledge-graph/engine.ts` | Entity relationship graph |

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

### DDD Consolidated Domains (Feb 2026)
- `session/` - Session lifecycle (20+ modules consolidated from root)
- `memory/` - Memory orchestration, persistence policies, knowledge graph
- `trust/` - Trust framework, intent detection, tone analysis (split from reading-between-lines)
- `identity/contacts/` - Contact management (consolidated from root + contacts/)
- `superhuman/validation/` - Capability benchmarks (split from 2068-line god file)
- `outreach/scheduling/`, `outreach/engagement/`, `outreach/analytics/` - Outreach subdomain organization
- `core/adapters.ts` - Typed adapter interfaces for cross-layer DI

### Existing Domains
- `superhuman/README.md` - 70+ "Better than Human" capabilities
- `superhuman/CLAUDE.md` - Superhuman service patterns
- `trust-systems/CLAUDE.md` - 47 trust-building services (→ shims to trust/)
- `data-layer/CLAUDE.md` - Domain stores, semantic memory, WAL
- `session-manager/CLAUDE.md` - Session lifecycle (→ shims to session/)
- `calendar/CLAUDE.md` - Calendar integration and providers
- `observability/CLAUDE.md` - Health metrics and alerting
- `self-healing/CLAUDE.md` - Circuit breakers and resilience
- `outreach/CLAUDE.md` - Outreach and delivery system

### Architecture Enforcement
- `scripts/lint/architecture-boundaries.ts` - L60→L100 violation checker, file size auditor, duplicate filename finder
- `scripts/create-reexport-shim.ts` - CLI tool for creating backward-compatible re-export shims

---

*Last updated: February 2026*
