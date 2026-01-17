# Ferni Developer Platform API Reference

> Build AI-powered voice experiences with human-like conversational capabilities.

**Base URL:** `https://api.ferni.ai`

**SDK:** `npm install @ferni/sdk`

---

## Authentication

All API requests require authentication via Bearer token:

```http
Authorization: Bearer ferni_live_xxxxxxxxxxxxx
```

### Key Types

| Prefix | Type | Usage |
|--------|------|-------|
| `ferni_live_` | Live | Production, billed |
| `ferni_test_` | Test | Development, free tier |

### Rate Limits

| Tier | Requests/min | Concurrent Sessions |
|------|--------------|---------------------|
| Free | 100 | 5 |
| Pro | 500 | 25 |
| Enterprise | Custom | Custom |

---

## API Keys

Manage API keys for authentication.

### List API Keys

Returns all API keys (prefix only for security).

```http
GET /api/v1/developers/keys
```

**Response:**

```json
{
  "success": true,
  "keys": [
    {
      "id": "key_abc123",
      "keyPrefix": "ferni_live_abc1...",
      "type": "live",
      "name": "Production App",
      "createdAt": "2025-01-15T10:30:00Z",
      "lastUsedAt": "2025-01-17T08:00:00Z"
    }
  ]
}
```

### Create API Key

Creates a new API key. Maximum 10 keys per account.

```http
POST /api/v1/developers/keys
```

**Request:**

```json
{
  "type": "live",
  "name": "Production App"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"live"` \| `"test"` | Yes | Key type |
| `name` | string | No | Display name (max 100 chars) |

**Response:**

```json
{
  "success": true,
  "key": {
    "id": "key_abc123",
    "apiKey": "ferni_live_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "type": "live",
    "createdAt": "2025-01-17T10:30:00Z"
  },
  "warning": "Save this key - it won't be shown again!"
}
```

> **Important:** The full API key is only returned once. Save it immediately!

### Rotate API Key

Revokes the old key and generates a new one.

```http
POST /api/v1/developers/keys/{keyId}/rotate
```

**Response:**

```json
{
  "success": true,
  "key": {
    "id": "key_abc123",
    "apiKey": "ferni_live_sk_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
    "createdAt": "2025-01-17T10:35:00Z"
  },
  "warning": "Save this key - it won't be shown again!"
}
```

### Revoke API Key

Immediately revokes an API key.

```http
DELETE /api/v1/developers/keys/{keyId}
```

**Response:**

```json
{
  "success": true,
  "message": "Key revoked"
}
```

---

## Personas

Create and manage AI personas for your application.

### Persona Lifecycle

```
draft → validating → submitted → approved → published
                              ↘ rejected (update and resubmit)
```

### List Personas

```http
GET /api/v1/developers/personas
```

**Response:**

```json
{
  "success": true,
  "personas": [
    {
      "id": "wellness-guide",
      "name": "Aria",
      "tagline": "Your personal wellness companion",
      "category": "wellness",
      "status": "published",
      "createdAt": "2025-01-10T08:00:00Z",
      "updatedAt": "2025-01-15T12:00:00Z"
    }
  ]
}
```

### Create Persona

Creates a new persona draft.

```http
POST /api/v1/developers/personas
```

**Request:**

```json
{
  "manifest": {
    "identity": {
      "id": "wellness-guide",
      "name": "Aria",
      "tagline": "Your personal wellness companion",
      "description": "Aria helps users build healthier habits through gentle guidance.",
      "aliases": ["wellness coach", "health guide"]
    },
    "voice": {
      "provider": "cartesia",
      "voice_id": "a0e99841-438c-4a64-b679-ae501e7d6091",
      "name": "Calm Female"
    },
    "personality": {
      "warmth": 0.9,
      "humor_level": 0.3,
      "directness": 0.6,
      "formality": 0.4,
      "traits": ["empathetic", "patient", "encouraging", "knowledgeable"]
    },
    "knowledge": {
      "category": "wellness",
      "domains": ["meditation", "mindfulness", "stress-management", "sleep"],
      "expertise_tags": ["breathwork", "guided-relaxation", "habit-formation"]
    },
    "behaviors": {
      "greetings": [
        "Hey there! How are you feeling today?",
        "Hi! I'm here to support you. What's on your mind?"
      ],
      "backchannels": ["mm-hmm", "I hear you", "that makes sense"],
      "thinking_sounds": ["hmm", "let me think about that"]
    }
  }
}
```

