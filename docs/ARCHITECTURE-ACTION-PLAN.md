# Architecture Action Plan

> Last Updated: December 9, 2024

## Executive Summary

Analysis of the Ferni codebase against clean architecture goals reveals **no layer violations** but significant technical debt in the form of circular dependencies, oversized files, and low adoption of architectural patterns (DI, Result types).

---

## Current State Assessment

### What's Working

| Area | Status | Details |
|------|--------|---------|
| Layer Violations | **0** | Architecture validator passes |
| Test Coverage | Good | 1274 tests passing |
| Module Structure | Partial | Services, tools, personas organized |
| Type System | Strong | TypeScript throughout |

### What Needs Work

| Issue | Severity | Count |
|-------|----------|-------|
| Circular Dependencies | High | 9 chains |
| Oversized Files (>500 lines) | High | 30+ files |
| DI Container Adoption | Medium | 11 files (very low) |
| Result Type Adoption | Medium | 20 files (low) |
| Tech Debt Items | Medium | 43 (11 TODOs, 32 deprecated) |
| Unused Imports | Low | ~800 remaining |
| Incomplete Features | Medium | Phases 4-8 pending |

---

## Priority 1: Break Circular Dependencies (Critical)

### Current Circular Chains

```
1. services/global-services
   → services/types
   → services/humanizing-state
   → intelligence/context-builders/humanizing
   → personas/bundles/runtime
   → intelligence/agent-evolution
   → intelligence/community-insights
   → services/global-services

2. services/global-services
   → services/types
   → services/humanizing-state
   → intelligence/context-builders/humanizing
   → personas/bundles/runtime
   → intelligence/agent-evolution
   → services/global-services

3. services/optimization-persistence → tools/feedback-collector → services/optimization-persistence

4. services/optimization-persistence → tools/recommendation-engine → services/optimization-persistence

5. services/index
   → services/shutdown
   → services/session-manager
   → services/cross-persona-insights
   → services/global-services
   → tools/index
   → tools/conversation
   → services/index
```

### Solution: Introduce Abstractions

**Step 1: Create Interface Layer**

```typescript
// src/types/service-interfaces.ts (NEW)
export interface IHumanizingState {
  getState(sessionId: string): HumanizingStateData;
  updateState(sessionId: string, data: Partial<HumanizingStateData>): void;
}

export interface IBundleRuntime {
  getPersonaContext(personaId: string): PersonaContext;
  getCognitiveProfile(personaId: string): CognitiveProfile;
}

export interface IAgentEvolution {
  trackEvolution(sessionId: string, event: EvolutionEvent): void;
  getEvolutionState(sessionId: string): EvolutionState;
}
```

**Step 2: Use DI for Resolution**

```typescript
// Instead of direct imports causing cycles:
import { getHumanizingState } from '../services/humanizing-state';

// Use DI injection:
const humanizingState = container.resolve<IHumanizingState>(Tokens.HumanizingState);
```

**Step 3: Refactor Order**

1. [ ] Extract interfaces from `services/types.ts` to `types/service-interfaces.ts`
2. [ ] Register services in DI container at bootstrap
3. [ ] Update `services/global-services.ts` to use DI
4. [ ] Update `personas/bundles/runtime.ts` to depend on interfaces
5. [ ] Update `intelligence/agent-evolution.ts` to use DI
6. [ ] Update `tools/conversation.ts` to use DI
7. [ ] Re-run architecture validator to confirm resolution

---

## Priority 2: Split Oversized Files (High)

### Files Over 1000 Lines

| File | Lines | Priority | Split Strategy |
|------|-------|----------|----------------|
| `voice-agent.ts` | 4286 | Critical | Extract processors, handlers, lifecycle |
| `ssml-tagger.ts` | 2393 | High | Extract persona configs, formatters |
| `habit-coaching.ts` | 2109 | High | Already has subdirectory structure |
| `bundles/types.ts` | 2000 | Medium | Split by domain (persona, cognitive, behavior) |
| `scheduling.ts` | 1765 | High | Extract calendar, reminders, recurring |
| `session-manager.ts` | 1725 | High | Extract lifecycle, state, cleanup |
| `bundles/runtime.ts` | 1702 | High | Extract managers, loaders, cache |
| `turn-processor.ts` | 1461 | Medium | Extract phases (context, routing, response) |
| `financial-habits.ts` | 1734 | Medium | Extract by feature (tracking, analysis, goals) |

### Split Pattern

