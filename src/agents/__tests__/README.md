# Voice Agent E2E Testing Infrastructure

Comprehensive testing infrastructure for the Ferni voice agent system.

## 📁 Directory Structure

```
src/agents/__tests__/
├── mocks/                    # Mock infrastructure
│   ├── index.ts              # Unified exports
│   ├── livekit-mock.ts       # LiveKit SDK mocks
│   ├── llm-mock.ts           # LLM/Gemini mocks
│   ├── tts-mock.ts           # TTS provider mocks
│   └── services-mock.ts      # Session services mocks
├── fixtures/                 # Test data and scenarios
│   ├── index.ts              # Common test data
│   └── multi-turn-scenarios.ts
├── integration/              # Integration tests
│   ├── session-lifecycle.test.ts
│   └── turn-processing.test.ts
├── contracts/                # API contract tests
│   └── frontend-messages.test.ts
├── chaos/                    # Chaos/resilience tests
│   └── service-failures.test.ts
├── diagnostics/              # Diagnostics integration
│   └── diagnostics-integration.test.ts
├── performance/              # Performance tests
│   └── startup-regression.test.ts
├── snapshots/                # Snapshot tests
│   └── injection-snapshots.test.ts
├── scenarios/                # Multi-turn scenarios
│   └── multi-turn-conversation.test.ts
└── processors/__tests__/     # Turn processor tests
    ├── test-utils.ts
    └── turn-processor.test.ts
```

## 🚀 Quick Start

### Run All Agent Tests

```bash
# Run all agent tests
pnpm vitest run src/agents/__tests__/

# Run with coverage
pnpm vitest run src/agents/__tests__/ --coverage

# Watch mode
pnpm vitest src/agents/__tests__/
```

### Run Specific Test Suites

```bash
# Unit tests
pnpm vitest run src/agents/__tests__/*.test.ts

# Integration tests
pnpm vitest run src/agents/__tests__/integration/

# Contract tests
pnpm vitest run src/agents/__tests__/contracts/

# Chaos tests
pnpm vitest run src/agents/__tests__/chaos/

# Performance tests
pnpm vitest run src/agents/__tests__/performance/

# Snapshot tests
pnpm vitest run src/agents/__tests__/snapshots/

# Multi-turn scenarios
pnpm vitest run src/agents/__tests__/scenarios/
```

## 🧪 Test Categories

### 1. Mock Infrastructure

The `mocks/` directory provides comprehensive mocks for all external dependencies:

```typescript
import {
  setupAllMocks,
  createMockJobContext,
  createMockLLMClient,
  createMockSessionServices,
} from './mocks/index.js';

// Setup all mocks BEFORE importing modules under test
setupAllMocks();

// Then use mock factories
const llm = createMockLLMClient();
llm.queueResponse('I understand. Let me help.');
```

### 2. Test Fixtures

The `fixtures/` directory provides consistent test data:

```typescript
import { users, conversations, emotionalStates, scenarios } from './fixtures/index.js';

// Use pre-defined user profiles
const user = users.returningUser;

// Use emotional state fixtures
const emotion = emotionalStates.happy;

// Use complete conversation scenarios
const conversation = conversations.supportSeeking;
```

### 3. Integration Tests

Test complete flows with mocked dependencies:

- **Session Lifecycle**: Connection, initialization, cleanup
- **Turn Processing**: Message analysis, context injection, response

### 4. Contract Tests

Validate frontend/backend message formats:

```typescript
import {
  MoodMessageSchema,
  CelebrationEventSchema,
  validateMoodMessage,
} from './contracts/frontend-messages.test.js';

// Validate message format
const isValid = validateMoodMessage(message);
```

### 5. Chaos Tests

Test graceful degradation:

- LLM timeouts and failures
- TTS failures
- Network interruptions
- Service unavailability

### 6. Performance Tests

Track performance budgets:

```typescript
import { PERFORMANCE_BUDGETS, measureTime } from './performance/startup-regression.test.js';

const { durationMs } = await measureTime(() => processTurn(ctx));
expect(durationMs).toBeLessThan(PERFORMANCE_BUDGETS.TOTAL_TURN_PROCESSING_MAX_MS);
```

### 7. Snapshot Tests

Catch unintended changes to injection formats:

```typescript
const injections = buildHumanizingInjections(context);
expect(injections).toMatchSnapshot();
```

### 8. Multi-Turn Scenarios

Test complete conversation flows:

- Emotional Support Journey
- Celebration Scenario
- Coaching Session
- Handoff Scenario
- Crisis Detection
- New User Onboarding

## 📊 Performance Budgets

| Metric                | Budget  |
| --------------------- | ------- |
| Core imports          | < 3s    |
| Total prewarm         | < 15s   |
| Turn analysis         | < 100ms |
| Context building      | < 50ms  |
| Total turn processing | < 200ms |
| First byte latency    | < 500ms |

## 🔧 Writing New Tests

### Using Mocks

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setupAllMocks, resetAllMocks, createMockLLMClient } from './mocks/index.js';

// Setup mocks FIRST
const mockLLM = createMockLLMClient();
setupAllMocks({ llmClient: mockLLM });

describe('My Test Suite', () => {
  beforeEach(() => {
    resetAllMocks();
    mockLLM.clearHistory();
  });

  it('should do something', async () => {
    mockLLM.queueResponse('Expected response');
    const result = await myFunction();
    expect(result).toBe('Expected response');
  });
});
```

### Using Fixtures

```typescript
import { users, emotionalStates, scenarios } from './fixtures/index.js';

describe('Emotional Processing', () => {
  it('should handle distressed user', () => {
    const user = users.distressedUser;
    const emotion = emotionalStates.distressed;
    // ... test logic
  });
});
```

### Using Multi-Turn Scenarios

```typescript
import {
  emotionalSupportJourney,
  type MultiTurnScenario,
} from './fixtures/multi-turn-scenarios.js';

describe('Emotional Support', () => {
  const scenario = emotionalSupportJourney;

  it('should complete full journey', async () => {
    for (const turn of scenario.turns) {
      const result = await processTurn(turn.userMessage);
      expect(result.emotion.primary).toBe(turn.expectedEmotion.primary);
    }
  });
});
```

## 🔄 CI Integration

Tests run automatically on:

- Push to main (agents/conversation changes)
- Pull requests touching agents/conversation
- Manual workflow dispatch

See `.github/workflows/agent-e2e.yml` for configuration.

## 📈 Coverage Goals

| Category          | Goal         |
| ----------------- | ------------ |
| Unit tests        | > 80%        |
| Integration tests | > 70%        |
| Contract tests    | 100% schemas |
| Critical paths    | 100%         |

## 🐛 Debugging Tests

```bash
# Run with verbose output
pnpm vitest run --reporter=verbose

# Run single test file
pnpm vitest run src/agents/__tests__/path/to/test.ts

# Run with debugging
pnpm vitest run --inspect-brk

# Update snapshots
pnpm vitest run -u
```

## 📚 Related Documentation

- [LOADING-ARCHITECTURE.md](../LOADING-ARCHITECTURE.md) - Agent loading flow
- [REFACTORING-GUIDE.md](../REFACTORING-GUIDE.md) - Refactoring guidelines
- [voice-agent-child.ts](../voice-agent-child.ts) - Main agent entry point
