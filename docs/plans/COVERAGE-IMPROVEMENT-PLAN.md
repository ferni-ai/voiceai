# Test Coverage Improvement Plan

> Goal: Reach 60% coverage across all metrics for production readiness

## Current State (December 2024)

**Actual Coverage** (as of Dec 23, 2024):

| Metric | Actual | Target | Gap |
|--------|--------|--------|-----|
| Lines | 39.45% | 60% | -20.55% |
| Functions | 42.32% | 60% | -17.68% |
| Branches | 32.25% | 55% | -22.75% |
| Statements | 38.92% | 60% | -21.08% |

**Thresholds** set to prevent regressions (slightly below actual):
- Lines: 38%, Functions: 41%, Branches: 31%, Statements: 38%

### New Tests Added (Phase 3)

- `src/agents/voice-agent/__tests__/slash-command-handler.test.ts` (15 tests)
- `src/agents/voice-agent/__tests__/transcript-validator.test.ts` (50 tests)
- `src/api/__tests__/helpers.test.ts` (33 tests)
- Fixed 2 flaky tests (probabilistic + performance timing)

## Test Infrastructure

### CI Pipeline (Parallel Jobs)
- **Unit Tests** (`test:unit`) - Fast ~1-2 min, runs `src/**/__tests__/**/*.test.ts`
- **Integration Tests** (`test:integration`) - Slower ~3-5 min, runs `src/tests/**/*.test.ts`
- **E2E Tests** (`test:e2e:vitest`) - Manual, requires external services

### Config Files
- `vitest.config.unit.ts` - Unit tests only
- `vitest.config.integration.ts` - Integration tests
- `vitest.config.e2e.ts` - E2E tests (vitest-based)
- `vitest.config.ts` - Main config with coverage thresholds

---

## Phase 1: Foundation (32% → 40%)

### High-Impact Areas to Test

1. **Core Services** (highest ROI)
   - `src/services/session-manager.ts` - Session lifecycle
   - `src/services/di/container.ts` - Dependency injection
   - `src/services/persona-content-loader.ts` - Content loading

2. **Agent Shared Logic**
   - `src/agents/shared/json-function-executor.ts` - Tool execution
   - `src/agents/shared/tool-call-sanitizer.ts` - JSON extraction
   - `src/agents/shared/safe-generate-reply.ts` - LLM response handling

3. **Critical Utilities**
   - `src/utils/logger.ts` - Logging (used everywhere)
   - `src/utils/result.ts` - Result type handling

### Actions
- [ ] Add tests for untested utility functions
- [ ] Mock external services properly (Gemini, Firestore)
- [ ] Update threshold: `lines: 40, functions: 40, branches: 36, statements: 40`

---

## Phase 2: Core Features (40% → 50%)

### High-Impact Areas

1. **Persona System**
   - `src/personas/bundles/loader.ts` - Bundle loading
   - `src/personas/bundles/runtime.ts` - Runtime behavior
   - `src/personas/bundles/adapter.ts` - Legacy adapter

2. **Intelligence Layer**
   - `src/intelligence/context-builders/` - Context injection
   - `src/intelligence/user-learning-engine/` - Learning system

3. **Tool System**
   - `src/tools/registry/loader.ts` - Tool loading
   - `src/tools/dynamic-loader.ts` - Dynamic loading
   - `src/tools/natural-tool-calling.ts` - Natural language parsing

### Actions
- [ ] Add integration tests for persona loading
- [ ] Test context builder outputs
- [ ] Update threshold: `lines: 50, functions: 50, branches: 46, statements: 50`

---

## Phase 3: Production Ready (50% → 60%)

### Remaining Areas

1. **Voice Agent Core**
   - `src/agents/voice-agent/` - Handler tests
   - `src/agents/multi-agent/` - Orchestration tests

2. **API Routes**
   - `src/api/` - Route handler tests
   - Mock request/response patterns

3. **Speech Processing**
   - `src/speech/` - SSML generation
   - `src/speech/adaptive-ssml/` - Dynamic speech

### Actions
- [ ] Add handler tests with mocked dependencies
- [ ] Test API routes with supertest
- [ ] Update threshold: `lines: 60, functions: 60, branches: 55, statements: 60`

---

## Quick Wins (Low Effort, High Impact)

These files are heavily used but easy to test:

| File | Reason | Effort |
|------|--------|--------|
| `src/utils/logger.ts` | Pure functions | Low |
| `src/types/profile/migration.ts` | Data transformation | Low |
| `src/memory/embedding-cache.ts` | Cache logic | Medium |
| `src/personality/emotional-patterns.ts` | Pattern matching | Low |

---

## Testing Patterns

### Unit Test Template
```typescript
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from '../my-module.js';

describe('myFunction', () => {
  it('should handle normal input', () => {
    expect(myFunction('input')).toBe('expected');
  });

  it('should handle edge cases', () => {
    expect(myFunction('')).toBe('default');
  });
});
```

### Mocking External Services
```typescript
vi.mock('../services/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null), // Returns null = graceful degradation
}));
```

### Testing Async Functions
```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result.success).toBe(true);
});
```

---

## Monitoring Progress

```bash
# Run tests with coverage
pnpm test:coverage

# Check coverage thresholds (will fail if below)
pnpm vitest run --coverage

# Generate HTML report
open coverage/index.html
```

---

## Timeline

| Phase | Target | Timeline |
|-------|--------|----------|
| Foundation | 40% | 2 weeks |
| Core Features | 50% | 4 weeks |
| Production Ready | 60% | 6 weeks |

---

## Success Criteria

- [ ] All CI test jobs passing
- [ ] Coverage thresholds met (60%)
- [ ] No flaky tests (retry < 1%)
- [ ] Test execution under 5 minutes for unit tests
- [ ] Integration tests under 10 minutes

---

*Created: December 2024*
*Last Updated: December 2024*
