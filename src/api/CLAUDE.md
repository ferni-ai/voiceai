# API Layer

> **We believe in making AI human, and the decisions we make will reflect that.**

The API layer handles all HTTP routes for the Ferni platform. This includes user-facing APIs, admin endpoints, webhooks, and internal service routes.

---

## Architecture Level

API is at **Level 100** (Application layer):

```
Level 100: agents/, api/    ← THIS LAYER
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/
Level 30:  memory/
Level 10:  config/, utils/, types/
```

**Import rules:** API can import from any lower level.

---

## Directory Structure

```
api/
├── index.ts                    # Centralized exports
├── auth-middleware.ts          # Authentication & rate limiting
├── helpers.ts                  # Response helpers, CORS, parsing
├── error-messages.ts           # Standardized error messages
├── *-routes.ts                 # Route handlers (54 files)
├── *-handler.ts                # Complex handlers (8 files)
├── v1/                         # Versioned API routes
│   ├── admin/                  # Admin-only endpoints
│   ├── integrations/           # Third-party integrations
│   └── public/                 # Public endpoints
├── voice-auth/                 # Voice authentication
├── marketplace/                # Marketplace API
├── monetization/               # Subscription/billing
├── routes/                     # Additional route modules
└── __tests__/                  # API tests
```

---

## Route Patterns

### Standard Route Handler

```typescript
import type { IncomingMessage, ServerResponse } from 'http';
import { requireAuth, rateLimit } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from './helpers.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'MyRoutes' });

export async function handleMyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/my-feature')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Authentication
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  try {
    // GET /api/my-feature
    if (pathname === '/api/my-feature' && req.method === 'GET') {
      const data = await getMyFeatureData(auth.userId);
      sendJSON(res, data);
      return true;
    }

    // POST /api/my-feature
    if (pathname === '/api/my-feature' && req.method === 'POST') {
      const body = await parseBody<MyInput>(req);
      const result = await createMyFeature(auth.userId, body);
      sendJSON(res, result, 201);
      return true;
    }

    // Unknown route
    sendError(res, 'Not found', 404);
    return true;
  } catch (err) {
    log.error({ error: err, userId: auth.userId }, 'Route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}
```

### Route Registration

Routes are registered in the main server files:

```typescript
// src/servers/api/index.ts or ui-server.js
import { handleMyRoutes } from './api/my-routes.js';

// In request handler:
if (await handleMyRoutes(req, res, pathname)) return;
```

---

## Authentication

### Auth Middleware Functions

| Function | Use Case |
|----------|----------|
| `requireAuth(req, res)` | Require valid auth, send 401 if not |
| `requireAdmin(req, res)` | Require admin role |
| `optionalAuth(req)` | Get auth if present, null otherwise |
| `authenticate(req)` | Parse auth without response handling |

### Auth Context

```typescript
interface AuthContext {
  userId: string;
  email?: string;
  isAdmin: boolean;
  subscriptionTier: 'free' | 'pro' | 'team';
  source: 'firebase' | 'api-key' | 'dev-mode';
}
```

### Rate Limiting

```typescript
// Standard rate limit
rateLimit(req, res, { maxRequests: 100, windowMs: 60000 });

// Expensive operations (AI, embeddings)
rateLimitExpensive(req, res, { maxRequests: 10, windowMs: 60000 });

// Rate limit tiers
const tiers = {
  free: { maxRequests: 100, windowMs: 60000 },
  pro: { maxRequests: 500, windowMs: 60000 },
  admin: { maxRequests: 1000, windowMs: 60000 },
};
```

---

## Response Helpers

```typescript
import { sendJSON, sendError, sendJSONCached } from './helpers.js';

// Success response
sendJSON(res, { data: result });
sendJSON(res, { created: true }, 201);

// Cached response (1 hour)
sendJSONCached(res, data, 3600);

// Error response
sendError(res, 'Invalid input', 400);
sendError(res, 'Not found', 404);
sendError(res, 'Server error', 500);
```

---

## Key Route Files

| File | Endpoints | Purpose |
|------|-----------|---------|
| `calendar-routes.ts` | `/api/calendar/*` | Calendar integration |
| `contacts-routes.ts` | `/api/contacts/*` | Contact management |
| `subscription-routes.ts` | `/api/subscription/*` | Billing, plans |
| `observability-routes.ts` | `/api/observability/*` | Metrics, health |
| `custom-agent-routes.ts` | `/api/custom-agents/*` | Agent creation |
| `engagement-routes.ts` | `/api/engagement/*` | User engagement |
| `gdpr-routes.ts` | `/api/gdpr/*` | Data export/deletion |
| `trust-systems-routes.ts` | `/api/trust/*` | Trust building |

---

## Testing

```bash
# Run API tests
pnpm vitest run src/api/__tests__/

# Test specific route
pnpm vitest run src/api/__tests__/calendar-routes.test.ts
```

---

## Rules

### Do
- Use `requireAuth()` for authenticated endpoints
- Use `rateLimit()` for all public endpoints
- Handle CORS preflight with `handleCorsPreflightIfNeeded()`
- Log errors with context (userId, endpoint)
- Return early with `return true` after handling

### Don't
- Import from agents/ (same level - avoid circular deps)
- Skip rate limiting on public endpoints
- Return raw error messages to clients
- Use `console.log` (use `createLogger`)
- Forget to handle OPTIONS requests (CORS)

---

## Adding New Routes

1. Create `src/api/my-feature-routes.ts` using the pattern above
2. Export handler from `src/api/index.ts`
3. Register in server file
4. Add rate limiting appropriate to the endpoint
5. Write tests in `src/api/__tests__/`

---

*Last updated: December 2024*
