# Unified Data Layer

> **We believe in making AI human, and the decisions we make will reflect that.**

The data layer bridges **Domain Stores** (structured CRUD) and **Semantic Memory** (retrieval). It provides a unified interface so the LLM sees one coherent memory, not separate systems.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UNIFIED DATA LAYER                                  │
│                      src/services/data-layer/                               │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ getUnifiedContext│ │ searchUserContext│ │ buildLLMContext │             │
│  │  (all stores)    │ │  (semantic)      │ │  (combined)     │             │
│  └────────┬─────────┘  └────────┬────────┘  └────────┬───────┘             │
│           │                     │                    │                      │
│           └─────────────────────┼────────────────────┘                      │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │                      │                      │
           ▼                      ▼                      ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐
│   DOMAIN STORES     │  │   SEMANTIC MEMORY   │  │   USER PROFILE          │
│ (structured CRUD)   │  │ (RAG retrieval)     │  │ (relationship context)  │
│                     │  │                     │  │                         │
│ productivity-store  │  │ firestore-vector    │  │ key moments             │
│ financial-store     │  │ semantic-rag        │  │ emotional patterns      │
│ life-data-store     │  │ embedding-cache     │  │ preferences             │
└─────────────────────┘  └─────────────────────┘  └─────────────────────────┘
```

---

## Two Systems, One Memory

### Domain Stores (`src/services/stores/`)

**Purpose:** Structured, queryable business data for tool execution.

| Store                   | Owner  | Data Types                                               |
| ----------------------- | ------ | -------------------------------------------------------- |
| `productivity-store.ts` | Maya   | Tasks, habits, routines, bills, medications              |
| `financial-store.ts`    | Maya   | Budgets, savings goals, subscriptions, spending triggers |
| `life-data-store.ts`    | Jordan | Life milestones, goals, retirement plans                 |

**Use when:**

- Tools need to CRUD entities
- You need exact field queries (e.g., "bills due this week")
- Business logic requires aggregations

### Semantic Memory (`src/memory/`)

**Purpose:** Natural language retrieval based on meaning, not exact matches.

| Component                 | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `semantic-rag.ts`         | Finds memories by meaning                                |
| `firestore-vector-store/` | Stores embeddings                                        |
| `advanced-retrieval.ts`   | Multi-factor retrieval (semantic + emotional + temporal) |
| `orchestrator.ts`         | Coordinates all memory subsystems                        |

**Use when:**

- LLM needs context for conversation
- "Did we talk about..." queries
- Building relationship over time

---

## Key Files

| File                     | Purpose                                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| `index.ts`               | Main facade - `getUnifiedContext()`, `searchUserContext()`, `buildLLMContext()` |
| `types.ts`               | Shared type definitions                                                         |
| `store-hooks.ts`         | Auto-indexing hooks - call when stores change                                   |
| `indexing-policy.ts`     | Controls what gets indexed to semantic memory                                   |
| `query-router.ts`        | Routes queries to structured or semantic data                                   |
| `session-integration.ts` | Session lifecycle management                                                    |
| `health.ts`              | Health checks and observability                                                 |

---

## Module Structure

```
src/services/data-layer/
├── index.ts              # Main unified data layer facade
├── types.ts              # Shared type definitions
├── store-hooks.ts        # Auto-indexing hooks for stores
├── indexing-policy.ts    # What/when to index to semantic memory
├── query-router.ts       # Routes queries to correct data source
├── session-integration.ts # Session lifecycle (start/end/flush)
├── health.ts             # Health checks and metrics
└── CLAUDE.md             # This documentation
```

---

## Usage Patterns

### 1. Get All User Data (Unified)

```typescript
import { getUnifiedContext } from '../services/data-layer/index.js';

const context = await getUnifiedContext(userId);
// Returns: { productivity, financial, lifeData, summary }

console.log(context.summary);
// { activeTaskCount: 5, activeHabitCount: 3, activeSavingsGoals: 2, ... }
```

### 2. Semantic Search Across All Data

```typescript
import { searchUserContext } from '../services/data-layer/index.js';

const results = await searchUserContext(userId, 'my savings goals');
// Searches BOTH semantic memory AND structured stores
```

### 3. Build LLM Context

```typescript
import { buildLLMContext } from '../services/data-layer/index.js';

const context = await buildLLMContext(userId, userMessage);
// Returns formatted string for prompt injection
```

### 4. Auto-Index on Store Changes

```typescript
import { onHabitChange, onSavingsGoalChange } from '../services/data-layer/store-hooks.js';

