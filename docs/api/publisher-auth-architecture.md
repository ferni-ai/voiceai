# Publisher Authentication Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Publisher Client                             │
│  (Developer's tool/script submitting to marketplace)                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ HTTP Request
                             │ Authorization: Bearer pk_live_xyz...
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API Gateway                                  │
│                    (ui-server.js / Cloud Run)                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    marketplace-routes.ts                             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  handlePublisherRoutes()                                 │      │
│  │                                                           │      │
│  │  1. Extract API key from headers                         │      │
│  │  2. Call requirePublisherAuth(req, res)  ─────────┐      │      │
│  │  3. If valid, continue with request               │      │      │
│  │  4. If invalid, 401 already sent                  │      │      │
│  └───────────────────────────────────────────────────┼──────┘      │
└────────────────────────────────────────────────────────┼────────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      publisher-auth.ts                               │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  requirePublisherAuth(req, res)                          │      │
│  │                                                           │      │
│  │  1. extractApiKeyFromRequest(req)                        │      │
│  │     ├─> Try Authorization: Bearer                        │      │
│  │     └─> Try x-api-key header                             │      │
│  │                                                           │      │
│  │  2. validateApiKey(apiKey) ──────────────────────┐       │      │
│  │                                                   │       │      │
│  │  3. Return PublisherSession or null               │       │      │
│  └───────────────────────────────────────────────────┼───────┘      │
│                                                      │              │
│  ┌──────────────────────────────────────────────────┼───────┐      │
│  │  validateApiKey(apiKey)                          │       │      │
│  │                                                   ▼       │      │
│  │  1. Hash API key ──> hashApiKey(apiKey) ────────────────┤│      │
│  │                      (SHA-256)                           ││      │
│  │                                                           │      │
│  │  2. Query Firestore for key hash ────────────────┐       │      │
│  │                                                   │       │      │
│  │  3. Get Publisher from publisherId ──────────────┤       │      │
│  │                                                   │       │      │
│  │  4. Update lastUsedAt (async, no wait)           │       │      │
│  │                                                   │       │      │
│  │  5. Return PublisherSession                       │       │      │
│  └───────────────────────────────────────────────────┼───────┘      │
└────────────────────────────────────────────────────────┼────────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Firestore Database                              │
│                                                                      │
│  ┌────────────────────────┐     ┌────────────────────────┐         │
│  │  Collection:           │     │  Collection:           │         │
│  │  publishers            │     │  api_keys              │         │
│  │                        │     │                        │         │
│  │  ┌──────────────────┐ │     │  ┌──────────────────┐  │         │
│  │  │ pub_abc123       │ │     │  │ key_xyz789       │  │         │
│  │  ├──────────────────┤ │     │  ├──────────────────┤  │         │
│  │  │ email            │ │     │  │ publisherId      │◄─┼─────┐   │
│  │  │ name             │ │     │  │ keyHash          │  │     │   │
│  │  │ verified         │ │     │  │ keyPrefix        │  │     │   │
│  │  │ createdAt        │ │     │  │ type             │  │     │   │
│  │  └──────────────────┘ │     │  │ createdAt        │  │     │   │
│  │                        │     │  │ lastUsedAt       │  │     │   │
│  └────────────────────────┘     │  └──────────────────┘  │     │   │
│               ▲                 └────────────────────────┘     │   │
│               └────────────────────────────────────────────────┘   │
│                              Foreign Key: publisherId              │
└─────────────────────────────────────────────────────────────────────┘
```

## Authentication Flow

```
1. PUBLISHER SUBMITS REQUEST
   │
   ▼
   POST /api/marketplace/publisher/submit
   Authorization: Bearer pk_live_xyz789...
   │
   ▼
2. MIDDLEWARE INTERCEPTS
   │
   ├─> Extract API key from headers
   │   ├─> Authorization: Bearer pk_*
   │   └─> x-api-key: pk_*
   │
   ├─> Hash the API key (SHA-256)
   │   pk_live_xyz789... → hash: 3a5f8b2c...
   │
   ├─> Query Firestore: api_keys.where('keyHash', '==', hash)
   │   │
   │   ├─> FOUND: key document
   │   │   ├─> Get publisherId from key doc
   │   │   ├─> Load Publisher from Firestore
   │   │   ├─> Update lastUsedAt (async)
   │   │   └─> Return PublisherSession { publisherId, name, verified, keyType }
   │   │
   │   └─> NOT FOUND: invalid key
   │       └─> Return 401 Unauthorized
   │
   ▼
3. ROUTE HANDLER PROCESSES REQUEST
   │
   ├─> Validate manifest.publisher.id === session.publisherId
   ├─> Check session.verified for live operations
   ├─> Process submission
   └─> Return response
```

## Key Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         CREATE KEY                               │
└─────────────────────────────────────────────────────────────────┘

POST /api/marketplace/publisher/keys
Authorization: Bearer pk_test_abc123...
{ "type": "live" }
   │
   ├─> Authenticate publisher (validates existing key)
   │
   ├─> Check if publisher.verified == true (for live keys)
   │
   ├─> Generate new API key
   │   └─> generateApiKey('live')
   │       └─> "pk_live_" + randomBytes(24).toString('base64url')
   │
   ├─> Hash the key
   │   └─> hashApiKey(apiKey) → SHA-256 hash
   │
   ├─> Store in Firestore
   │   {
   │     id: "key_new456",
   │     publisherId: "pub_abc123",
   │     keyHash: "3a5f8b2c...",
   │     keyPrefix: "pk_live_xyz78901",
   │     type: "live",
   │     createdAt: now()
   │   }
   │
   └─> Return { apiKey: "pk_live_xyz789...", keyId: "key_new456" }
       ⚠️ This is the ONLY time the plaintext key is shown!


┌─────────────────────────────────────────────────────────────────┐
│                         ROTATE KEY                               │
└─────────────────────────────────────────────────────────────────┘

POST /api/marketplace/publisher/keys/key_old123/rotate
Authorization: Bearer pk_test_abc123...
   │
   ├─> Authenticate publisher
   │
   ├─> Fetch old key from Firestore
   │   └─> Verify ownership (key.publisherId === session.publisherId)
   │
   ├─> Create new key (same type as old key)
   │   └─> createApiKey(publisherId, oldKey.type)
   │
   ├─> Delete old key from Firestore
   │   └─> DELETE api_keys/key_old123
   │
   └─> Return { apiKey: "pk_live_new789...", keyId: "key_new456" }
       ⚠️ Old key immediately invalidated!


┌─────────────────────────────────────────────────────────────────┐
│                         LIST KEYS                                │
└─────────────────────────────────────────────────────────────────┘

GET /api/marketplace/publisher/keys
Authorization: Bearer pk_test_abc123...
   │
   ├─> Authenticate publisher
   │
   ├─> Query Firestore: api_keys.where('publisherId', '==', publisherId)
   │
   └─> Return [{
       {
         id: "key_xyz789",
         keyPrefix: "pk_test_abc12345",  // Display only
         type: "test",
         createdAt: "2025-12-14T10:00:00Z",
         lastUsedAt: "2025-12-14T15:30:00Z"
       },
       // ... more keys
     }]
     ⚠️ Full key hash NOT returned for security
```

## Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         LAYER 1: Transport                       │
│                         HTTPS/TLS                                │
└────────────────────────────┬────────────────────────────────────┘
                             │ Encrypted in transit
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LAYER 2: Key Format                      │
│                         pk_live_* / pk_test_*                    │
│                         - Identifies key type                    │
│                         - 32-char random suffix                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Plaintext key
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LAYER 3: Hashing                         │
│                         SHA-256                                  │
│                         - One-way hash                           │
│                         - Cannot reverse to get key              │
└────────────────────────────┬────────────────────────────────────┘
                             │ Stored as hash
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LAYER 4: Storage                         │
│                         Firestore                                │
│                         - Only hash stored                       │
│                         - Prefix for display                     │
│                         - No plaintext keys                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ At rest
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LAYER 5: Ownership                       │
│                         publisherId verification                 │
│                         - Key operations require ownership       │
│                         - No cross-publisher access              │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌──────────────┐
│  Publisher   │  1. Register
│              ├──────────────────────────┐
│              │                          │
│              │ POST /admin/publishers   ▼
│              │ { email, name }    ┌─────────────────┐
│              │                    │  Firestore:     │
│              │◄───────────────────┤  publishers     │
│              │ { publisher,       │                 │
│              │   apiKey }         │  + api_keys     │
└──────┬───────┘                    └─────────────────┘
       │                                    ▲
       │                                    │
       │ 2. Submit to marketplace           │
       │    Authorization: Bearer pk_*      │
       │                                    │
       ▼                                    │
┌──────────────┐                            │
│ Marketplace  │  3. Validate key           │
│   Routes     ├────────────────────────────┘
│              │    - Hash incoming key
│              │    - Look up in Firestore
│              │    - Return session
│              │
│              │  4. Process request
│              │    - Register tool/agent
│              │    - Update analytics
│              │
│              ▼
│         ┌────────────┐
│         │  Response  │
│         └────────────┘
└──────────────┘
```

## Component Responsibilities

### `publisher-auth-crypto.ts`
- Generate random API keys with proper prefixes
- Hash API keys using SHA-256
- Extract key prefixes for display
- Generate unique IDs for publishers and keys

### `publisher-auth.ts`
- Manage publisher registration and retrieval
- Create, validate, rotate, and delete API keys
- Provide middleware for route authentication
- Update key usage timestamps
- Interact with Firestore

### `marketplace-routes.ts`
- Use `requirePublisherAuth()` middleware
- Verify publisher ownership of submissions
- Process authenticated requests
- Enforce verification requirements

### Firestore
- Store publisher accounts
- Store hashed API keys
- Track key usage (lastUsedAt)
- Provide indexing for fast key lookups

## Error Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                         Error Scenarios                          │
└─────────────────────────────────────────────────────────────────┘

1. NO API KEY PROVIDED
   └─> 401 Unauthorized
       { error: "API key required",
         message: "Provide API key via Authorization: Bearer or x-api-key" }

2. INVALID API KEY
   └─> 401 Unauthorized
       { error: "Invalid API key",
         message: "The provided API key is invalid or has been revoked" }

3. PUBLISHER ID MISMATCH
   └─> 403 Forbidden
       { error: "Publisher ID mismatch" }

4. UNVERIFIED PUBLISHER CREATING LIVE KEY
   └─> 400 Bad Request
       { error: "Publisher must be verified to create live API keys" }

5. KEY NOT FOUND DURING ROTATION
   └─> 404 Not Found
       { error: "API key not found" }

6. UNAUTHORIZED KEY OPERATION
   └─> 403 Forbidden
       { error: "Not authorized to rotate/delete this key" }
```

## Performance Considerations

1. **Key Validation**: O(1) hash lookup in Firestore
2. **lastUsedAt Updates**: Async, non-blocking (fire-and-forget)
3. **Session Caching**: Consider caching validated sessions (TTL: 5 min)
4. **Firestore Indexes**: Automatic on `keyHash` field
5. **Connection Pooling**: Reuse Firestore client instance

## Next Steps

1. **Add Rate Limiting**: Prevent brute-force key guessing
2. **Key Expiration**: Optional TTL for enhanced security
3. **Audit Logging**: Log all key operations to `security-events.ts`
4. **Metrics**: Track auth success/failure rates
5. **Admin Dashboard**: UI for managing publishers and keys
