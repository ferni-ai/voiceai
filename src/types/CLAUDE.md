# Types

> **We believe in making AI human, and the decisions we make will reflect that.**

The types module contains shared TypeScript type definitions used across the codebase. This is the lowest level of the architecture - all other layers can import from types.

---

## Architecture Level

Types is at **Level 10** (Infrastructure layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/
Level 30:  memory/
Level 10:  config/, utils/, types/    ← THIS LAYER
```

**Import rules:** Types should not import from any other layer (except other type files).

---

## Key Type Files

| File | Purpose |
|------|---------|
| `index.ts` | Main exports |
| `result.ts` | Result/Either type for error handling |
| `result-utils.ts` | Result type utilities |
| `api.ts` | API request/response types |
| `events.ts` | Event payload types |
| `schemas.ts` | Zod validation schemas |
| `branded.ts` | Branded/nominal types |
| `behavior-types.ts` | Behavior/personality types |
| `humanizing-types.ts` | Humanization types |
| `human-memory.ts` | Memory system types |
| `monetization.ts` | Subscription/billing types |
| `subscription.ts` | Subscription tier types |
| `relationship-stages.ts` | Relationship progression |
| `personal-journey.ts` | User journey types |
| `personal-themes.ts` | Theme/topic types |
| `custom-agent.ts` | Custom agent types |
| `custom-agent-api.ts` | Custom agent API types |
| `seed-fund.types.ts` | Seed fund types |
| `optimization-types.ts` | A/B testing types |

---

## Core Patterns

### Result Type (Error Handling)

```typescript
import { Result, ok, err, isOk, isErr } from './types/result.js';

// Define result type
type ParseResult = Result<Config, ParseError>;

// Return success
function parse(input: string): ParseResult {
  if (!input) return err(new ParseError('Empty input'));
  return ok(JSON.parse(input));
}

// Handle result
const result = parse(data);
if (isOk(result)) {
  console.log(result.value);
} else {
  console.error(result.error);
}
```

### Branded Types

```typescript
import { Brand } from './types/branded.js';

// Create branded type
type UserId = Brand<string, 'UserId'>;
type SessionId = Brand<string, 'SessionId'>;

// Type-safe - these are not interchangeable
function getUser(id: UserId): User { ... }
function getSession(id: SessionId): Session { ... }

// Create branded values
const userId = 'user123' as UserId;
const sessionId = 'sess456' as SessionId;

getUser(userId);      // ✅ OK
getUser(sessionId);   // ❌ Type error
```

### Event Types

```typescript
import {
  AgentEvent,
  HumanizationEvent,
  TransferEvent
} from './types/events.js';

// Type-safe event handling
function handleEvent(event: AgentEvent): void {
  switch (event.type) {
    case 'agent_joined':
      onAgentJoined(event.payload);
      break;
    case 'agent_left':
      onAgentLeft(event.payload);
      break;
  }
}
```

### API Types

```typescript
import {
  ApiRequest,
  ApiResponse,
  PaginatedResponse
} from './types/api.js';

interface GetUsersRequest extends ApiRequest {
  query: {
    limit?: number;
    offset?: number;
  };
}

interface GetUsersResponse extends PaginatedResponse<User> {
  users: User[];
}
```

---

## Type Organization

### Module-Specific Types

For types used only within a single module, define them in that module:

```typescript
// In src/services/calendar/types.ts
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
}
```

### Shared Types

For types used across multiple modules, add to `src/types/`:

```typescript
// In src/types/user-profile.ts
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}
```

---

## Schema Validation

Use Zod for runtime validation:

```typescript
import { z } from 'zod';

// Define schema
export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1),
  createdAt: z.date(),
});

// Infer type from schema
export type UserProfile = z.infer<typeof UserProfileSchema>;

// Validate
const result = UserProfileSchema.safeParse(data);
if (result.success) {
  const profile: UserProfile = result.data;
}
```

---

## Naming Conventions

| Pattern | Example | Use For |
|---------|---------|---------|
| `*Request` | `CreateUserRequest` | API request payloads |
| `*Response` | `CreateUserResponse` | API response payloads |
| `*Event` | `AgentTransferEvent` | Event payloads |
| `*Config` | `VoiceConfig` | Configuration objects |
| `*Options` | `RetryOptions` | Optional parameters |
| `*State` | `SessionState` | Stateful data |
| `*Result` | `ParseResult` | Result types |

---

## Rules

### Do
- Use `readonly` for immutable properties
- Use `Pick<>`, `Omit<>`, `Partial<>` for type transformations
- Export types from `index.ts`
- Use branded types for IDs
- Define schemas with Zod for runtime validation

### Don't
- Use `any` (use `unknown` instead)
- Import from higher architecture levels
- Create circular dependencies between type files
- Mix types with implementation code
- Use `I` prefix (e.g., `IUser`) - just use `User`

---

## Adding New Types

1. Determine if type is module-specific or shared
2. Create/update appropriate file
3. Export from `index.ts` if shared
4. Add Zod schema if runtime validation needed
5. Document complex types with JSDoc

---

*Last updated: December 2024*