// When a habit is updated:
onHabitChange(userId, habitId, { name: 'Morning jog', frequency: 'daily' });

// This auto-indexes to semantic memory (debounced)
```

### 5. Domain Hooks (Recommended Pattern)

Use domain hooks from `hooks/*.ts` for automatic semantic indexing:

```typescript
// ✅ RECOMMENDED - Use domain hooks directly
import { onCommitmentChange } from '../data-layer/hooks/trust-hooks.js';
import { onDreamChange } from '../data-layer/hooks/superhuman-hooks.js';
import { onCallResultChange } from '../data-layer/hooks/misc-hooks.js';

// When creating a commitment:
void onCommitmentChange(userId, commitmentId, {
  commitment: 'Call mom every Sunday',
  status: 'active',
  madeOn: new Date().toISOString(),
  remindersSent: 0,
}, 'create');
```

**Available Hook Files:**
| File | Domain | Example Hooks |
|------|--------|---------------|
| `trust-hooks.ts` | Trust systems | `onCommitmentChange`, `onBoundaryChange` |
| `superhuman-hooks.ts` | Superhuman | `onDreamChange`, `onLifeChapterChange` |
| `calendar-hooks.ts` | Calendar | `onCalendarEventChange`, `onMeetingMemoryChange` |
| `contacts-hooks.ts` | Contacts | `onContactChange`, `onGiftIdeaChange` |
| `coaching-hooks.ts` | Coaching | `onCoachingInsightChange`, `onJournalEntryChange` |
| `health-hooks.ts` | Health | `onHealthGoalChange`, `onWellbeingSnapshotChange` |
| `media-hooks.ts` | Media | `onMusicPreferenceChange`, `onReadingListChange` |
| `career-hooks.ts` | Career | `onCareerGoalChange`, `onSkillDevelopmentChange` |
| `misc-hooks.ts` | Misc | `onReminderChange`, `onCallResultChange` |
| `better-than-human-hooks.ts` | Superhuman Intelligence | `onVoiceBiomarkerChange`, `onSessionSummaryChange` |

**⚠️ DEPRECATED:** The `integrations/*.ts` files are deprecated wrappers. Import from `hooks/*.ts` instead.

---

## Data Flow

### Write Path (Tool → Store → Semantic Memory)

```
User: "I want to save $5000 for a trip to Japan"
                    │
                    ▼
┌──────────────────────────────────────────┐
│           TOOL EXECUTION                 │
│  create_savings_goal({ name: "Japan"... })│
└──────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────┐
│         FINANCIAL STORE                  │
│  financialStore.addSavingsGoal(...)      │
│         + onSavingsGoalChange()  ◄───────│── AUTO-INDEX HOOK
└──────────────────────────────────────────┘
                    │
                    ▼ (debounced 2s)
┌──────────────────────────────────────────┐
│         SEMANTIC MEMORY                  │
│  embed("Savings goal: Japan trip...")    │
│  indexDocument({ ... })                  │
└──────────────────────────────────────────┘
```

### Read Path (LLM Context ← Unified Layer)

```
User: "How am I doing on my trip savings?"
                    │
                    ▼
┌──────────────────────────────────────────┐
│     CONTEXT BUILDER (turn handler)       │
│  buildUnifiedDataContext(input)          │
└──────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────────┐  ┌───────────────────┐
│  UNIFIED LAYER    │  │  SEMANTIC SEARCH  │
│ getUnifiedContext │  │ searchUserContext │
│ → summary stats   │  │ → "Japan savings" │
└───────────────────┘  └───────────────────┘
        │                       │
        └───────────┬───────────┘
                    ▼
┌──────────────────────────────────────────┐
│           LLM CONTEXT INJECTION          │
│ [USER DATA: 2 savings goals]             │
│ [RELEVANT: Japan trip - $1200/$5000]     │
└──────────────────────────────────────────┘
```

---

## Integration Points

### Context Builder

The `unified-data-context.ts` builder is registered and runs on each turn:

```typescript
// src/intelligence/context-builders/memory/unified-data-context.ts
const unifiedDataContextBuilder: ContextBuilder = {
  id: 'unified_data_context',
  category: BuilderCategory.MEMORY,
  priority: 65,
  build: buildUnifiedDataContext,
};
```

### Session End

At session end, flush pending changes and optionally re-index:

```typescript
import { flushPendingChanges } from '../services/data-layer/store-hooks.js';
import { indexUserData } from '../services/data-layer/index.js';

// Flush any pending auto-index changes
await flushPendingChanges();

// Optionally re-index all user data
await indexUserData(userId);
```

---

## Adding Store Hooks to Existing Stores

To integrate auto-indexing into a store:

```typescript
// In financial-store.ts
import { onSavingsGoalChange } from '../data-layer/store-hooks.js';

async addSavingsGoal(userId: string, goal: SavingsGoalData): Promise<void> {
  // ... existing save logic ...

  // Auto-index to semantic memory
  onSavingsGoalChange(userId, goal.id, {
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    priority: goal.priority,
  }, 'create');
}
```

---

## Rules

### Do

- Use `getUnifiedContext()` for summary stats
- Use `searchUserContext()` for semantic queries
- Use `buildLLMContext()` for prompt injection
- Call hook functions when stores change
- Flush pending changes at session end

### Don't

- Query stores directly from context builders (use unified layer)
- Skip the debounce by calling index functions directly
- Forget to call hooks when updating stores
- Over-index (only important data needs semantic search)

---

## Performance

| Operation             | Target      | Notes                 |
| --------------------- | ----------- | --------------------- |
| `getUnifiedContext()` | < 50ms      | Cached for 60s        |
| `searchUserContext()` | < 200ms     | Semantic search       |
| `indexUserData()`     | < 2s        | Batch indexing        |
| Auto-index hook       | 2s debounce | Batches rapid changes |

---

## Session Lifecycle

Use session integration for proper cache warming and cleanup:

```typescript
import { onSessionStart, onSessionEnd } from '../services/data-layer/session-integration.js';

// At session start - warm cache, load context
const context = await onSessionStart(userId, sessionId);

// At session end - flush pending changes, cleanup
const result = await onSessionEnd(sessionId);
console.log(`Flushed ${result.flushed} changes in ${result.duration}ms`);
```

### Graceful Shutdown

Register shutdown handler to flush all sessions:

```typescript
import { registerShutdownHandler } from '../services/data-layer/session-integration.js';

// Call once at app startup
registerShutdownHandler();
```

---

## Health Checks

Monitor data layer health:

```typescript
import { getDataLayerHealth, getDiagnostics, isHealthy } from '../services/data-layer/health.js';

// Quick health check
if (await isHealthy()) {
  // Ready for production
}

// Detailed health
const health = await getDataLayerHealth();
console.log(health.status); // 'healthy' | 'degraded' | 'unhealthy'

// Full diagnostics with recommendations
const diagnostics = await getDiagnostics();
console.log(diagnostics.recommendations);
```

### Health Status Meanings

| Status      | Meaning                 | Action                  |
| ----------- | ----------------------- | ----------------------- |
| `healthy`   | All systems operational | None needed             |
| `degraded`  | Partial functionality   | Monitor closely         |
| `unhealthy` | Critical issues         | Investigate immediately |

---

## Query Routing

The query router decides whether to use structured stores or semantic search:

```typescript
import { routeQuery, executeRoutedQuery } from '../services/data-layer/query-router.js';

// See routing decision
const decision = routeQuery('What bills are due this week?');
// { queryType: 'structured', stores: ['productivity'], entityTypes: ['bill'] }

// Execute with automatic routing
const results = await executeRoutedQuery(userId, 'How am I doing with savings?');
```

### Query Types

| Type         | When Used           | Example Queries                        |
| ------------ | ------------------- | -------------------------------------- |
| `structured` | Exact lookups, CRUD | "Show my habits", "Bills due today"    |
| `semantic`   | Meaning-based       | "How am I progressing?", "Remember..." |
| `hybrid`     | Keyword + meaning   | "Tell me about my savings"             |

---

## Indexing Policy

Control what gets indexed to semantic memory:

```typescript
import { shouldIndex, getEntityPolicy } from '../services/data-layer/indexing-policy.js';

// Check if entity should be indexed
const { shouldIndex: doIndex, reason } = shouldIndex('habit', { isActive: true });

// Get policy for entity type
const policy = getEntityPolicy('savings_goal');
// { priority: 'active_only', conditions: {...}, ttlDays: 0 }
```

### Indexing Priorities

| Priority         | Meaning                                   |
| ---------------- | ----------------------------------------- |
| `always`         | Always index (budgets, spending triggers) |
| `active_only`    | Only active/in-progress items             |
| `important_only` | Only high-priority items                  |
| `never`          | Never index (notes - too noisy)           |

---

## Production Validation

Before deploying, run the validation script:

```bash
npx tsx scripts/validate-data-layer.ts
```

This checks:

- Store hooks are wired
- Indexing policy is configured
- Query router is functional
- Session integration works
- Health checks available
- All exports present

---

## 🚀 Intelligent Data Loading (NEW - Jan 2026)

The data layer now includes intelligent, lazy-loading capabilities that dramatically improve session startup time and memory efficiency.

### Key Components

| Module | Purpose |
|--------|---------|
| `intelligent-loader.ts` | Lazy-loads data domains on-demand |
| `fast-session-init.ts` | Fast session startup (100ms vs 500ms+) |
| `profile-pruning.ts` | Trims unbounded arrays in profiles |
| `memory-cache-manager.ts` | LRU caching with TTL eviction |
| `firestore-pagination.ts` | Safe paginated Firestore queries |

### Usage: Fast Session Init

```typescript
import { fastSessionStart, fastSessionEnd } from '../data-layer/index.js';

// At session start - only loads profile synchronously
const { profile, isReturningUser } = await fastSessionStart(userId, sessionId, {
  userName: 'John',
  personaId: 'ferni',
});

// At session end - prunes profile, clears caches
await fastSessionEnd(userId, sessionId);
```

### Usage: Intelligent Loader

```typescript
import { getIntelligentLoader } from '../data-layer/index.js';

const loader = getIntelligentLoader(userId, sessionId);

// Initialize (loads critical domains, starts background for others)
await loader.initializeSession();

// Get specific domain (loads on-demand if not cached)
const habits = await loader.getDomain('habits');

// Predictive loading from message
const preloaded = await loader.preloadFromMessage("help me with my morning routine");
// Returns: ['habits', 'tasks'] - domains now loading in background
```

### Usage: Profile Pruning

```typescript
import { pruneProfile, pruneProfileOnSessionEnd } from '../data-layer/index.js';

// Manual pruning with custom config
const { profile, result } = pruneProfile(userProfile, {
  maxEmotionalPatterns: 100,
  maxKeyMoments: 50,
  conversationSummaryRetentionDays: 180,
});

// Auto-prune at session end
await pruneProfileOnSessionEnd(userId);
```

### Usage: Memory Cache Manager

```typescript
import { createUserCache, clearUserCaches, startCacheCleanup } from '../data-layer/index.js';

// Create a managed cache
const cache = createUserCache<MyData>('my-feature', {
  maxUsers: 500,
  ttlMs: 5 * 60 * 1000, // 5 minutes
});

// Use it
cache.set(userId, data);
const data = cache.get(userId);

// Clear for a specific user (at session end)
clearUserCaches(userId);

// Start periodic cleanup
startCacheCleanup(60_000); // Every minute
```

### Usage: Safe Firestore Queries

```typescript
import { safeQueryAll, SAFE_LIMITS, recentItemsQuery } from '../data-layer/index.js';

// Safe query with pagination (never loads unbounded data)
const items = await safeQueryAll(collection, {
  maxItems: SAFE_LIMITS.habits,
  dateField: 'createdAt',
  recentDays: 30,
});

// Query recent items only
const query = recentItemsQuery(collection, 'createdAt', 30, 50);
const snapshot = await query.get();
```

### Data Domains

The intelligent loader organizes data into domains:

| Domain | Priority | Trigger Keywords |
|--------|----------|------------------|
| `profile` | critical | name, profile, settings |
| `habits` | on-demand | habit, routine, morning, streak |
| `tasks` | on-demand | task, todo, remind, deadline |
| `finance` | on-demand | money, budget, saving, spend |
| `calendar` | on-demand | calendar, meeting, schedule |
| `social` | on-demand | friend, family, mom, dad |
| `health` | on-demand | health, medication, sleep |
| `insights` | background | team, insight, pattern |

### Session Startup Comparison

| Approach | Time | What's Loaded |
|----------|------|---------------|
| OLD (waterfall) | ~500-800ms | profile → context → intelligence → insights → social |
| NEW (parallel) | ~100-200ms | profile only (rest in background) |

---

## Future Enhancements

1. ~~**Lazy loading** - Load data domains on-demand~~ ✅ DONE (Jan 2026)
2. ~~**Profile pruning** - Trim unbounded arrays~~ ✅ DONE (Jan 2026)
3. ~~**Cache management** - LRU eviction with TTL~~ ✅ DONE (Jan 2026)
4. **Real-time sync** - WebSocket updates when stores change
5. **Smart decay** - Automatically reduce indexed data importance over time
6. **Cross-user patterns** - Aggregate insights (privacy-preserving)

---

_Last updated: January 2026_
