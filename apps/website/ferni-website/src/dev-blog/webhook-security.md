---
title: "Webhook Security Best Practices"
excerpt: "How to verify webhook signatures, handle retries, and build robust event handlers for the Ferni Developer Platform."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-10
category: "Security"
image: "webhook-security.png"
readTime: 10
---

Webhooks let you receive real-time events from Ferni when users interact with your agents. This guide covers security best practices: signature verification, retry handling, and building resilient handlers.

## Why Webhook Security Matters

When you expose a webhook endpoint, you're accepting HTTP requests from the internet. Without proper verification, an attacker could:

- **Spoof events** - Send fake events to trigger unintended actions
- **Replay attacks** - Re-send legitimate events to duplicate actions
- **Resource exhaustion** - Flood your endpoint with requests

Ferni signs every webhook with HMAC-SHA256, letting you verify authenticity.

## Signature Verification

### The Signature Header

Every webhook includes an `X-Ferni-Signature` header:

```
X-Ferni-Signature: t=1704985200,v1=5e8f34a2b1c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3
```

This contains:
- `t` - Unix timestamp when the signature was generated
- `v1` - HMAC-SHA256 signature of the payload

### Verification Algorithm

1. Extract timestamp and signature from the header
2. Construct the signed payload: `{timestamp}.{raw_body}`
3. Compute HMAC-SHA256 with your webhook secret
4. Compare signatures using timing-safe comparison

### Node.js Example

```typescript
import crypto from 'crypto';
import express from 'express';

const app = express();

// Use raw body for signature verification
app.use('/webhooks/ferni', express.raw({ type: 'application/json' }));

function verifyWebhookSignature(
  payload: Buffer,
  signature: string,
  secret: string,
  toleranceSeconds = 300
): boolean {
  // Parse signature header
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parseInt(parts.t, 10);
  const expectedSignature = parts.v1;

  // Check timestamp tolerance (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    throw new Error('Webhook timestamp too old');
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload.toString()}`;
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(computedSignature)
  );
}