### Persona Manifest Schema

#### identity (required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (lowercase, hyphens only) |
| `name` | string | Yes | Display name (max 50 chars) |
| `tagline` | string | Yes | Brief description (min 10 chars) |
| `description` | string | No | Detailed description |
| `aliases` | string[] | No | Alternative names/phrases |

#### voice (required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `"cartesia"` | Yes | Voice provider |
| `voice_id` | string | Yes | Voice identifier |
| `name` | string | No | Voice display name |

#### personality (required)

| Field | Type | Required | Range | Description |
|-------|------|----------|-------|-------------|
| `warmth` | number | Yes | 0-1 | Empathy level |
| `humor_level` | number | Yes | 0-1 | Humor usage |
| `directness` | number | Yes | 0-1 | Direct vs diplomatic |
| `formality` | number | Yes | 0-1 | Formal vs casual |
| `traits` | string[] | Yes | min 2 | Personality traits |

#### knowledge (required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string | Yes | Primary category |
| `domains` | string[] | Yes | Knowledge domains (min 1) |
| `expertise_tags` | string[] | No | Specific expertise areas |

#### behaviors (optional)

| Field | Type | Description |
|-------|------|-------------|
| `greetings` | string[] | Opening messages |
| `backchannels` | string[] | Active listening sounds |
| `thinking_sounds` | string[] | Processing indicators |

**Response:**

```json
{
  "success": true,
  "persona": {
    "id": "wellness-guide",
    "name": "Aria",
    "tagline": "Your personal wellness companion",
    "category": "wellness",
    "status": "draft",
    "createdAt": "2025-01-17T10:00:00Z",
    "updatedAt": "2025-01-17T10:00:00Z"
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": ["Consider adding more greeting variations"]
  }
}
```

### Get Persona

Returns full persona details including manifest.

```http
GET /api/v1/developers/personas/{personaId}
```

**Response:**

```json
{
  "success": true,
  "persona": {
    "id": "wellness-guide",
    "name": "Aria",
    "tagline": "Your personal wellness companion",
    "category": "wellness",
    "status": "draft",
    "createdAt": "2025-01-17T10:00:00Z",
    "updatedAt": "2025-01-17T10:00:00Z",
    "manifest": { ... },
    "validationErrors": [],
    "rejectionReason": null
  }
}
```

### Update Persona

Update a draft or rejected persona.

```http
PUT /api/v1/developers/personas/{personaId}
```

**Request:** Same as Create Persona.

**Note:** Only `draft` and `rejected` personas can be updated.

### Delete Persona

Delete a persona draft.

```http
DELETE /api/v1/developers/personas/{personaId}
```

**Note:** Only `draft` personas can be deleted.

### Validate Persona

Check if a persona meets platform requirements.

```http
POST /api/v1/developers/personas/{personaId}/validate
```

**Response:**

```json
{
  "success": true,
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": ["Consider adding more domain expertise tags"]
  },
  "readyToSubmit": true
}
```

### Submit Persona

Submit a persona for review.

```http
POST /api/v1/developers/personas/{personaId}/submit
```

**Response:**

```json
{
  "success": true,
  "message": "Persona submitted for review. You'll be notified when reviewed.",
  "persona": {
    "id": "wellness-guide",
    "status": "submitted",
    ...
  }
}
```

---

## Webhooks

Receive real-time event notifications.

### Event Types