```
src/agents/voice-agent.ts (4286 lines)
→ src/agents/
   ├── voice-agent.ts           # Main orchestrator (~500 lines)
   ├── processors/
   │   ├── turn-processor.ts    # Turn handling
   │   ├── context-processor.ts # Context building
   │   └── response-processor.ts# Response generation
   ├── handlers/
   │   ├── event-handlers.ts    # Room events
   │   ├── audio-handlers.ts    # Audio processing
   │   └── error-handlers.ts    # Error recovery
   ├── lifecycle/
   │   ├── session-init.ts      # Session setup
   │   ├── session-cleanup.ts   # Cleanup logic
   │   └── health-check.ts      # Health monitoring
   └── index.ts                 # Re-exports
```

### Action Items

1. [ ] Start with `voice-agent.ts` (highest impact)
2. [ ] Extract to `src/agents/processors/` subdirectory
3. [ ] Use barrel files for clean exports
4. [ ] Update imports across codebase
5. [ ] Verify tests still pass
6. [ ] Repeat for `ssml-tagger.ts`, `session-manager.ts`

---

## Priority 3: Increase DI Adoption (Medium)

### Current State

Only **11 files** use the DI container:
- `services/di/*` (container implementation)
- `services/spotify-auth.ts`
- `services/google-calendar-oauth.ts`
- `services/outreach/delivery/push-notifications.ts`
- Tests

### Target Services for DI Migration

| Service | Current Pattern | Migration Benefit |
|---------|-----------------|-------------------|
| `MemoryStore` | Direct import | Testability, swappable backends |
| `Logger` | `createLogger()` | Consistent logging config |
| `SessionManager` | Singleton | Session isolation in tests |
| `PersonaRegistry` | Global state | Multi-tenant support |
| `ContextBuilders` | Direct imports | Composable, testable contexts |

### Implementation

**Step 1: Define Tokens**

```typescript
// src/services/di/tokens.ts
export const Tokens = {
  // Existing
  MemoryStore: Symbol('MemoryStore'),
  UserIdentification: Symbol('UserIdentification'),

  // Add these
  Logger: Symbol('Logger'),
  SessionManager: Symbol('SessionManager'),
  PersonaRegistry: Symbol('PersonaRegistry'),
  ContextBuilderRegistry: Symbol('ContextBuilderRegistry'),
  ToolRegistry: Symbol('ToolRegistry'),
} as const;
```

**Step 2: Register at Bootstrap**

```typescript
// src/services/di/setup.ts
export function setupContainer() {
  const container = getContainer();

  // Core services
  container.registerSingleton(Tokens.MemoryStore, () => new FirestoreStore());
  container.registerSingleton(Tokens.SessionManager, () => new SessionManager());
  container.registerSingleton(Tokens.PersonaRegistry, () => new UnifiedPersonaRegistry());

  // Per-request services
  container.registerFactory(Tokens.Logger, (ctx) => createLogger(ctx.name));
}
```

**Step 3: Migration Order**

1. [ ] Migrate `MemoryStore` (already partially done)
2. [ ] Migrate `SessionManager`
3. [ ] Migrate `PersonaRegistry`
4. [ ] Migrate logging infrastructure
5. [ ] Migrate context builders
6. [ ] Migrate tool registry

---

## Priority 4: Increase Result Type Adoption (Medium)

### Current State

Only **20 files** use `Result<T, E>` pattern:
- `types/result.ts` (definition)
- `memory/` stores
- Some tool domains
- Tests

### Target Functions for Result Migration

| Function Type | Example | Benefit |
|---------------|---------|---------|
| Database ops | `getUserProfile()` | Explicit not-found handling |
| External APIs | `spotifySearch()` | Network error handling |
| Validation | `parseToolInput()` | Type-safe validation |
| File ops | `loadPersonaBundle()` | Missing file handling |

### Implementation

**Before:**
```typescript
async function getUser(id: string): Promise<User> {
  const user = await db.find(id);
  if (!user) {
    throw new NotFoundError(`User ${id} not found`);
  }
  return user;
}
```

**After:**
```typescript
async function getUser(id: string): AsyncResult<User, NotFoundError> {
  const user = await db.find(id);
  if (!user) {
    return failure(new NotFoundError('User', id));
  }
  return success(user);
}
```

### Migration Order

1. [ ] Start with `memory/` layer (foundational)
2. [ ] Migrate `services/` API calls
3. [ ] Migrate tool implementations
4. [ ] Migrate context builders
5. [ ] Update error boundaries in voice-agent

---

## Priority 5: Complete Incomplete Features (Medium)

### Remaining Phases from UNUSED-IMPORTS-IMPLEMENTATION-PLAN.md

