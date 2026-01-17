---
layout: layouts/docs.njk
title: Webhooks API
description: Subscribe to events and receive real-time notifications
order: 4
---

# Webhooks API

Subscribe to Ferni events and receive real-time HTTP notifications. Webhooks are signed with HMAC-SHA256 for security.

**Base URL:** `https://api.ferni.ai/api/v2/developers/webhooks`

---

## Create Webhook

Create a new webhook subscription.

```http
POST /webhooks
```

### Request Body

```json
{
  "name": "Session Events",
  "url": "https://api.yourcompany.com/ferni-webhooks",
  "events": [
    "session.started",
    "session.ended",
    "tool.called",
    "workflow.completed"
  ],
  "enabled": true
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable name for this webhook |
| `url` | string | Yes | HTTPS endpoint to receive events |
| `events` | string[] | Yes | Event types to subscribe to |
| `enabled` | boolean | No | Active state (default: `true`) |
| `personaId` | string | No | Filter events for specific persona |

### Response

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123xyz",
    "name": "Session Events",
    "url": "https://api.yourcompany.com/ferni-webhooks",
    "events": ["session.started", "session.ended", "tool.called", "workflow.completed"],
    "enabled": true,
    "secret": "whsec_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
    "status": "active",
    "createdAt": "2026-01-11T10:00:00Z",
    "updatedAt": "2026-01-11T10:00:00Z"
  }
}
```

**Important:** The `secret` is only returned on creation. Store it securely for signature verification.

---

## List Webhooks

Retrieve all webhook subscriptions.

```http
GET /webhooks
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `active`, `failing`, `disabled` |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "wh_abc123xyz",
      "name": "Session Events",
      "url": "https://api.yourcompany.com/ferni-webhooks",
      "events": ["session.started", "session.ended"],
      "enabled": true,
      "status": "active",
      "lastDeliveredAt": "2026-01-11T10:15:00Z",
      "createdAt": "2026-01-11T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

---

## Get Webhook

Retrieve a specific webhook by ID.

```http
GET /webhooks/:id
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123xyz",
    "name": "Session Events",
    "url": "https://api.yourcompany.com/ferni-webhooks",
    "events": ["session.started", "session.ended"],
    "enabled": true,
    "status": "active",
    "deliveryStats": {
      "total": 156,
      "successful": 154,
      "failed": 2,
      "averageLatencyMs": 89
    },
    "lastDeliveredAt": "2026-01-11T10:15:00Z",
    "createdAt": "2026-01-11T10:00:00Z",
    "updatedAt": "2026-01-11T10:00:00Z"
  }
}
```

---

## Update Webhook

Update an existing webhook. Only include fields you want to change.

```http
PUT /webhooks/:id
```

### Request Body

```json
{
  "events": ["session.started", "session.ended", "tool.called"],
  "enabled": true
}
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "wh_abc123xyz",
    "events": ["session.started", "session.ended", "tool.called"],
    "enabled": true,
    "updatedAt": "2026-01-11T11:00:00Z"
  }
}
```

---

## Delete Webhook

Permanently remove a webhook subscription.

```http
DELETE /webhooks/:id
```

### Response

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "wh_abc123xyz"
  }
}
```

---

## Send Test Event

Send a test event to verify your endpoint.

```http
POST /webhooks/:id/test
```

### Response

```json
{
  "success": true,
  "data": {
    "delivered": true,
    "statusCode": 200,
    "latencyMs": 145,
    "testedAt": "2026-01-11T10:20:00Z"
  }
}
```

---

## View Delivery Logs

Get recent delivery attempts for a webhook.

```http
GET /webhooks/:id/logs
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `delivered`, `failed`, `pending` |
| `limit` | number | Max results (default: 50, max: 200) |

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "del_123",
      "eventId": "evt_abc123",
      "eventType": "session.ended",
      "status": "delivered",
      "attempts": 1,
      "statusCode": 200,
      "latencyMs": 145,
      "deliveredAt": "2026-01-11T10:15:01Z"
    },
    {
      "id": "del_124",
      "eventId": "evt_abc124",
      "eventType": "tool.called",
      "status": "failed",
      "attempts": 5,
      "statusCode": 500,
      "error": "Internal Server Error",
      "lastAttemptAt": "2026-01-11T12:51:01Z"
    }
  ]
}
```

