# Architecture Audit Summary - src/agents

**Date:** December 25, 2024
**Audited By:** Clean Architecture Review

---

## Executive Summary

The `src/agents` module is the voice agent implementation at Level 100 (Application Layer). This audit identified several large files exceeding the 500-line guideline and created modular refactorings with backward-compatible exports.

---

## Completed Refactorings

### 1. Tool Call Sanitizer (`shared/sanitizer/`)

**Before:** `tool-call-sanitizer.ts` - 3,041 lines
**After:** Modular structure with focused modules

```
shared/sanitizer/
├── config/
│   └── tool-patterns.json    # 600+ patterns extracted from code
├── types.ts                  # Shared type definitions
├── detectors/
│   ├── patterns-loader.ts    # Loads patterns from JSON config
│   └── leakage-detector.ts   # Detection logic (patterns, announcements, etc.)
├── executors/
│   ├── deduplication.ts      # Session-scoped tool dedup
│   └── retry-analyzer.ts     # Retry logic for failed tool calls
├── streams/
│   └── transform-stream.ts   # Real-time sanitization streams
├── CLAUDE.md                 # Module documentation
└── index.ts                  # Backward-compatible exports
```

**Benefits:**
- Tool patterns in JSON config (easy to update without code changes)
- Focused modules under 300 lines each
- Session-scoped state management
- Clear separation: detection vs execution vs streaming

### 2. Voice Agent Entry Phases (`voice-agent/phases/`)

**New modules added:**
- `performance-init.ts` - Performance optimization initialization
- `connection-state.ts` - Connection monitoring with cleanup tracking
- `tool-setup.ts` - Tool orchestrator and voice localization

**Benefits:**
- Discrete, testable initialization phases
- Clean cleanup tracking integration
- Reusable across different agent entry points

---

## Architecture Validation

Existing script: `apps/cli/src/commands/quality/architecture-validator.ts`
Run with: `pnpm quality:arch`

**Layer Levels:**
| Level | Directories |
|-------|-------------|
| 100 | agents/, api/, cli/ |
| 70 | personas/, intelligence/, tools/, conversation/, speech/ |
| 60 | services/ |
| 30 | memory/ |
| 10-20 | config/, utils/, types/ |

**Rules:**
- Lower layers cannot import from higher layers
- Domain layer peers (L70) can import each other

---

## Remaining Large Files (Candidates for Future Refactoring)

| File | Lines | Priority |
|------|-------|----------|
| `json-function-executor.ts` | 2,673 | Medium |
| `voice-agent-entry.ts` | 2,169 | Medium |
| `processors/turn-processor.ts` | 1,750 | Medium |
| `processors/injection-builders.ts` | 1,627 | Low |

**Note:** These files are exempted in the architecture validator's `LINE_LIMIT_EXEMPTIONS` set until refactoring is complete.

---

## Module-Level State Analysis

Acceptable patterns found:
1. **Caching** (e.g., `cachedVoiceDeps`) - Performance optimization
2. **Singleton counters** (e.g., crash analytics) - Process-level state
3. **Configuration** (e.g., feature flags) - Read once, used throughout

Session-scoped state now properly managed:
- Tool deduplication cache uses session IDs
- Cleanup trackers tied to session lifecycle
- Event handlers registered with cleanup callbacks

---

## Testing Recommendations

1. **Sanitizer Module:**
   ```bash
   pnpm vitest run src/agents/shared/sanitizer
   ```

2. **Architecture Validation:**
   ```bash
   pnpm quality:arch
   ```

3. **Full Agent Tests:**
   ```bash
   pnpm vitest run src/agents/__tests__/
   ```

---

## Migration Notes

### For Existing Code Using Old Imports

Old imports still work (re-exported from new modules):
```typescript
// Old (still works)
import { detectsFunctionCallLeakage } from './shared/tool-call-sanitizer.js';

// New (preferred)
import { detectsFunctionCallLeakage } from './shared/sanitizer/index.js';
```

### Adding New Tool Patterns

1. Edit `shared/sanitizer/config/tool-patterns.json`
2. Add to appropriate domain or create new domain
3. No code changes needed - patterns load dynamically
4. Test with: `pnpm vitest run src/agents/shared/sanitizer`

---

## Quality Gates Enforced

- TypeScript strict mode: ✅
- No module-level mutable session state: ✅
- Cleanup handlers for all event listeners: ✅
- Structured logging (no console.log): ✅
- Layer boundary enforcement: ✅

---

*This document should be updated as additional refactoring is completed.*

