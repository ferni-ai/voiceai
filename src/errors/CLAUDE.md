# Errors Module

Unified error handling for the Ferni codebase.

## Purpose

Provides type-safe, consistent error handling with:
- Base `FerniError` class for all errors
- Domain-specific error types (Task, Tool, Auth, etc.)
- User-friendly messages separate from technical details
- Automatic severity and retryability classification

## Architecture Layer

**Layer 10 (Infrastructure)** - Can be imported by any other module.

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | All error classes and utilities |

## Error Types

| Error Class | Code Prefix | Use For |
|-------------|-------------|---------|
| `FerniError` | (base) | Generic errors |
| `TaskError` | `TASK_*` | Task execution failures |
| `ToolError` | `TOOL_*` | Tool execution failures |
| `ValidationError` | `VALIDATION_ERROR` | Input validation |
| `AuthenticationError` | `AUTH_*` | Auth failures |
| `AuthorizationError` | `AUTHORIZATION_ERROR` | Permission denied |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` | Third-party API failures |
| `RateLimitError` | `RATE_LIMIT_ERROR` | Rate limiting |
| `NotFoundError` | `NOT_FOUND` | Resource not found |
| `ConfigurationError` | `CONFIGURATION_ERROR` | Misconfiguration |
| `TimeoutError` | `TIMEOUT` | Operation timeouts |
| `HandoffError` | `HANDOFF_ERROR` | Agent handoff failures |

## Usage Patterns

```typescript
import { ToolError, wrapError, getUserMessage, isFerniError } from '../errors/index.js';

// Throw domain-specific error
throw new ToolError('API call failed', 'EXECUTION_ERROR', {
  toolId: 'weather.getWeather',
  domain: 'weather',
  cause: originalError,
});

// Wrap unknown errors
const ferniError = wrapError(unknownError, 'UNKNOWN_ERROR');

// Get user-friendly message
const message = getUserMessage(error);  // "Something went wrong..."

// Type guard
if (isFerniError(error)) {
  console.log(error.code, error.userMessage);
}
```

## Error Properties

Every `FerniError` has:
- `code` - Programmatic error code
- `userMessage` - User-friendly message (safe to show in UI)
- `message` - Technical message (for logs)
- `severity` - `low` | `medium` | `high` | `critical`
- `retryable` - Whether operation can be retried
- `context` - Additional debugging data
- `shouldLog` - Whether to log this error

## Rules for Adding New Errors

1. **Always extend `FerniError`** - Never use raw `Error`
2. **Include user message** - Make it warm and human
3. **Set appropriate severity** - Critical = system down, High = feature broken
4. **Mark retryability** - Network errors are retryable, validation errors are not
5. **Include context** - Add relevant debugging data

## Integration

Errors are used throughout:
- `src/tools/` - ToolError for tool failures
- `src/agents/` - HandoffError for agent transitions
- `src/services/` - ExternalServiceError for API calls
- `src/api/` - AuthenticationError/AuthorizationError for auth
