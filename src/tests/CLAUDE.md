# Integration Tests (`src/tests/`)

> **Centralized integration and E2E tests for cross-module functionality.**

This directory contains tests that span multiple modules - integration tests, E2E flows, and comprehensive feature tests. Unit tests live in each module's `__tests__/` folder.

---

## Test Organization

| Pattern | Location | Purpose |
|---------|----------|---------|
| `*.test.ts` | Here | Integration tests |
| `*.e2e.test.ts` | Here | End-to-end flows |
| `*.integration.test.ts` | Here | Cross-service tests |
| `__tests__/*.test.ts` | Per module | Unit tests |

---

## Key Test Suites

### Better Than Human (Superhuman Features)
| File | Tests |
|------|-------|
| `better-than-human-e2e.test.ts` | Full superhuman flow |
| `better-than-human-integrations.test.ts` | Service integrations |
| `better-than-human-comprehensive.test.ts` | All 45 capabilities |
| `better-than-human-services.test.ts` | Individual services |
| `better-than-human-gaps.test.ts` | Missing capability detection |

### Persona Tests
| File | Tests |
|------|-------|
| `alex-chen-persona-e2e.test.ts` | Alex communication persona |
| `behavior-system-e2e.test.ts` | Persona behavior system |
| `persona-*.test.ts` | Per-persona validation |

### Voice Agent Tests
| File | Tests |
|------|-------|
| `agent-orchestration.test.ts` | Multi-agent coordination |
| `agent-bus.test.ts` | Event bus patterns |
| `active-listening.test.ts` | Listening behaviors |
| `adaptive-endpointing.test.ts` | Turn detection |

### API & Integration Tests
| File | Tests |
|------|-------|
| `api-integrations.test.ts` | External API integrations |
| `api-helpers.test.ts` | API utility functions |
| `auth-middleware.test.ts` | Authentication flows |

### Humanization Tests
| File | Tests |
|------|-------|
| `advanced-humanization-integration.e2e.test.ts` | Full humanization pipeline |
| `awareness-system.test.ts` | Context awareness |
| `behavior-tools.test.ts` | Behavior triggers |

---

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `__snapshots__/` | Jest/Vitest snapshots |
| `better-than-human/` | BTH-specific test fixtures |
| `e2e/` | End-to-end test suites |
| `fixtures/` | Test data and mocks |
| `unit/` | Additional unit tests |
| `services/` | Service-specific tests |
| `integrations/` | Integration test suites |

---

## Running Tests

```bash
# All integration tests
pnpm vitest run src/tests/

# Specific test file
pnpm vitest run src/tests/better-than-human-e2e.test.ts

# Watch mode
pnpm vitest src/tests/

# With coverage
pnpm vitest run src/tests/ --coverage

# E2E tests only
pnpm vitest run src/tests/*.e2e.test.ts
```

---

## Test Patterns

### Standard Test Structure
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestSession, cleanupTestSession } from './fixtures/session.js';

describe('FeatureName', () => {
  let session: TestSession;

  beforeEach(async () => {
    session = await createTestSession();
  });

  afterEach(async () => {
    await cleanupTestSession(session);
  });

  it('should do something specific', async () => {
    // Arrange
    const input = createTestInput();

    // Act
    const result = await featureUnderTest(input);

    // Assert
    expect(result.success).toBe(true);
  });
});
```

### Mocking Firestore
```typescript
import { mockFirestore } from './fixtures/firestore-mock.js';

beforeEach(() => {
  mockFirestore.reset();
  mockFirestore.setData('bogle_users/test-user', { name: 'Test' });
});
```

### Testing with Emulators
```bash
# Start Firestore emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/tests/
```

---

## Fixture Conventions

| Fixture | Location | Purpose |
|---------|----------|---------|
| Test users | `fixtures/users.ts` | Standard test user data |
| Sessions | `fixtures/session.ts` | Session setup/teardown |
| Personas | `fixtures/personas.ts` | Test persona configs |
| Mocks | `fixtures/*-mock.ts` | Service mocks |

---

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 60% |
| Branches | 50% |
| Functions | 60% |

```bash
# Check coverage
pnpm vitest run --coverage
```

---

## Rules

### Do
- Clean up test resources in `afterEach`
- Use descriptive test names
- Test both success and failure cases
- Mock external services (Firestore, APIs)
- Use fixtures for common test data

### Don't
- Leave test data in production Firestore
- Skip cleanup in async tests
- Hardcode user IDs that might conflict
- Test implementation details (test behavior)
- Write flaky tests with timing dependencies

---

## Related Documentation

- `vitest.config.ts` - Test configuration
- `src/*/\__tests__/` - Per-module unit tests
- `e2e/CLAUDE.md` - Playwright browser tests
- `tests/CLAUDE.md` - Additional test infrastructure

---

*Last updated: January 2026*
