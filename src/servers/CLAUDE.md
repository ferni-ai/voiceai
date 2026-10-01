# Servers Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The servers module contains the backend server infrastructure - token generation, OAuth flows, API routes, and shared middleware.

---

## Architecture Level

```
Level 100: servers/            ← THIS LAYER (Application)
          ↓ imports from
Level 70:  tools/, personas/
Level 60:  services/
Level 30:  memory/
Level 10:  config/, utils/, types/
```

**Import rules:** Servers is at the top level and can import from any lower layer.

---

## Directory Structure

```
servers/
├── index.ts                    # Main exports
├── gateway.ts                  # API gateway
│
├── token/                      # 🔐 Token utilities (library, no HTTP server)
│   ├── index.ts                # Re-exports: livekit, validation, demo-rate-limit
│   ├── livekit.ts              # LiveKit token generation
│   ├── demo-rate-limit.ts      # Demo rate limiting
│   ├── validation.ts           # OAuth state validation helpers
│   └── oauth/                  # OAuth flows (Spotify, Wearables, Google)
│       └── (spotify, wearables, google-calendar)
│
├── api/                        # 🌐 UI Server API (port 3002)
│   ├── index.ts                # Thin entry: create server, wire lifecycle, exports
│   ├── server-lifecycle.ts     # WebSockets, background services, graceful shutdown
│   ├── dispatch/               # Route matching (ordered pathname guards)
│   │   ├── request-handler.ts  # Request pipeline + route groups in order + static fallback
│   │   ├── route-context.ts    # RouteContext, RouteGroup, error-boundary helper
│   │   └── *-routes.ts         # Route groups (integration, feature, platform, core-*, billing)
│   ├── __tests__/route-table.test.ts  # Snapshot of the full dispatch table (order matters!)
│   ├── static.ts               # Static file serving
│   ├── routes/                 # API routes
│   │   └── (smart-home, twin-profile, etc.)
│   └── services/               # API services
│
├── __tests__/                  # Server tests
│
└── shared/                     # 🔧 Shared utilities
    ├── index.ts                # Shared exports
    ├── cors.ts                 # CORS handling
    ├── encryption.ts           # Encryption utilities
    ├── security-headers.ts     # Security header middleware
    └── types.ts                # Shared types
```

---

## Server Architecture

Ferni runs **2 development servers** (plus the Voice Agent):

| Server | Port | Purpose |
|--------|------|---------|
| **UI Server** | 3002 | LiveKit tokens, Spotify/Wearables OAuth, APIs, engagement routes |
| **Vite Dev** | 3004 | Frontend with HMR |

**Vite proxies:**
- `/api/*`, `/token`, `/spotify/*`, `/wearables/*`, `/subscription/*` → UI Server (3002)

---

## Token Server

Handles authentication and tokens:

```typescript
// LiveKit token generation
GET /token?room=<roomId>&identity=<userId>

// Spotify OAuth
GET /spotify/login
GET /spotify/callback
GET /spotify/refresh

// Subscriptions
GET /subscription/status
POST /subscription/create
```

### LiveKit Tokens

```typescript
// src/servers/token/livekit.ts
import { generateLiveKitToken } from './livekit.js';

const token = await generateLiveKitToken({
  room: roomId,
  identity: userId,
  name: userName,
  permissions: {
    canPublish: true,
    canSubscribe: true,
  },
});
```

---

## UI Server API

Business logic and engagement:

```typescript
// Route registration
GET /api/health
GET /api/agents
POST /api/engagement/track
GET /api/observability
```

### Route Handler Pattern

```typescript
// src/servers/api/dispatch/*-routes.ts - Routes are matched with if-statements
// inside route groups; a group returns true when the request is finished.
if (pathname.startsWith('/api/my-feature')) {
  const handled = await handleMyFeatureRoutes(req, res, pathname, parsedUrl);
  if (handled) return true;
}
// After adding a route: add a vi.mock + probe path in
// src/servers/api/__tests__/route-table.test.ts and re-run it with -u.

// Route handlers follow this signature:
export async function handleMyFeatureRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Return true if handled, false to continue matching
}
```

---

## OAuth Flows

Spotify and Google Calendar OAuth:

```typescript
// src/servers/token/oauth/spotify.ts

// 1. Initiate login
GET /spotify/login
// Redirects to Spotify with PKCE

// 2. Handle callback
GET /spotify/callback?code=<code>&state=<state>
// Exchanges code for tokens

// 3. Refresh tokens
GET /spotify/refresh?refresh_token=<token>
```

---

## Demo Rate Limiting

Prevent abuse of demo mode:

```typescript
// src/servers/token/demo-rate-limit.ts
import { checkDemoLimit } from './demo-rate-limit.js';

const allowed = await checkDemoLimit({
  ip: req.ip,
  fingerprint: req.body.fingerprint,
});

if (!allowed) {
  return res.status(429).json({ error: 'Demo limit reached' });
}
```

---

## Development Setup

```bash
# Terminal 1: UI Server (port 3002 — handles tokens, OAuth, APIs)
pnpm ui-server

# Terminal 2: Frontend
cd apps/web && pnpm dev
```

---

## Testing

```bash
# Run server tests
pnpm vitest run src/servers/__tests__/

# Test token generation
curl http://localhost:3002/token?room=test&identity=user1
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Follow route handler pattern | Add routes without handlers |
| Validate all inputs | Trust client data |
| Use PKCE for OAuth | Store secrets in frontend |
| Rate limit demos | Allow unlimited demo usage |
| Return proper error codes | Return generic 500s |
| Register handlers in a `api/dispatch/` route group | Create orphaned route files |

---

## LiveKit Configuration

**Development vs Production:**

| Env | Project | URL | Agent Name |
|-----|---------|-----|------------|
| Dev | `ferni-dev` | `wss://dev-8sm1ba0z.livekit.cloud` | `voice-agent-dev` |
| Prod | Main | `wss://test-rvg91u1z.livekit.cloud` | `voice-agent` |

Configured via `.env`:
```bash
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
```

---

## Health Endpoints

```typescript
GET /health         # Liveness check
GET /health/ready   # Readiness check (workers ready)
```

---

## Related Docs

- `CLAUDE.md` (root) - Full deployment guide
- `docs/deployment/` - Deployment documentation
- `src/api/CLAUDE.md` - API route patterns

---

*Last updated: January 2026*
