# Publisher Authentication System

A production-ready authentication system for marketplace publishers using secure API keys.

## 📁 Files

| File | Lines | Purpose |
|------|-------|---------|
| `publisher-auth.ts` | 481 | Main authentication module |
| `publisher-auth-crypto.ts` | 46 | Crypto helpers (key generation, hashing) |
| `PUBLISHER-AUTH-INTEGRATION.md` | - | Integration guide |
| `PUBLISHER-AUTH-MIGRATION.md` | - | Migration quick reference |
| `__tests__/publisher-auth.example.ts` | - | Usage examples |

## 🚀 Quick Start

### 1. Register a Publisher

```typescript
import { registerPublisher } from './publisher-auth.js';

const { publisher, apiKey } = await registerPublisher(
  'john@example.com',
  'John Doe'
);

console.log('Publisher ID:', publisher.id);
console.log('API Key:', apiKey); // pk_test_...
// ⚠️ Show API key only once - it's not stored in plaintext!
```

### 2. Authenticate Requests

```typescript
import { requirePublisherAuth } from './publisher-auth.js';

async function handleSubmit(req, res) {
  // Authenticate publisher
  const session = await requirePublisherAuth(req, res);
  if (!session) return; // 401 response already sent

  // Access publisher info
  console.log('Publisher:', session.publisherId);
  console.log('Verified:', session.verified);
  console.log('Key Type:', session.keyType); // 'live' or 'test'

  // Continue with authenticated request...
}
```

### 3. Manage API Keys

```typescript
import { createApiKey, listApiKeys, rotateApiKey } from './publisher-auth.js';

// Create a new key
const { apiKey, keyId } = await createApiKey('pub_abc123', 'test');

// List all keys
const keys = await listApiKeys('pub_abc123');
for (const key of keys) {
  console.log(key.keyPrefix, key.type, key.lastUsedAt);
}

// Rotate a key
const rotated = await rotateApiKey('pub_abc123', 'key_old123');
console.log('New API key:', rotated.apiKey);
```

## 🔐 Security Features

### Key Storage
- ✅ **Hashed**: Keys are SHA-256 hashed before storage
- ✅ **Prefix Only**: Only first 8 chars stored for display (`pk_test_abc12345`)
- ✅ **One-Time Display**: Full key shown only at creation
- ✅ **Secure Transmission**: Must use HTTPS in production

### Key Types

| Type | Format | Availability | Use Case |
|------|--------|--------------|----------|
| Test | `pk_test_*` | All publishers | Development, testing |
| Live | `pk_live_*` | Verified publishers only | Production |

### Authentication Headers

Publishers can use either:

```bash
# Option 1: Authorization header (preferred)
Authorization: Bearer pk_test_abc123...

# Option 2: x-api-key header
x-api-key: pk_test_abc123...
```

## 📊 Firestore Schema

### `publishers` Collection

```typescript
{
  id: "pub_abc123",           // Document ID
  email: "john@example.com",
  name: "John Doe",
  verified: false,            // Required for live keys
  createdAt: Timestamp
}
```

### `api_keys` Collection

```typescript
{
  id: "key_xyz789",                    // Document ID
  publisherId: "pub_abc123",
  keyHash: "sha256(...)",              // Hashed API key
  keyPrefix: "pk_test_abc12345",       // Display only
  type: "test" | "live",
  createdAt: Timestamp,
  lastUsedAt: Timestamp | undefined    // Auto-updated
}
```

## 🛠️ API Reference

### Publisher Management

```typescript
// Register new publisher
registerPublisher(email: string, name: string): Promise<{
  publisher: Publisher;
  apiKey: string;
}>

// Get publisher by ID
getPublisher(publisherId: string): Promise<Publisher | null>
```

### API Key Management

```typescript
// Create new API key
createApiKey(publisherId: string, keyType: 'live' | 'test'): Promise<{
  apiKey: string;
  keyId: string;
}>

// Validate API key
validateApiKey(apiKey: string): Promise<PublisherSession | null>

// Rotate API key
rotateApiKey(publisherId: string, keyId: string): Promise<{
  apiKey: string;
  keyId: string;
}>

// List API keys
listApiKeys(publisherId: string): Promise<Array<Omit<ApiKey, 'keyHash'>>>

// Delete API key
deleteApiKey(publisherId: string, keyId: string): Promise<void>
```

