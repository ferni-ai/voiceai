# Tools Rationalization

> **This document tracks the 2024 tools consolidation effort.**

## Completed Consolidations

### 1. Communication Domain (`domains/communication/`)

#### Before
- `communication.ts` (root) - Basic send message tools
- `domains/communication/enhanced-outreach-tools.ts`
- `domains/communication/personalized-outreach-tools.ts`
- `domains/communication/unified-outreach-tool.ts`

#### After
- `domains/communication/outreach/unified-outreach.ts` - **Primary `reachOut` tool**
- `domains/communication/outreach/batch-outreach.ts` - Group messaging
- `domains/communication/outreach/message-crafting.ts` - LLM personalization

#### Usage
```typescript
// NEW (recommended)
import { getToolDefinitions } from './domains/communication/index.js';
import { getUnifiedOutreachToolDefinitions } from './domains/communication/outreach/index.js';

// OLD (deprecated)
import { createCommunicationTools } from './communication.js'; // ⚠️ Deprecated
```

---

### 2. Proactive Domain (`domains/proactive/`)

#### Before
- `proactive.ts` (root) - Goal tracking tools
- `proactive-coaching.ts` (root) - Coaching triggers (1,338 lines!)
- `proactive-outreach.ts` (root) - Agent-to-User outreach (reminders, calls)

#### After
- `domains/proactive/index.ts` - **All proactive superhuman tools**
  - Commitment Keeper (track/review/celebrate commitments)
  - Pattern Recognition (record patterns, get predictions)
  - Life Narrative (reflect on journey)
  - Values Alignment (check alignment)
  - Proactive Message Generation
- `domains/proactive/outreach/agent-to-user.ts` - Agent→User outreach (reminders, scheduled calls)

#### Key Distinction
- **`domains/proactive/outreach/`** = Agent reaching out TO the user (reminders, check-ins)
- **`domains/communication/outreach/`** = User reaching out to their CONTACTS (mom, friends)

#### Usage
```typescript
// NEW (recommended)
import { getToolDefinitions } from './domains/proactive/index.js';
import { getAgentToUserOutreachDefinitions } from './domains/proactive/outreach/index.js';

// OLD (deprecated)
import { proactiveOutreachTools } from './proactive-outreach.js'; // ⚠️ Deprecated
import { createProactiveCoachingTools } from './proactive-coaching.js'; // ⚠️ Deprecated
```

---

### 3. Engagement Domain (`domains/engagement/`)

Already well-organized. Contains:
- `emotional-games.ts` - Morning Sky Check, Kintsugi Moments
- `financial-games.ts` - Compound Interest Game, Tiny Bets
- `life-planning-games.ts` - Future Self Letter, Life Portfolio
- `wisdom-games.ts` - Paradox of the Day
- `analytics-games.ts` - Pattern Detective
- `productivity-games.ts` - Inbox Zero Challenge
- `team-challenges.ts` - Team Huddle, Quick Challenges

---

### 4. Gamification

#### Before
- `gamification.ts` (root) - V1, in-memory storage (deprecated!)

#### After
- `domains/habits/gamification-v2.ts` - **V2 with Firestore persistence**

#### Usage
```typescript
// NEW (recommended)
import { createGamificationToolsV2 } from './domains/habits/gamification-v2.js';

// OLD (deprecated - uses in-memory storage!)
import { createGamificationTools } from './gamification.js'; // ⚠️ Deprecated
```

---

### 5. Memory Domain (`domains/memory/`)

All memory tools now consolidated in the domain:
- `domains/memory/tools.ts` - Generic memory tools
- `domains/memory/persona-tools.ts` - Persona-specific memory tools (Ferni, Maya, etc.)

#### Usage
```typescript
// NEW (recommended)
import { createFerniMemoryTools, createMayaMemoryTools } from './domains/memory/persona-tools.js';

// DEPRECATED - Re-exports from new location for backward compatibility
import { createFerniMemoryTools } from './persona-memory-tools.js';
```

---

## Deprecated Root Files (Now Re-export Shims)

These root files now just re-export from their new domain locations for backward compatibility:

| File | New Location | Status |
|------|--------------|--------|
| `persona-memory-tools.ts` | `domains/memory/persona-tools.ts` | Re-export shim |
| `gamification.ts` | `domains/habits/gamification-v2.ts` + `gamification-constants.ts` | Re-export shim |