| Event | Description |
|-------|-------------|
| `session.started` | Voice session began |
| `session.ended` | Session completed |
| `session.error` | Error occurred during session |
| `persona.switched` | Persona handoff occurred |
| `tool.executed` | Tool was called during session |
| `transcript.ready` | Session transcript is available |

### List Webhooks

```http
GET /api/v2/developers/webhooks?limit=20&cursor=xxx
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Results per page |
| `cursor` | string | - | Pagination cursor |

**Response:**

```json
{
  "success": true,
  "items": [
    {
      "id": "wh_abc123",
      "publisherId": "pub_xyz",
      "personaId": null,
      "name": "Session Events",
      "url": "https://api.yourapp.com/webhooks/ferni",
      "events": ["session.started", "session.ended"],
      "secret": "whsec_xxxxxxxxxxxxxxxx",
      "enabled": true,
      "failureCount": 0,
      "createdAt": "2025-01-15T10:00:00Z",
      "lastDeliveredAt": "2025-01-17T08:00:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "nextCursor": "eyJsYXN0SWQiOiJ3aF9hYmMxMjMifQ==",
    "hasMore": false
  }
}
```

### Create Webhook

```http
POST /api/v2/developers/webhooks
```

**Request:**

```json
{
  "name": "Session Events",
  "url": "https://api.yourapp.com/webhooks/ferni",
  "events": ["session.started", "session.ended", "transcript.ready"],
  "personaId": null,
  "enabled": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `url` | string (URI) | Yes | Endpoint URL |
| `events` | string[] | Yes | Event types to receive |
| `personaId` | string | No | Filter to specific persona |
| `enabled` | boolean | No | Default: true |

### Get Webhook

```http
GET /api/v2/developers/webhooks/{webhookId}
```

### Update Webhook

```http
PUT /api/v2/developers/webhooks/{webhookId}
```

**Request:**

```json
{
  "name": "Updated Name",
  "enabled": false
}
```

### Delete Webhook

```http
DELETE /api/v2/developers/webhooks/{webhookId}
```

### Test Webhook

Send a test event to verify your endpoint.

```http
POST /api/v2/developers/webhooks/{webhookId}/test
```

**Response:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "statusCode": 200,
    "executionTimeMs": 142,
    "error": null,
    "payload": {
      "id": "evt_test_xxx",
      "type": "session.started",
      "timestamp": "2025-01-17T10:00:00Z",
      "publisherId": "pub_xyz",
      "data": {
        "sessionId": "sess_test",
        "personaId": "wellness-guide",
        "test": true
      }
    }
  }
}
```

### Get Webhook Logs

View delivery history.

```http
GET /api/v2/developers/webhooks/{webhookId}/logs?limit=50
```

**Response:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "log_xxx",
        "webhookId": "wh_abc123",
        "eventId": "evt_xxx",
        "eventType": "session.started",
        "statusCode": 200,
        "success": true,
        "error": null,
        "executionTimeMs": 98,
        "attempt": 1,
        "createdAt": "2025-01-17T08:00:00Z"
      }
    ],
    "pagination": {
      "limit": 50,
      "hasMore": false
    }
  }
}
```

### Webhook Signature Verification

Verify webhook authenticity using HMAC-SHA256:

```
signature = HMAC-SHA256(secret, timestamp + "." + payload)
```

**Header format:**
```
X-Webhook-Signature: t=1234567890,v1=abc123def456...
```

**Verification steps:**

1. Extract `t` (timestamp) and `v1` (signature) from header
2. Reject if timestamp is more than 5 minutes old
3. Compute expected signature: `HMAC-SHA256(secret, t + "." + body)`
4. Compare signatures using constant-time comparison

**Example (Node.js):**

```javascript
import { verifyWebhookSignature } from '@ferni/sdk';

app.post('/webhooks/ferni', async (req, res) => {
  const isValid = await verifyWebhookSignature(
    req.body,
    req.headers['x-webhook-signature'],
    process.env.WEBHOOK_SECRET
  );

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Process event...
  res.status(200).send('OK');
});
```

