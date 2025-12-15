# Publisher Auth Migration - Quick Reference

## Before (Header-Based Auth)

```typescript
// marketplace-routes.ts - OLD
function getPublisher(req: IncomingMessage): PublisherSession | null {
  const publisherId = req.headers['x-publisher-id'] as string;
  if (!publisherId) return null;

  return {
    publisherId,
    publisherName: (req.headers['x-publisher-name'] as string) || 'Unknown Publisher',
    verified: true,
  };
}

// Usage in routes
async function handlePublisherRoutes(...) {
  if (pathname === '/api/marketplace/publisher/submit' && method === 'POST') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    // Continue with authenticated request...
  }
}
```

## After (API Key Auth)

```typescript
// marketplace-routes.ts - NEW
import { requirePublisherAuth } from './publisher-auth.js';

// Remove old getPublisher() function - middleware handles it

// Usage in routes
async function handlePublisherRoutes(...) {
  if (pathname === '/api/marketplace/publisher/submit' && method === 'POST') {
    // Authenticate using API key
    const session = await requirePublisherAuth(req, res);
    if (!session) return true; // Response already sent by middleware

    // Continue with authenticated request...
    // session.publisherId, session.publisherName, session.verified available
  }
}
```

## Changes Summary

| Old | New |
|-----|-----|
| `getPublisher(req)` | `await requirePublisherAuth(req, res)` |
| `x-publisher-id` header | `Authorization: Bearer pk_xxx` header |
| `x-publisher-name` header | Loaded from Firestore |
| Always `verified: true` | Real verification status |
| No key management | Full API key lifecycle |

## Line-by-Line Diff

```diff
  import type { IncomingMessage, ServerResponse } from 'http';
+ import { requirePublisherAuth } from './publisher-auth.js';

  // ... other imports ...

- function getPublisher(req: IncomingMessage): PublisherSession | null {
-   const publisherId = req.headers['x-publisher-id'] as string;
-   if (!publisherId) return null;
-
-   return {
-     publisherId,
-     publisherName: (req.headers['x-publisher-name'] as string) || 'Unknown Publisher',
-     verified: true,
-   };
- }

  async function handlePublisherRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    method: string
  ): Promise<boolean> {
    // POST /api/marketplace/publisher/submit
    if (pathname === '/api/marketplace/publisher/submit' && method === 'POST') {
-     const publisher = getPublisher(req);
-     if (!publisher) {
-       sendJson(res, 401, { error: 'Publisher authentication required' });
-       return true;
-     }
+     const session = await requirePublisherAuth(req, res);
+     if (!session) return true;

      try {
        const body = await parseBody<{
          type: 'tool' | 'agent';
          manifest: ToolManifest | AgentManifest;
        }>(req);

-       if (body.manifest.publisher.id !== publisher.publisherId) {
+       if (body.manifest.publisher.id !== session.publisherId) {
          sendJson(res, 403, { error: 'Publisher ID mismatch' });
          return true;
        }

-       const trustLevel: TrustLevel = publisher.verified ? 'community' : 'unverified';
+       const trustLevel: TrustLevel = session.verified ? 'community' : 'unverified';

        // ... rest of handler ...
      }
    }
  }
```

## Testing the Migration

1. **Register a test publisher:**
   ```bash
   curl -X POST http://localhost:3002/api/marketplace/admin/publishers \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "name": "Test Publisher"}'
   ```

2. **Save the API key from response:**
   ```json
   {
     "publisher": { "id": "pub_abc123", ... },
     "apiKey": "pk_test_xyz789..."  // <- Save this!
   }
   ```

3. **Test submission with new auth:**
   ```bash
   curl -X POST http://localhost:3002/api/marketplace/publisher/submit \
     -H "Authorization: Bearer pk_test_xyz789..." \
     -H "Content-Type: application/json" \
     -d '{
       "type": "tool",
       "manifest": {
         "id": "my-tool",
         "name": "My Tool",
         "publisher": { "id": "pub_abc123" },
         ...
       }
     }'
   ```

4. **Verify it works!**

## Rollback Plan

If issues arise, you can temporarily support both auth methods:

```typescript
async function getPublisherWithFallback(
  req: IncomingMessage,
  res: ServerResponse
): Promise<PublisherSession | null> {
  // Try new API key auth first
  const apiKeySession = await requirePublisherAuth(req, res);
  if (apiKeySession) return apiKeySession;

  // Fall back to old header auth (temporary)
  const publisherId = req.headers['x-publisher-id'] as string;
  if (publisherId) {
    log.warn({ publisherId }, 'Using deprecated header auth');
    return {
      publisherId,
      publisherName: (req.headers['x-publisher-name'] as string) || 'Unknown',
      verified: true,
      keyType: 'test', // Assume test for backwards compat
    };
  }

  return null;
}
```

## Timeline

- **Week 1**: Deploy new auth system, add admin routes
- **Week 2**: Register initial publishers, test thoroughly
- **Week 3**: Update documentation, notify existing users
- **Week 4**: Monitor adoption, provide migration support
- **Week 5+**: Remove header auth fallback

## Need Help?

See full documentation in `PUBLISHER-AUTH-INTEGRATION.md`