---

### 6. Concierge Domain (`domains/concierge/`)

**Kept separate** - Business/vendor outreach has fundamentally different requirements than personal outreach.

#### Outreach Domain Comparison

| Domain | Target | Purpose | Tone |
|--------|--------|---------|------|
| `communication/outreach/` | Personal contacts (mom, friends) | Relationship | Warm, personalized |
| `proactive/outreach/` | The user | Accountability | Caring, supportive |
| `concierge/` | Businesses (hotels, plumbers) | Transactions | Professional, efficient |

#### Tools
- `requestHotelQuotes` - Call hotels for rates
- `makeRestaurantReservation` - Book tables
- `scheduleAppointment` - Healthcare appointments
- `getServiceQuotes` - Service provider quotes
- `checkConciergeStatus` - Track outreach requests

#### Usage
```typescript
import { getToolDefinitions } from './domains/concierge/index.js';
```

---

## Completed: Optimization Files (`optimization/`)

Moved from root to `tools/optimization/`:
- `recommendation-engine.ts` → `optimization/recommendation-engine.ts`
- `pattern-analyzer.ts` → `optimization/pattern-analyzer.ts`
- `feedback-collector.ts` → `optimization/feedback-collector.ts`
- `auto-optimizer.ts` → `optimization/auto-optimizer.ts`

Usage:
```typescript
import { patternAnalyzer, feedbackCollector, recommendationEngine, autoOptimizer } from './tools/optimization/index.js';
```

---

## Completed: Intelligence Files (`intelligence/`)

Moved from root to `tools/intelligence/`:
- `cognitive-tool-interpretation.ts` → `intelligence/cognitive-tool-interpretation.ts`

Usage:
```typescript
import { interpretToolResult } from './tools/intelligence/index.js';
```

---

## DELETED Domain Files

These deprecated files within domains have been deleted:
- ❌ `domains/communication/unified-outreach-tool.ts` - Replaced by `outreach/unified-outreach.ts`
- ❌ `domains/communication/enhanced-outreach-tools.ts` - Consolidated into `outreach/` module
- ❌ `domains/communication/personalized-outreach-tools.ts` - Consolidated into `outreach/` module
- ❌ `domains/proactive/outreach/proactive-outreach-legacy.ts` - Renamed to `service.ts`

## Moved Files (With Legacy Re-exports)

Root files that have been moved but retain re-export shims:
- 🔀 `proactive-outreach.ts` → `domains/proactive/outreach/service.ts` (DELETED, use new path)
- 🔀 `proactive-coaching.ts` → `domains/proactive/coaching/` (DELETED, use new path)
- 🔀 `proactive.ts` → `domains/proactive/` (DELETED, use new path)
- 🔀 `communication.ts` → `domains/communication/` (DELETED, use new path)
- 🔀 `persona-memory-tools.ts` → `domains/memory/persona-tools.ts` (re-export shim exists)
- 🔀 `gamification.ts` → `domains/habits/` (re-export shim exists)

---

## Future Consolidation Candidates

These root-level files could still be moved:

| File | Lines | Suggested Location | Purpose |
|------|-------|-------------------|---------|
| `team-integration.ts` | 815 | `handoff/` | Team routing |

---

## Architecture Rules

### Import Rules
```
domains/           → Domain-specific tools
├── proactive/     → Superhuman capabilities (commitments, patterns, values)
│   └── outreach/  → Agent→User (reminders, check-ins)
├── communication/ → User→Contact outreach
│   └── outreach/  → Better Than Human personalized messaging
├── engagement/    → Games & retention
├── habits/        → Habit tracking & gamification
├── memory/        → Persistent memory tools
└── ...            → Other domains
```

### Naming Convention
- Domain tools: `domains/{domain}/index.ts`
- Submodules: `domains/{domain}/{feature}/index.ts`
- Tool definitions: Export `get{Feature}ToolDefinitions(): ToolDefinition[]`

---

## Testing After Migration

```bash
# Verify no type errors
pnpm typecheck

# Run tool tests
pnpm vitest run src/tools/

# Verify deprecated files still work (backward compatibility)
pnpm vitest run src/tools/__tests__/
```

---

*Last updated: December 2024*

