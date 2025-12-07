# VoiceAI Clean Architecture

This document provides an overview of the VoiceAI codebase architecture after the clean architecture refactoring.

## Directory Structure

```
src/
├── agents/                    # Voice agent implementations
│   ├── voice-agent.ts         # Main agent (2648 lines, orchestrator)
│   └── shared/                # Extracted shared utilities
│       ├── types.ts           # UserData, session types
│       ├── constants.ts       # Delays, thresholds
│       ├── session-setup.ts   # Session initialization
│       ├── context-helpers.ts # Easter eggs, response guidance
│       ├── handoff-handler.ts # Voice switch handling (NEW)
│       └── health-server.ts   # Cloud Run health check
│
├── services/                  # Business services
│   ├── index.ts               # Barrel file (re-exports)
│   ├── types.ts               # SessionServices, GlobalServices
│   ├── global-services.ts     # Service initialization
│   ├── session-manager.ts     # Session lifecycle
│   ├── shutdown.ts            # Graceful shutdown
│   └── di/                    # Dependency Injection (NEW)
│       ├── container.ts       # DI container implementation
│       ├── setup.ts           # Bootstrap all services
│       └── index.ts           # Barrel file
│
├── tools/                     # LLM tool implementations
│   ├── index.ts               # Clean barrel file
│   ├── factory.ts             # Tool creation functions
│   ├── lifecycle.ts           # Init/shutdown
│   ├── categories.ts          # Documentation
│   ├── handoff/               # Handoff subsystem (partial)
│   │   ├── types.ts
│   │   ├── phrases.ts
│   │   ├── state.ts
│   │   └── detection.ts
│   ├── consolidated/          # LLM-optimized combined tools (NEW)
│   │   ├── financial.ts       # Market + calculators + personal finance
│   │   ├── memory.ts          # Remember + recall + search
│   │   └── productivity.ts    # Tasks + shopping + notes + habits
│   └── maya-habit/            # Maya habit coaching (NEW)
│       ├── types.ts           # Type definitions
│       ├── domains.ts         # Life domains & stages
│       ├── challenges.ts      # 30-day challenges
│       └── bundles.ts         # Habit bundles
│
├── types/                     # Shared types
│   ├── index.ts               # Barrel file
│   ├── result.ts              # Result<T,E> for error handling (NEW)
│   ├── result-utils.ts        # Test utilities for Result (NEW)
│   └── profile/               # UserProfile bounded contexts (NEW)
│       ├── identity.ts
│       ├── communication.ts
│       ├── financial.ts
│       └── index.ts
│
├── ssml/                      # Speech markup (partial migration)
│   ├── types.ts
│   ├── cartesia.ts
│   ├── core.ts
│   └── index.ts
│
└── memory/                    # Storage layer
    ├── store.ts               # MemoryStore interface
    ├── in-memory-store.ts     # Test implementation
    ├── firestore-store.ts     # Production implementation
    └── vector-store.ts        # Semantic search
```

## Key Architectural Patterns

### 1. Result Types for Error Handling

Instead of throwing exceptions, use explicit Result types:

```typescript
import { Result, success, failure, isSuccess } from '../types/result.js';

async function getUser(id: string): AsyncResult<User, NotFoundError> {
  const user = await db.find(id);
  if (!user) {
    return failure(new NotFoundError('User', id));
  }
  return success(user);
}

// Usage
const result = await getUser('123');
if (isSuccess(result)) {
  console.log(result.data.name);
} else {
  console.error(result.error.message);
}
```

### 2. Dependency Injection

Use the DI container for testable service dependencies:

```typescript
import { getContainer, Tokens } from '../services/di/index.js';

// Registration (at startup)
const container = getContainer();
container.registerSingleton(Tokens.MemoryStore, () => new FirestoreStore());

// Resolution (where needed)
const store = container.resolve<MemoryStore>(Tokens.MemoryStore);

// Testing (override with mocks)
const testContainer = container.createScope();
testContainer.registerInstance(Tokens.MemoryStore, mockStore);
```

### 3. Consolidated Tools

Reduce LLM tool count by combining related operations:

```typescript
// Before: 15+ individual tools
createTaskTools()      // add, list, complete, delete
createShoppingTools()  // add, list, mark, remove
createNoteTools()      // save, list, delete
// ... etc

// After: 1 consolidated tool
createConsolidatedProductivityTool()
// Handles all with: { domain: 'tasks', action: 'add', text: '...' }
```

### 4. Modular File Organization

Large files are split by responsibility:

| Pattern | Example |
|---------|---------|
| Types in `types.ts` | Interfaces, type aliases |
| Constants in `constants.ts` | Delays, thresholds, limits |
| Logic in focused files | `session-setup.ts`, `handoff-handler.ts` |
| Barrel files for exports | `index.ts` re-exports everything |

## ESLint Rules

To prevent future file bloat:

```javascript
// eslint.config.mjs
rules: {
  'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }]
}
```

## Test Coverage

All new modules have corresponding tests:

```
src/tests/
├── di-integration.test.ts        # DI container tests
├── di-user-identification.test.ts # DI service tests
└── (51 test files, 1274 tests passing)
```

## Migration Status

| Component | Status | Notes |
|-----------|--------|-------|
| services/index.ts | ✅ Complete | Split into 4 focused modules |
| tools/index.ts | ✅ Complete | Factory, lifecycle, categories |
| Result types | ✅ Complete | Full implementation with utils |
| DI container | ✅ Complete | With tokens and bootstrap |
| maya-habit-coach.ts | ✅ Complete | Types, domains, challenges, bundles |
| voice-agent.ts | ✅ Partial | Handoff handler extracted |
| ssml-tagger.ts | ⏸️ On hold | Working as-is, incremental migration |
| handoff.ts | ⏸️ On hold | Working as-is, incremental migration |

## Best Practices

1. **Single Responsibility**: Each file should do ONE thing well
2. **Explicit Dependencies**: Use DI instead of global imports
3. **Result Types**: Prefer `Result<T,E>` over throwing
4. **Barrel Files**: Use `index.ts` for clean exports
5. **JSDoc**: Document public APIs with examples
6. **Max 500 Lines**: Split files when they exceed this