| Phase | Focus | Status | Files |
|-------|-------|--------|-------|
| Phase 4 | Outreach System | Pending | 5 files, 5 imports |
| Phase 5 | Therapeutic Frameworks | Pending | 3 files, 6 imports |
| Phase 6 | Misc Systems | Pending | 8 files, 10 imports |
| Phase 7 | Cleanup | In Progress | ~800 warnings |
| Phase 8 | E2E Testing | Pending | All systems |

### Action Items

1. [ ] Complete Phase 4: Wire outreach email scheduling and analytics
2. [ ] Complete Phase 5: Wire therapeutic framework selection
3. [ ] Complete Phase 6: Fix auth, experiments, subscription, games
4. [ ] Complete Phase 7: Cleanup unused vars (run ESLint --fix)
5. [ ] Complete Phase 8: Add E2E tests for wired features

---

## Priority 6: Remove Deprecated Code (Low)

### 32 Deprecated Items

| Category | Count | Action |
|----------|-------|--------|
| Theatrical configs | 5 | Migrate to persona bundles |
| Team configs | 4 | Use `getTeamConfig()` from bundles |
| Bundle runtime | 2 | Use `SessionBundleRuntimeManager` |
| Voice call | 2 | Use persona-aware methods |
| Celebrations | 5 | Use warmth-based alternatives |
| Speech modules | 6 | Use session-scoped versions |
| Logger | 1 | Use `getLogger()` |
| Other | 7 | Address individually |

### Migration Path

1. [ ] Update all `theatrical.ts` usages to use bundle behavior
2. [ ] Replace hardcoded team configs with `getTeamConfig()`
3. [ ] Migrate to session-scoped speech analyzers
4. [ ] Replace confetti/sparkles with warmth effects
5. [ ] Remove deprecated code after migration

---

## Implementation Timeline

### Week 1: Foundation

| Day | Focus | Deliverables |
|-----|-------|--------------|
| 1-2 | Circular deps | Interface extraction, DI registration |
| 3-4 | voice-agent.ts | Split into processors/handlers/lifecycle |
| 5 | Testing | Verify all tests pass, fix regressions |

### Week 2: Patterns

| Day | Focus | Deliverables |
|-----|-------|--------------|
| 1-2 | DI migration | SessionManager, PersonaRegistry |
| 3-4 | Result types | Memory layer, API calls |
| 5 | File splits | ssml-tagger.ts, session-manager.ts |

### Week 3: Features & Cleanup

| Day | Focus | Deliverables |
|-----|-------|--------------|
| 1-2 | Phases 4-6 | Complete unused imports |
| 3-4 | Deprecations | Migrate to new patterns |
| 5 | E2E tests | Verify integrated systems |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Layer violations | 0 | 0 |
| Circular dependencies | 9 | 0 |
| Files > 500 lines | 30+ | <10 |
| DI adoption | 11 files | 50+ files |
| Result type adoption | 20 files | 50+ files |
| Tech debt items | 43 | <20 |
| Unused imports | ~800 | <50 |
| Test coverage | Good | 80%+ |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes during refactor | High | Feature flags, incremental migration |
| Test regressions | Medium | Run tests after each change |
| Performance impact from DI | Low | Lazy initialization, caching |
| Team onboarding to patterns | Medium | Documentation, code reviews |

---

## Quick Wins (Can Do Now)

1. **Run ESLint --fix** to auto-clean ~200 unused var warnings
2. **Prefix unused params** with `_` for interface compliance
3. **Remove unused type imports** (search for `import type`)
4. **Update deprecated celebration effects** (confetti → warmth)
5. **Fix session-scoped speech modules** (use getSession* methods)

---

## Commands Reference

```bash
# Check architecture
npm run quality:arch

# Find large files
find src -name "*.ts" -exec wc -l {} \; | sort -rn | head -20

# Check tech debt
npm run debt

# Run tests
npm test

# Lint with auto-fix
npx eslint src --ext .ts --fix

# Find circular deps
npx madge --circular src/
```

---

## Related Documentation

- [CLEAN-ARCHITECTURE.md](./architecture/CLEAN-ARCHITECTURE.md) - Architecture patterns
- [TECH-DEBT.md](./TECH-DEBT.md) - Current debt report
- [UNUSED-IMPORTS-IMPLEMENTATION-PLAN.md](./UNUSED-IMPORTS-IMPLEMENTATION-PLAN.md) - Feature completion
- [DOCUMENTATION-STATE.md](./DOCUMENTATION-STATE.md) - Docs cleanup status
