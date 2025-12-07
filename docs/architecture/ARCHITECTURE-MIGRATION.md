# Architecture Migration Guide

This guide documents the architectural refactoring completed and provides guidance for migrating existing code to the new patterns.

## Overview of Changes

### 1. Services Module Refactoring

The monolithic `services/index.ts` (1,346 lines) has been split into focused modules:

| Old | New |
|-----|-----|
| `services/index.ts` (all-in-one) | `services/types.ts` - Type definitions |
| | `services/global-services.ts` - Global service init |
| | `services/session-manager.ts` - Session lifecycle |
| | `services/shutdown.ts` - Graceful shutdown |
| | `services/index.ts` - Clean barrel file |

**Backward Compatibility**: All existing imports work unchanged.

### 2. Tools Module Refactoring

The `tools/index.ts` (1,525 lines) has been reorganized:

| New File | Purpose |
|----------|---------|
| `tools/factory.ts` | Tool creation functions |
| `tools/lifecycle.ts` | Init/shutdown handlers |
| `tools/categories.ts` | Documentation helpers |
| `tools/consolidated/` | Combined tools for LLM optimization |

### 3. New Patterns Added

#### Result Types (`types/result.ts`)

```typescript
import { Result, success, failure, isSuccess } from '../types/index.js';

// Before (throwing)
function getUser(id: string): User {
  const user = db.find(id);
  if (!user) throw new Error('Not found');
  return user;
}

// After (Result type)
function getUser(id: string): Result<User, NotFoundError> {
  const user = db.find(id);
  if (!user) return failure(new NotFoundError('User', id));
  return success(user);
}
```

#### Dependency Injection (`services/di/`)

```typescript
import { getContainer, Tokens } from '../services/di/index.js';

// Register dependencies
getContainer().registerSingleton(Tokens.MemoryStore, () => new FirestoreStore());

// Resolve dependencies
const store = getContainer().resolve<MemoryStore>(Tokens.MemoryStore);
```

#### Profile Aggregates (`types/profile/`)

```typescript
import { ProfileAggregates } from '../types/index.js';

// Create focused aggregates
const identity = ProfileAggregates.createUserIdentity('user-123', 'John');
const financial = ProfileAggregates.createFinancialProfile();
const relationship = ProfileAggregates.createRelationshipContext();
```

---

## Migration Patterns

### Pattern 1: Migrating from God Objects

**Problem**: Large files with multiple responsibilities.

**Solution**: Split into focused modules with single responsibility.

```typescript
// Before: One large file
// services/mega-service.ts (1000+ lines)
export function initializeEverything() { ... }
export function doThingA() { ... }
export function doThingB() { ... }
export function doThingC() { ... }

// After: Focused modules
// services/initialization.ts
export function initialize() { ... }

// services/thing-a.ts  
export function doThingA() { ... }

// services/thing-b.ts
export function doThingB() { ... }

// services/index.ts (barrel file)
export * from './initialization.js';
export * from './thing-a.js';
export * from './thing-b.js';
```

### Pattern 2: Using Result Types

**When to use**: Any function that can fail in expected ways.

```typescript
import { 
  Result, success, failure, isSuccess, 
  NotFoundError, ValidationError 
} from '../types/index.js';

// Async function with Result
async function fetchUserData(userId: string): Promise<Result<UserData, Error>> {
  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      return failure(new NotFoundError('User', userId));
    }
    const data = await response.json();
    return success(data);
  } catch (error) {
    return failure(error as Error);
  }
}

// Using the result
const result = await fetchUserData('123');
if (isSuccess(result)) {
  console.log(result.data.name);
} else {
  console.error(result.error.message);
}
```

### Pattern 3: Using Dependency Injection

**When to use**: Services that need external dependencies (databases, APIs, etc.)

