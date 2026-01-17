# Large File Splitting Plan

> **Goal:** Reduce files over 2000 lines to improve maintainability.

## Current State (January 2026)

**20 files over 2000 lines identified:**

| File | Lines | Priority | Complexity | Notes |
|------|-------|----------|------------|-------|
| `apps/cli/src/index.ts` | 10,685 | High | High | 109 handler functions - major refactor |
| `apps/web/src/ui/dev-panel.ui.ts` | 7,764 | Medium | Medium | Dev-only, can split by feature |
| `src/agents/shared/tool-call-sanitizer.ts` | ~~4,005~~ 0 | ✅ DONE | - | **DELETED** - Migrated to modular `sanitizer/` directory |
| `apps/web/src/ui/calendar-view.ui.ts` | 3,725 | Medium | Medium | UI component |
| `apps/web/src/app.ts` | 3,592 | Medium | High | Main app entry |
| `src/cli/commands/synthetic-e2e.ts` | 3,480 | Low | Low | Test file |
| `apps/web/src/ui/roadmap-panel.ui.ts` | 3,303 | Low | Low | Feature panel |
| `apps/web/src/ui/settings-menu.ui.ts` | 3,052 | Medium | Medium | UI component |
| `src/agents/voice-agent-entry.ts` | 3,023 | High | High | Critical path |
| `src/agents/shared/json-function-executor.ts` | 2,978 | High | Medium | Related to sanitizer |
| `src/agents/processors/turn-processor.ts` | 2,935 | High | High | Critical path |
| `apps/web/src/ui/semantic-intelligence-panel.ui.ts` | 2,846 | Low | Medium | Feature panel |
| `apps/web/src/app/data-message-handlers.ts` | 2,753 | Medium | Medium | Message handling |
| `apps/web/src/ui/game-board.ui.ts` | 2,522 | Low | Low | Feature component |
| `apps/web/src/ui/marketplace.ui.ts` | 2,519 | Low | Low | Feature component |
| `apps/web/src/ui/team.ui.ts` | 2,461 | Medium | Medium | Core UI |
| `src/personas/meaningful-silence.ts` | 2,406 | Medium | Medium | Silence handling |
| `apps/web/src/ui/custom-agent-wizard.ui.ts` | 2,400 | Low | Medium | Wizard UI |
| `src/agents/voice-agent/transcript-handler.ts` | 2,345 | High | Medium | Voice agent |
| `apps/web/src/ui/vibe-controller.ui.ts` | 2,326 | Low | Low | Feature component |

## Splitting Strategies

### 1. CLI Index (apps/cli/src/index.ts) - 10,685 lines

**Strategy:** Move handler functions to commands/ directory

```
apps/cli/src/
├── index.ts              # Entry point, routing only (~500 lines)
└── commands/
    ├── agents.ts         # handleAgents, handleAgent
    ├── logs.ts           # handleLogs, handleLogsAnalyze, etc.
    ├── status.ts         # handleStatus
    ├── doctor.ts         # handleDoctor
    ├── db.ts             # handleDb
    ├── tokens.ts         # handleTokens
    ├── design.ts         # handleDesign
    ├── env.ts            # handleEnv
    ├── dev.ts            # handleDev
    ├── personas.ts       # handlePersonas
    ├── quality.ts        # handleQuality
    ├── pr.ts             # handlePR
    ├── tools.ts          # handleTools
    ├── ftis.ts           # handleFTIS
    ├── jobs.ts           # handleJobs
    ├── costs.ts          # handleCosts
    ├── voices.ts         # handleVoices, handleVoice
    └── ... (more as needed)
```

**Estimated effort:** 4-6 hours

### 2. Tool Call Sanitizer (src/agents/shared/tool-call-sanitizer.ts) - ✅ COMPLETED

**Status:** DELETED on January 16, 2026

The modular `sanitizer/` directory already existed with the split architecture. The migration was completed by:
1. Updating 4 test files to use `./sanitizer/index.js`
2. Updating 5 dynamic imports in voice-agent and semantic-router
3. Deleting the 4,005-line deprecated file

**Final structure:**
```
src/agents/shared/sanitizer/
├── config/
│   └── tool-patterns.json    # Single source of truth for patterns
├── detectors/
│   ├── patterns-loader.ts    # Loads patterns from JSON
│   └── leakage-detector.ts   # Detection logic
├── executors/
│   ├── deduplication.ts      # Tool execution dedup
│   └── retry-analyzer.ts     # Retry logic
├── streams/
│   └── transform-stream.ts   # Real-time sanitization
├── types.ts
└── index.ts                  # Backward-compatible exports
```

**Lines removed:** 4,005

### 3. Voice Agent Entry (src/agents/voice-agent-entry.ts) - 3,023 lines

**Strategy:** Extract phases and handlers

```
src/agents/voice-agent/
├── entry.ts              # Main entry (~500 lines)
├── phases/               # Already exists, move more here
├── handlers/             # Event handlers
└── setup/                # Initialization logic
```

**Estimated effort:** 2-3 hours

### 4. UI Components (apps/web/src/ui/*.ts)

**Strategy:** For each large UI component, extract:
- Types to `*.types.ts`
- Styles to `*.styles.ts`
- Sub-components to separate files
- Keep main file as orchestrator

**Estimated effort:** 1-2 hours per file

## Recommended Order

1. **Phase 1 - Quick Wins (Low Risk)**
   - ✅ ~~Extract pure constants/patterns from tool-call-sanitizer~~ DONE - file deleted
   - Extract types from meaningful-silence.ts
   - Extract test helpers from synthetic-e2e.ts

2. **Phase 2 - Medium Impact**
   - Split CLI index.ts into command modules
   - Split voice-agent-entry.ts phases

3. **Phase 3 - UI Components**
   - Split dev-panel.ui.ts (dev-only, safe to refactor)
   - Split settings-menu.ui.ts
   - Split other UI components

## Tracking

Run this command to check progress:

```bash
pnpm ci:quality-gates
```

Current threshold: 2,100 files over 500 lines
Goal: Reduce to under 2,000 files

## Success Criteria

- [ ] No files over 5,000 lines
- [ ] CLI index.ts under 1,000 lines
- [ ] All critical-path files under 2,000 lines
- [ ] Large files count under 2,000

---

*Created: January 2026*