app.post('/webhooks/ferni', (req, res) => {
  const signature = req.headers['x-ferni-signature'] as string;
  const secret = process.env.FERNI_WEBHOOK_SECRET!;

  try {
    if (!verifyWebhookSignature(req.body, signature, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body.toString());
    console.log('Verified event:', event.type);

    // Handle the event...

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook verification failed:', error);
    res.status(400).json({ error: 'Verification failed' });
  }
});
```

### Python Example

```python
import hmac
import hashlib
import time
from flask import Flask, request, jsonify

app = Flask(__name__)

def verify_webhook_signature(
    payload: bytes,
    signature: str,
    secret: str,
    tolerance_seconds: int = 300
) -> bool:
    # Parse signature header
    parts = dict(part.split('=') for part in signature.split(','))
    timestamp = int(parts['t'])
    expected_signature = parts['v1']

    # Check timestamp tolerance
    now = int(time.time())
    if abs(now - timestamp) > tolerance_seconds:
        raise ValueError('Webhook timestamp too old')

    # Compute expected signature
    signed_payload = f"{timestamp}.{payload.decode()}"
    computed_signature = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(expected_signature, computed_signature)

@app.route('/webhooks/ferni', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Ferni-Signature')
    secret = os.environ['FERNI_WEBHOOK_SECRET']

    try:
        if not verify_webhook_signature(request.data, signature, secret):
            return jsonify({'error': 'Invalid signature'}), 401

        event = request.json
        print(f"Verified event: {event['type']}")

        # Handle the event...

        return jsonify({'received': True}), 200
    except Exception as e:
        print(f"Webhook verification failed: {e}")
        return jsonify({'error': 'Verification failed'}), 400
```

## Handling Retries

Ferni retries failed webhook deliveries with exponential backoff:

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | 0s | 0s |
| 2 | 1m | 1m |
| 3 | 5m | 6m |
| 4 | 30m | 36m |
| 5 | 2h | 2h 36m |

A delivery is considered failed if:
- Connection timeout (30s)
- HTTP status code >= 400
- No response body

### Idempotency

Because of retries, your handler may receive the same event multiple times. Use the event ID for idempotency:

```typescript
const processedEvents = new Set<string>();

app.post('/webhooks/ferni', async (req, res) => {
  // ... verify signature ...

  const event = JSON.parse(req.body.toString());

  // Check if already processed
  if (processedEvents.has(event.id)) {
    console.log('Duplicate event, skipping:', event.id);
    return res.status(200).json({ received: true });
  }

  // Process the event
  await handleEvent(event);

  // Mark as processed (use Redis/database for production)
  processedEvents.add(event.id);

  res.status(200).json({ received: true });
});
```

For production, store processed event IDs in Redis or your database:

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const EVENT_TTL = 60 * 60 * 24 * 7; // 7 days

async function isEventProcessed(eventId: string): Promise<boolean> {
  return (await redis.exists(`webhook:${eventId}`)) === 1;
}

async function markEventProcessed(eventId: string): Promise<void> {
  await redis.setex(`webhook:${eventId}`, EVENT_TTL, '1');
}
```

## Respond Quickly

Ferni waits up to 30 seconds for a response. For long-running tasks, acknowledge immediately and process asynchronously:

```typescript
import { Queue } from 'bull';

const webhookQueue = new Queue('webhooks', process.env.REDIS_URL);

app.post('/webhooks/ferni', async (req, res) => {
  // ... verify signature ...

  const event = JSON.parse(req.body.toString());

  // Queue for async processing
  await webhookQueue.add('process-event', event);

  // Acknowledge immediately
  res.status(200).json({ received: true });
});

// Process events asynchronously
webhookQueue.process('process-event', async (job) => {
  const event = job.data;
  console.log('Processing event:', event.type);

  switch (event.type) {
    case 'session.ended':
      await handleSessionEnded(event);
      break;
    case 'tool.called':
      await handleToolCalled(event);
      break;
    // ...
  }
});
```

## Event Types

### Session Events

```typescript
// session.started
{
  "id": "evt_abc123",
  "type": "session.started",
  "timestamp": "2026-01-11T10:00:00Z",
  "publisherId": "pub_xyz",
  "data": {
    "sessionId": "sess_123",
    "userId": "usr_456",
    "personaId": "ferni"
  }
}

// session.ended
{
  "id": "evt_abc124",
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

```typescript
// tool.called
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

// tool.completed
{
  "id": "evt_abc126",
  "type": "tool.completed",
  "timestamp": "2026-01-11T10:05:01Z",
  "publisherId": "pub_xyz",
  "data": {
    "sessionId": "sess_123",
    "toolId": "tool_789",
    "toolName": "lookup_customer",
    "success": true,
    "duration": 145
  }
}
```

### Workflow Events

```typescript
// workflow.completed
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

## Viewing Delivery Logs

Check webhook delivery history:

```bash
curl https://api.ferni.ai/api/v2/developers/webhooks/wh_abc123/logs \
  -H "Authorization: Bearer pk_live_xxx"
```

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

## Testing Webhooks

Use the test endpoint to send a sample event:

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/webhooks/wh_abc123/test \
  -H "Authorization: Bearer pk_live_xxx"
```

This sends a `webhook.test` event to your endpoint with a valid signature.

## Security Checklist

- [ ] **Verify signatures** on every request
- [ ] **Check timestamp tolerance** to prevent replay attacks
- [ ] **Use timing-safe comparison** for signatures
- [ ] **Store secrets securely** (environment variables, not code)
- [ ] **Implement idempotency** using event IDs
- [ ] **Respond quickly** (< 30s) - queue long tasks
- [ ] **Use HTTPS** for your webhook endpoint
- [ ] **Log failures** for debugging
- [ ] **Monitor delivery logs** in the dashboard

## Next Steps

- [Webhook Events Reference](/developers/api/webhooks/) - Full event type documentation
- [Custom Tools API](/developers/api/tools/) - Trigger webhooks from tools
- [Workflow Integration](/developers/blog/workflow-engine-guide/) - Use webhooks in workflows

---

Questions about webhook security? Join our [Discord](https://discord.gg/ferni) for support.
