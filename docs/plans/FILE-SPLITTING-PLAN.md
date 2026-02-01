# File Splitting Plan

> **Target:** Reduce all files to ≤500 lines for maintainability.

Generated: 2026-01-27

---

## Priority 1: Critical Files (>3000 lines)

These files are the most complex and should be split first.

### 1. `src/cli/commands/synthetic-e2e.ts` (3,480 lines)

**Current purpose:** Synthetic E2E testing framework

**Recommended split:**
```
src/cli/commands/synthetic-e2e/
├── index.ts              # Main entry, orchestration
├── types.ts              # Type definitions
├── scenarios/
│   ├── index.ts          # Scenario registry
│   ├── conversation.ts   # Conversation scenarios
│   ├── tool-usage.ts     # Tool usage scenarios
│   └── handoff.ts        # Handoff scenarios
├── runners/
│   ├── test-runner.ts    # Test execution
│   └── report-generator.ts # Report generation
└── utils/
    ├── assertions.ts     # Test assertions
    └── fixtures.ts       # Test fixtures
```

---

### 2. `src/tools/semantic-router/domain-bridge.ts` (3,478 lines)

**Current purpose:** Maps tool intents to domains

**Recommended split:**
```
src/tools/semantic-router/domain-bridge/
├── index.ts              # Main exports, bridge API
├── types.ts              # Type definitions
├── mappings/
│   ├── calendar.ts       # Calendar domain mappings
│   ├── communication.ts  # Communication domain mappings
│   ├── entertainment.ts  # Entertainment domain mappings
│   ├── finance.ts        # Finance domain mappings
│   ├── habits.ts         # Habits domain mappings
│   ├── wellness.ts       # Wellness domain mappings
│   └── research.ts       # Research domain mappings
├── matchers/
│   ├── keyword-matcher.ts
│   └── pattern-matcher.ts
└── utils.ts              # Shared utilities
```

---

### 3. `src/agents/shared/json-function-executor.ts` (3,447 lines)

**Current purpose:** Routes JSON function calls to tool implementations

**Recommended split:**
```
src/agents/shared/json-function-executor/
├── index.ts              # Main exports
├── types.ts              # Type definitions
├── parser.ts             # JSON parsing logic
├── router.ts             # Tool routing logic
├── executors/
│   ├── calendar-executor.ts
│   ├── communication-executor.ts
│   ├── entertainment-executor.ts
│   ├── memory-executor.ts
│   ├── handoff-executor.ts
│   └── research-executor.ts
├── validators/
│   └── argument-validator.ts
└── error-handler.ts      # Error handling
```

---

### 4. `src/agents/processors/turn-processor.ts` (3,412 lines)

**Current purpose:** Processes each conversation turn

**Recommended split:**
```
src/agents/processors/turn-processor/
├── index.ts              # Main processor, orchestration
├── types.ts              # Type definitions
├── phases/
│   ├── pre-process.ts    # Pre-LLM processing
│   ├── context-build.ts  # Context assembly
│   ├── llm-call.ts       # LLM invocation
│   └── post-process.ts   # Post-LLM processing
├── injections/
│   ├── personality.ts    # Personality injections
│   ├── memory.ts         # Memory injections
│   └── emotional.ts      # Emotional injections
└── utils/
    ├── metrics.ts        # Performance metrics
    └── logging.ts        # Turn logging
```

---

### 5. `src/api/scheduled-jobs.routes.ts` (3,222 lines)

**Current purpose:** Cloud Scheduler job handlers

**Recommended split:**
```
src/api/scheduled-jobs/
├── index.ts              # Main router, job registration
├── types.ts              # Type definitions
├── jobs/
│   ├── memory-jobs.ts    # Memory maintenance jobs
│   ├── calendar-jobs.ts  # Calendar sync jobs
│   ├── cleanup-jobs.ts   # Data cleanup jobs
│   ├── insights-jobs.ts  # Insight generation jobs
│   ├── notification-jobs.ts # Notification jobs
│   └── analytics-jobs.ts # Analytics jobs
├── middleware/
│   └── auth.ts           # Job authentication
└── utils/
    └── scheduling.ts     # Scheduling utilities
```

---

## Priority 2: High Impact Files (2500-3000 lines)

### 6. `src/agents/processors/injection-builders.ts` (2,894 lines)

**Split into:**
- `injection-builders/personality.ts`
- `injection-builders/memory.ts`
- `injection-builders/emotional.ts`
- `injection-builders/behavioral.ts`
- `injection-builders/awareness.ts`
- `injection-builders/index.ts`

---

### 7. `src/agents/voice-agent-entry.ts` (2,762 lines)

**Split into:**
- `voice-agent/entry/index.ts` - Main entry
- `voice-agent/entry/initialization.ts` - Init logic
- `voice-agent/entry/tool-setup.ts` - Tool gateway setup
- `voice-agent/entry/session-setup.ts` - Session setup
- `voice-agent/entry/cleanup.ts` - Cleanup handlers

---

### 8. `src/agents/voice-agent/turn-handler.ts` (2,621 lines)

**Split into:**
- `turn-handler/index.ts` - Main handler
- `turn-handler/speech-processing.ts` - Speech processing
- `turn-handler/tool-handling.ts` - Tool call handling
- `turn-handler/response-generation.ts` - Response generation

---

## Priority 3: Medium Impact Files (2000-2500 lines)

| File | Lines | Suggested Split |
|------|-------|-----------------|
| `meaningful-silence.ts` | 2,431 | By silence type (reflective, processing, listening) |
| `music-player.ts` | 2,374 | By provider (spotify, local, ambient) |
| `transcript-handler.ts` | 2,359 | By function (extraction, analysis, storage) |
| `rust-accelerator.ts` | 2,321 | By capability (audio, embedding, processing) |
| `session-manager.ts` | 2,309 | By concern (lifecycle, state, cleanup) |
| `indexing-policy.ts` | 2,308 | By policy type |
| `superhuman-outreach-intelligence.ts` | 2,294 | By intelligence type |

---

## Implementation Strategy

### Phase 1: Non-Breaking Refactor (Week 1-2)

1. Create new directory structure
2. Extract code into new files
3. Re-export from original file for backward compatibility
4. Update imports gradually

### Phase 2: Import Cleanup (Week 3)

1. Update all imports to use new paths
2. Remove re-exports from original files
3. Delete original files
4. Run full test suite

### Phase 3: Verification (Week 4)

1. Run `pnpm quality` to verify
2. Run `pnpm test` to catch regressions
3. Deploy to staging
4. Monitor for issues

---

## Quick Wins (Files with Clear Split Points)

1. **scheduled-jobs.routes.ts** - Each job handler is independent
2. **domain-bridge.ts** - Each domain mapping is independent
3. **injection-builders.ts** - Each builder category is independent

---

## Commands

```bash
# Check current file sizes
pnpm quality:check | grep "Large files"

# After splitting, verify architecture
pnpm quality:arch

# Run tests to verify no regressions
pnpm test
```

---

## Notes

- Always maintain backward compatibility via re-exports during transition
- Update CLAUDE.md files when splitting modules
- Add appropriate documentation to new directories
- Consider adding barrel exports (index.ts) for cleaner imports