```typescript
// service.ts
import { Container, Tokens, type Factory } from '../services/di/index.js';

export interface MyServiceDeps {
  store: MemoryStore;
  logger: Logger;
}

export class MyService {
  constructor(private deps: MyServiceDeps) {}
  
  async doWork() {
    this.deps.logger.info('Working...');
    await this.deps.store.save(data);
  }
}

// Factory for DI container
export const createMyService: Factory<MyService> = (container) => {
  return new MyService({
    store: container.resolve(Tokens.MemoryStore),
    logger: container.resolve(Tokens.Logger),
  });
};

// Registration
getContainer().registerSingleton('MyService', createMyService);

// Usage
const service = getContainer().resolve<MyService>('MyService');
```

### Pattern 4: Using Profile Aggregates

**When to use**: New code that works with user data.

```typescript
import { ProfileAggregates, CompositeUserProfile } from '../types/index.js';

// Create a composite profile
const profile: CompositeUserProfile = {
  identity: ProfileAggregates.createUserIdentity('user-123', 'John'),
  communication: ProfileAggregates.createCommunicationProfile(),
  relationship: ProfileAggregates.createRelationshipContext(),
  financial: ProfileAggregates.createFinancialProfile(),
  memory: ProfileAggregates.createConversationMemory(),
};

// Work with specific aggregates
function updateFinancialGoals(financial: ProfileAggregates.FinancialProfile) {
  // Type-safe, focused on financial domain
}

// Access via namespace
const stage: ProfileAggregates.RelationshipStage = 
  ProfileAggregates.calculateRelationshipStage(10, 120, []);
```

---

## Code Quality Rules (ESLint)

New rules to prevent future architectural drift:

```javascript
// eslint.config.mjs
{
  'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
}
```

When you hit these warnings:
1. Split the file into focused modules
2. Extract functions to separate files
3. Consider if the code is doing too much

---

## Testing with DI

The DI container enables easy mocking:

```typescript
import { getContainer, resetContainer } from '../services/di/index.js';

describe('MyService', () => {
  beforeEach(() => {
    resetContainer(); // Clean state for each test
  });

  it('should work with mock store', () => {
    const mockStore = { save: vi.fn() };
    
    getContainer().registerInstance(Tokens.MemoryStore, mockStore);
    
    const service = getContainer().resolve<MyService>('MyService');
    service.doWork();
    
    expect(mockStore.save).toHaveBeenCalled();
  });
});
```

---

## Migration Checklist

### For New Code
- [ ] Use Result types for functions that can fail
- [ ] Use DI for external dependencies
- [ ] Keep files under 500 lines
- [ ] Keep functions under 100 lines
- [ ] Use Profile Aggregates for user data

### For Existing Code (Gradual Migration)
- [ ] When touching a file, consider if it should be split
- [ ] When adding error handling, use Result types
- [ ] When adding tests, introduce DI for testability
- [ ] When working with UserProfile, consider using aggregates

---

## File Reference

### New Files Created

```
src/
├── services/
│   ├── types.ts              # SessionServices, GlobalServices
│   ├── global-services.ts    # initializeServices, getGlobalServices
│   ├── session-manager.ts    # createSessionServices, session lifecycle
│   ├── shutdown.ts           # shutdownServices
│   └── di/
│       ├── container.ts      # DI container implementation
│       └── index.ts          # DI exports
├── tools/
│   ├── factory.ts            # createAllTools, createPersonaTools, etc.
│   ├── lifecycle.ts          # initializeTeamHandlers, shutdownTools
│   ├── categories.ts         # getToolCategories, getToolDocumentation
│   └── consolidated/
│       └── index.ts          # Combined tools
└── types/
    ├── result.ts             # Result<T,E>, success/failure, error types
    └── profile/
        ├── identity.ts       # UserIdentity aggregate
        ├── communication.ts  # CommunicationProfile aggregate
        ├── relationship.ts   # RelationshipContext aggregate
        ├── financial.ts      # FinancialProfile aggregate
        ├── conversation-memory.ts  # ConversationMemory aggregate
        └── index.ts          # Aggregate exports
```

---

## Questions?

Refer to the individual module documentation or examine the implementation in the source files.