---

## Event Types

### Session Events

| Event | Description |
|-------|-------------|
| `session.started` | User started a conversation |
| `session.ended` | User ended a conversation |

**Payload:**

```json
{
  "id": "evt_abc123",
  "type": "session.ended",
  "timestamp": "2026-01-11T10:15:00Z",
  "publisherId": "pub_xyz",
  "data": {
    "sessionId": "sess_123",
    "userId": "usr_456",
    "personaId": "ferni",
    "duration": 900,
    "turnCount": 12
  }
}
```

### Tool Events

| Event | Description |
|-------|-------------|
| `tool.called` | A tool was invoked |
| `tool.completed` | Tool execution finished |
| `tool.failed` | Tool execution failed |

**Payload:**

```json
{
  "id": "evt_abc125",
  "type": "tool.called",
  "timestamp": "2026-01-11T10:05:00Z",
  "publisherId": "pub_xyz",
  "data": {
    "sessionId": "sess_123",
    "toolId": "tool_789",
    "toolName": "lookup_customer",
    "arguments": { "query": "Acme Corp" }
  }
}
```

### Workflow Events

| Event | Description |
|-------|-------------|
| `workflow.started` | Workflow execution began |
| `workflow.completed` | Workflow finished successfully |
| `workflow.failed` | Workflow execution failed |
| `workflow.step.completed` | Individual step completed |

**Payload:**

```json
{
  "id": "evt_abc127",
  "type": "workflow.completed",
  "timestamp": "2026-01-11T10:10:00Z",
  "publisherId": "pub_xyz",
  "data": {
    "workflowId": "wf_123",
    "executionId": "exec_456",
    "status": "completed",
    "duration": 3500,
    "stepsExecuted": 5
  }
}
```

### Activity Events

| Event | Description |
|-------|-------------|
| `activity.created` | Custom activity was logged |

---

## Signature Verification

Every webhook includes an `X-Ferni-Signature` header:

```
X-Ferni-Signature: t=1704985200,v1=5e8f34a2b1c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3
```

### Verification Algorithm

1. Extract `t` (timestamp) and `v1` (signature) from header
2. Construct signed payload: `{timestamp}.{raw_body}`
3. Compute HMAC-SHA256 using your webhook secret
4. Compare using timing-safe comparison
5. Reject if timestamp > 5 minutes old (replay protection)

### Node.js Example

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const [tPart, v1Part] = signature.split(',');
  const timestamp = tPart.split('=')[1];
  const expectedSig = v1Part.split('=')[1];

  // Check timestamp tolerance (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new Error('Timestamp too old');
  }

  // Compute signature
  const signedPayload = `${timestamp}.${payload}`;
  const computedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(expectedSig),
    Buffer.from(computedSig)
  );
}
```

---

## Retry Policy

Failed deliveries are retried with exponential backoff:

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | 0s | 0s |
| 2 | 1m | 1m |
| 3 | 5m | 6m |
| 4 | 30m | 36m |
| 5 | 2h | 2h 36m |

A delivery fails if:
- Connection timeout (30s)
- HTTP status >= 400
- No response received

After 5 failed attempts, the event is marked as failed and logged.

---

## Status Values

| Status | Description |
|--------|-------------|
| `active` | Healthy, recent deliveries successful |
| `failing` | Recent deliveries have failed |
| `disabled` | Manually disabled by developer |

---

## Best Practices

1. **Respond quickly** — Return 200 within 30 seconds
2. **Process async** — Queue events and acknowledge immediately
3. **Implement idempotency** — Use `event.id` to dedupe
4. **Verify signatures** — Always validate HMAC
5. **Monitor delivery logs** — Check for failures regularly

---

## Related

- [Webhook Security Guide](/dev-blog/webhook-security/) — Full security tutorial
- [Workflow Events](/developers/api/workflows/) — Trigger workflows from webhooks
