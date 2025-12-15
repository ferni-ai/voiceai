# Publisher Authentication Integration Guide

This guide shows how to replace the header-based authentication in `marketplace-routes.ts` with real API key authentication.

## Overview

The publisher authentication system provides:
- **Publisher Registration**: Create publisher accounts with unique IDs
- **API Key Management**: Generate, rotate, and revoke API keys
- **Secure Storage**: Keys are hashed (SHA-256) before storage
- **Middleware**: Easy integration with existing route handlers
- **Key Types**: Test keys (all publishers) and live keys (verified publishers only)

## Quick Start

### 1. Register a Publisher

```bash
# Use the Ferni CLI or create an admin route
curl -X POST http://localhost:3002/api/marketplace/admin/publishers \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "name": "John Doe"
  }'

# Response:
{
  "publisher": {
    "id": "pub_abc123",
    "email": "john@example.com",
    "name": "John Doe",
    "verified": false
  },
  "apiKey": "pk_test_xyz789..."
}
```

### 2. Use API Key in Requests

Publishers can now authenticate using their API key:

```bash
# Option 1: Authorization header (preferred)
curl -X POST http://localhost:3002/api/marketplace/publisher/submit \
  -H "Authorization: Bearer pk_test_xyz789..." \
  -H "Content-Type: application/json" \
  -d '{ "type": "tool", "manifest": {...} }'

# Option 2: x-api-key header
curl -X POST http://localhost:3002/api/marketplace/publisher/submit \
  -H "x-api-key: pk_test_xyz789..." \
  -H "Content-Type: application/json" \
  -d '{ "type": "tool", "manifest": {...} }'
```

## Integration Steps

### Step 1: Update `marketplace-routes.ts`

Replace the current `getPublisher()` helper:

```typescript
// OLD (header-based auth)
function getPublisher(req: IncomingMessage): PublisherSession | null {
  const publisherId = req.headers['x-publisher-id'] as string;
  if (!publisherId) return null;

  return {
    publisherId,
    publisherName: (req.headers['x-publisher-name'] as string) || 'Unknown Publisher',
    verified: true,
  };
}
```

With the new middleware:

```typescript
// NEW (API key auth)
import { requirePublisherAuth } from './publisher-auth.js';

async function handlePublisherRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // POST /api/marketplace/publisher/submit
  if (pathname === '/api/marketplace/publisher/submit' && method === 'POST') {
    // Authenticate publisher using API key
    const session = await requirePublisherAuth(req, res);
    if (!session) return true; // Response already sent by middleware

    try {
      const body = await parseBody<{
        type: 'tool' | 'agent';
        manifest: ToolManifest | AgentManifest;
      }>(req);

      // Verify publisher owns the manifest
      if (body.manifest.publisher.id !== session.publisherId) {
        sendJson(res, 403, { error: 'Publisher ID mismatch' });
        return true;
      }

      // Continue with submission logic...
      // ...
    } catch (error) {
      // ...
    }
  }
}
```

### Step 2: Add Admin Routes for Publisher Management

Create `/api/marketplace/admin/publishers` routes for managing publishers:

```typescript
// In marketplace-routes.ts or a new admin-routes.ts file

import {
  registerPublisher,
  createApiKey,
  listApiKeys,
  rotateApiKey,
  deleteApiKey,
} from './publisher-auth.js';

async function handleAdminRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // POST /api/marketplace/admin/publishers - Register new publisher
  if (pathname === '/api/marketplace/admin/publishers' && method === 'POST') {
    // TODO: Add admin authentication check
    const body = await parseBody<{ email: string; name: string }>(req);
    const { publisher, apiKey } = await registerPublisher(body.email, body.name);
    sendJson(res, 200, { publisher, apiKey });
    return true;
  }

  // POST /api/marketplace/admin/publishers/:id/verify - Verify publisher
  if (pathname.match(/^\/api\/marketplace\/admin\/publishers\/[^/]+\/verify$/) && method === 'POST') {
    // TODO: Update publisher.verified = true in Firestore
    sendJson(res, 200, { success: true });
    return true;
  }

  return false;
}
```

### Step 3: Add Publisher Self-Service Routes

Allow publishers to manage their own API keys:

```typescript
// GET /api/marketplace/publisher/keys - List my API keys
if (pathname === '/api/marketplace/publisher/keys' && method === 'GET') {
  const session = await requirePublisherAuth(req, res);
  if (!session) return true;

  const keys = await listApiKeys(session.publisherId);
  sendJson(res, 200, { keys });
  return true;
}

// POST /api/marketplace/publisher/keys - Create new API key
if (pathname === '/api/marketplace/publisher/keys' && method === 'POST') {
  const session = await requirePublisherAuth(req, res);
  if (!session) return true;

  const body = await parseBody<{ type: 'live' | 'test' }>(req);
  const { apiKey, keyId } = await createApiKey(session.publisherId, body.type);
  sendJson(res, 200, { apiKey, keyId });
  return true;
}

// POST /api/marketplace/publisher/keys/:id/rotate - Rotate API key
if (pathname.match(/^\/api\/marketplace\/publisher\/keys\/[^/]+\/rotate$/) && method === 'POST') {
  const session = await requirePublisherAuth(req, res);
  if (!session) return true;

  const keyId = pathname.split('/')[5];
  const { apiKey, keyId: newKeyId } = await rotateApiKey(session.publisherId, keyId);
  sendJson(res, 200, { apiKey, keyId: newKeyId });
  return true;
}

// DELETE /api/marketplace/publisher/keys/:id - Delete API key
if (pathname.match(/^\/api\/marketplace\/publisher\/keys\/[^/]+$/) && method === 'DELETE') {
  const session = await requirePublisherAuth(req, res);
  if (!session) return true;

  const keyId = pathname.split('/')[5];
  await deleteApiKey(session.publisherId, keyId);
  sendJson(res, 200, { success: true });
  return true;
}
```