### Middleware

```typescript
// Require authentication (returns null if failed, sends 401)
requirePublisherAuth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<PublisherSession | null>

// Get session from request (after middleware)
getPublisherSession(req: IncomingMessage): PublisherSession | null
```

## 📝 Types

```typescript
interface Publisher {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  createdAt: Date;
}

interface ApiKey {
  id: string;
  publisherId: string;
  keyHash: string;
  keyPrefix: string;
  type: 'live' | 'test';
  createdAt: Date;
  lastUsedAt?: Date;
}

interface PublisherSession {
  publisherId: string;
  publisherName: string;
  verified: boolean;
  keyType: 'live' | 'test';
}
```

## 🔄 Key Lifecycle

```
1. CREATE
   └─> Publisher creates key via API
       ├─> Generate random key (pk_test_xxx or pk_live_xxx)
       ├─> Hash key (SHA-256)
       ├─> Store hash + prefix in Firestore
       └─> Return plaintext key (only time it's visible)

2. USE
   └─> Publisher sends key in Authorization header
       ├─> Hash incoming key
       ├─> Look up hash in Firestore
       ├─> Update lastUsedAt timestamp
       └─> Return session or null

3. ROTATE
   └─> Publisher rotates old key
       ├─> Create new key (same type)
       ├─> Delete old key
       └─> Return new key to publisher

4. DELETE
   └─> Publisher deletes key
       └─> Remove from Firestore (immediate revocation)
```

## 🧪 Testing

See complete examples in `__tests__/publisher-auth.example.ts`:

```typescript
import { runAllExamples } from './__tests__/publisher-auth.example.js';

// Run all examples (registration, key mgmt, validation, etc.)
await runAllExamples();
```

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `PUBLISHER-AUTH-README.md` | This file - overview and quick reference |
| `PUBLISHER-AUTH-INTEGRATION.md` | How to integrate with marketplace routes |
| `PUBLISHER-AUTH-MIGRATION.md` | Migration from header-based auth |
| `__tests__/publisher-auth.example.ts` | Runnable code examples |

## 🚦 Integration Checklist

- [ ] Deploy `publisher-auth.ts` and `publisher-auth-crypto.ts`
- [ ] Create Firestore indexes (if needed)
- [ ] Add admin routes for publisher registration
- [ ] Update `marketplace-routes.ts` to use `requirePublisherAuth()`
- [ ] Add self-service key management routes
- [ ] Test with at least 2 publishers
- [ ] Update API documentation
- [ ] Notify existing publishers
- [ ] Monitor logs for auth failures
- [ ] Remove old header-based auth (after migration complete)

## 🐛 Troubleshooting

| Error | Solution |
|-------|----------|
| "Invalid API key" | Check key format, ensure not deleted/rotated |
| "Publisher must be verified" | Only verified publishers can create live keys |
| "API key references non-existent publisher" | Data inconsistency - clean up orphaned keys |
| "Email already registered" | Publisher already exists, retrieve existing ID |

## 📈 Next Steps

1. **Admin Dashboard**: UI for managing publishers and verifying accounts
2. **Publisher Portal**: UI for publishers to manage their own keys
3. **Key Analytics**: Track usage per key, detect unused keys
4. **Rate Limiting**: Prevent abuse with per-publisher rate limits
5. **Webhooks**: Notify publishers of key events
6. **Key Expiration**: Optional expiry dates for enhanced security

## 🔗 Related

- `src/marketplace/index.ts` - Marketplace core logic
- `src/api/marketplace-routes.ts` - Marketplace API routes
- `src/marketplace/billing/stripe-webhooks.ts` - Payment processing
- `src/services/security-events.ts` - Security event logging

---

**Status**: ✅ Production Ready
**Dependencies**: `@google-cloud/firestore`, `node:crypto`
**File Size**: 481 lines (main) + 46 lines (crypto) = 527 lines total
**Test Coverage**: Examples provided, integration tests recommended
**Last Updated**: 2025-12-14