---

## Analytics

Monitor API usage and performance.

### Get Overview

Dashboard summary with comparison to previous period.

```http
GET /api/v1/developers/analytics/overview?period=week
```

**Query Parameters:**

| Parameter | Type | Default | Options |
|-----------|------|---------|---------|
| `period` | string | week | day, week, month, year |

**Response:**

```json
{
  "success": true,
  "period": "week",
  "overview": {
    "totalApiCalls": 15420,
    "totalApiCallsChange": 12,
    "activePersonas": 3,
    "activePersonasChange": 1,
    "uniqueUsers": 847,
    "uniqueUsersChange": 15,
    "errorRate": 0.8,
    "errorRateChange": -5,
    "avgResponseTime": 245,
    "avgResponseTimeChange": -12
  }
}
```

The `*Change` fields indicate percentage change from the previous period.

### Get Usage Over Time

```http
GET /api/v1/developers/analytics/usage?period=week
```

**Response:**

```json
{
  "success": true,
  "period": "week",
  "usage": [
    {
      "date": "2025-01-11",
      "apiCalls": 2100,
      "uniqueUsers": 120,
      "errors": 15
    },
    {
      "date": "2025-01-12",
      "apiCalls": 2350,
      "uniqueUsers": 135,
      "errors": 18
    }
  ]
}
```

### Get Persona Usage

```http
GET /api/v1/developers/analytics/personas?period=week
```

**Response:**

```json
{
  "success": true,
  "period": "week",
  "personas": [
    {
      "personaId": "wellness-guide",
      "personaName": "Aria",
      "totalCalls": 8500,
      "avgSessionDuration": 420,
      "uniqueUsers": 312
    },
    {
      "personaId": "productivity-coach",
      "personaName": "Max",
      "totalCalls": 6920,
      "avgSessionDuration": 380,
      "uniqueUsers": 278
    }
  ]
}
```

### Get Error Breakdown

```http
GET /api/v1/developers/analytics/errors?period=week
```

**Response:**

```json
{
  "success": true,
  "period": "week",
  "errors": [
    {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Too many requests",
      "count": 45,
      "lastOccurred": "2025-01-17T07:30:00Z"
    },
    {
      "code": "SESSION_TIMEOUT",
      "message": "Session timed out",
      "count": 23,
      "lastOccurred": "2025-01-17T06:15:00Z"
    }
  ]
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `PERSONA_INVALID_STATE` | 400 | Persona not in valid state for action |
| `MAX_KEYS_EXCEEDED` | 400 | Maximum API keys reached |
| `INTERNAL_ERROR` | 500 | Server error |

---

## SDK Quick Start

```typescript
import { FerniClient, parseWebhookEvent } from '@ferni/sdk';

// Initialize client
const ferni = new FerniClient({
  apiKey: 'ferni_live_xxxxxxxxxxxxx',
});

// Create a persona
const { persona } = await ferni.createPersona({
  identity: {
    id: 'my-persona',
    name: 'My Persona',
    tagline: 'A helpful AI assistant',
  },
  voice: {
    provider: 'cartesia',
    voice_id: 'xxx',
  },
  personality: {
    warmth: 0.8,
    humor_level: 0.4,
    directness: 0.7,
    formality: 0.5,
    traits: ['helpful', 'friendly'],
  },
  knowledge: {
    category: 'general',
    domains: ['conversation'],
  },
});

// Set up webhooks
await ferni.createWebhook({
  name: 'All Events',
  url: 'https://api.yourapp.com/webhooks/ferni',
  events: ['session.started', 'session.ended', 'transcript.ready'],
});

// Verify webhooks in your endpoint
app.post('/webhooks/ferni', async (req, res) => {
  const event = await parseWebhookEvent(
    req.body,
    req.headers['x-webhook-signature'],
    process.env.WEBHOOK_SECRET
  );

  console.log('Received event:', event.type, event.data);
  res.status(200).send('OK');
});
```

---

*Last updated: January 2025*