## Firestore Collections

The authentication system uses two Firestore collections:

### `publishers` Collection

```typescript
{
  id: "pub_abc123",           // Document ID
  email: "john@example.com",
  name: "John Doe",
  verified: false,            // true = can create live keys
  createdAt: Timestamp
}
```

### `api_keys` Collection

```typescript
{
  id: "key_xyz789",                        // Document ID
  publisherId: "pub_abc123",
  keyHash: "sha256(...)",                  // Hashed API key
  keyPrefix: "pk_test_abc12345",           // First 8 chars for display
  type: "test" | "live",
  createdAt: Timestamp,
  lastUsedAt: Timestamp | undefined        // Updated on each use
}
```

## Security Best Practices

### 1. Key Storage
- ✅ Keys are hashed (SHA-256) before storage
- ✅ Only key prefix stored for display
- ✅ Full key shown only once at creation
- ❌ Never log full API keys

### 2. Key Types
- **Test keys (`pk_test_*`)**: Available to all publishers, for development
- **Live keys (`pk_live_*`)**: Only for verified publishers, for production

### 3. Key Rotation
- Encourage publishers to rotate keys periodically
- Provide `lastUsedAt` timestamp to detect unused keys
- Support graceful rotation (create new, update app, delete old)

### 4. Rate Limiting
Consider adding rate limiting to prevent abuse:

```typescript
import { RateLimiter } from '../services/rate-limiter.js';

const publisherLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 1 minute
});

async function handlePublisherRoutes(...) {
  const session = await requirePublisherAuth(req, res);
  if (!session) return true;

  // Check rate limit
  if (!publisherLimiter.checkLimit(session.publisherId)) {
    sendJson(res, 429, { error: 'Rate limit exceeded' });
    return true;
  }

  // Continue...
}
```

## Migration Plan

### Phase 1: Add New Routes (No Breaking Changes)
1. Deploy publisher-auth.ts
2. Add admin routes for publisher registration
3. Add self-service key management routes
4. Test with a few publishers

### Phase 2: Support Both Auth Methods
1. Update `getPublisher()` to try API key auth first, fall back to headers
2. Log when header auth is used (for monitoring)
3. Notify existing publishers to migrate

### Phase 3: Remove Header Auth
1. Deprecation notice: "Header auth will be removed in 30 days"
2. Monitor logs for header auth usage
3. Remove header auth code once migration complete

## Testing

See `src/api/__tests__/publisher-auth.example.ts` for complete examples:

```bash
# Run example code
node -r esbuild-register src/api/__tests__/publisher-auth.example.ts
```

## Troubleshooting

### "Publisher must be verified to create live API keys"
- Only verified publishers can create live keys
- Use admin route to verify: `POST /api/marketplace/admin/publishers/:id/verify`

### "Invalid API key"
- Check key format: `pk_test_*` or `pk_live_*`
- Ensure key hasn't been deleted/rotated
- Verify key is sent in correct header format

### "API key references non-existent publisher"
- Data inconsistency - publisher was deleted but key remains
- Fix: Clean up orphaned keys with admin script

## API Reference

### Publisher Management

```typescript
registerPublisher(email: string, name: string): Promise<{
  publisher: Publisher;
  apiKey: string; // Initial test key
}>

getPublisher(publisherId: string): Promise<Publisher | null>
```

### API Key Management

```typescript
createApiKey(publisherId: string, keyType: 'live' | 'test'): Promise<{
  apiKey: string;
  keyId: string;
}>

validateApiKey(apiKey: string): Promise<PublisherSession | null>

rotateApiKey(publisherId: string, keyId: string): Promise<{
  apiKey: string;
  keyId: string;
}>

listApiKeys(publisherId: string): Promise<Array<Omit<ApiKey, 'keyHash'>>>

deleteApiKey(publisherId: string, keyId: string): Promise<void>
```

### Middleware

```typescript
requirePublisherAuth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<PublisherSession | null>

getPublisherSession(req: IncomingMessage): PublisherSession | null
```

## Next Steps

1. **Create Admin UI**: Build a simple admin dashboard for managing publishers
2. **Publisher Portal**: Add UI for publishers to manage their keys
3. **Key Rotation Reminders**: Email publishers when keys are old (90+ days)
4. **Analytics**: Track API key usage per publisher
5. **Webhooks**: Notify publishers of key events (created, rotated, deleted)
