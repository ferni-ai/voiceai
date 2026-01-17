# Ferni Webhook Events Reference

Complete reference for all webhook events delivered by the Ferni Developer Platform.

---

## Overview

Webhooks enable your application to receive real-time notifications about events in your Ferni integration. Events are delivered via HTTP POST requests to your configured endpoint with HMAC-SHA256 signatures for verification.

### Event Delivery

- **Protocol**: HTTPS (required)
- **Method**: POST
- **Content-Type**: `application/json`
- **Timeout**: 30 seconds
- **Retries**: 3 attempts with exponential backoff (1s, 10s, 100s)

### Signature Verification

Every webhook includes an `X-Webhook-Signature` header for verification:

```
X-Webhook-Signature: t=1704067200,v1=abc123...
```

**Format:**
- `t` - Unix timestamp (seconds)
- `v1` - HMAC-SHA256 signature

**Signature computation:**

```typescript
signature = HMAC-SHA256(secret, timestamp + "." + payload)
```

**Verification example:**

```typescript
import { verifyWebhookSignature } from '@ferni/sdk';

const isValid = await verifyWebhookSignature(
  requestBody,
  headers['x-webhook-signature'],
  process.env.WEBHOOK_SECRET
);

if (!isValid) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

---

## Common Payload Structure

All webhook events share this base structure:

```typescript
interface WebhookPayload {
  /** Unique event ID (for idempotency) */
  id: string;

  /** Event type (e.g., "session.started") */
  type: WebhookEventType;

  /** ISO-8601 timestamp */
  timestamp: string;

  /** Your publisher ID */
  publisherId: string;

  /** Event-specific data */
  data: Record<string, unknown>;
}
```

**Example:**

```json
{
  "id": "evt_abc123xyz789",
  "type": "session.started",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "publisherId": "pub_abc123",
  "data": {
    "sessionId": "sess_xyz789",
    "personaId": "wellness-coach-v1",
    "userId": "user_123"
  }
}
```

---

## Event Types

| Event | Description | When Triggered |
|-------|-------------|----------------|
| `session.started` | A voice session began | User connects to persona |
| `session.ended` | A voice session ended | User disconnects or timeout |
| `session.error` | An error occurred during session | Exception or failure |
| `persona.switched` | User switched between personas | Handoff completed |
| `tool.executed` | A tool was called during session | Persona uses a function |
| `transcript.ready` | Full transcript is available | After session ends |

---

## session.started

Triggered when a user starts a new voice session with one of your personas.

### Payload

```typescript
interface SessionStartedEvent {
  id: string;
  type: 'session.started';
  timestamp: string;
  publisherId: string;
  data: {
    /** Unique session identifier */
    sessionId: string;

    /** The persona being used */
    personaId: string;

    /** User identifier (if provided) */
    userId?: string;

    /** Session metadata */
    metadata?: {
      /** Platform (web, ios, android) */
      platform?: string;
      /** App version */
      appVersion?: string;
      /** User's locale */
      locale?: string;
      /** Custom data passed at session start */
      custom?: Record<string, unknown>;
    };

    /** Timestamp when session started */
    startedAt: string;
  };
}
```

### Example

```json
{
  "id": "evt_01HPXYZ123ABC",
  "type": "session.started",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "publisherId": "pub_abc123",
  "data": {
    "sessionId": "sess_01HPXYZ456DEF",
    "personaId": "wellness-coach-v1",
    "userId": "user_12345",
    "metadata": {
      "platform": "ios",
      "appVersion": "2.1.0",
      "locale": "en-US",
      "custom": {
        "subscriptionTier": "premium"
      }
    },
    "startedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

### Use Cases

- Track active sessions
- Initialize user context in your database
- Trigger analytics events
- Start billing timers

---

## session.ended

Triggered when a voice session ends, either by user action or timeout.

### Payload

```typescript
interface SessionEndedEvent {
  id: string;
  type: 'session.ended';
  timestamp: string;
  publisherId: string;
  data: {
    /** Unique session identifier */
    sessionId: string;

    /** The persona used */
    personaId: string;

    /** User identifier */
    userId?: string;

    /** Session duration in seconds */
    durationSeconds: number;

    /** Number of conversation turns */
    turnCount: number;

    /** How the session ended */
    endReason: 'user_disconnect' | 'timeout' | 'error' | 'handoff' | 'system';

    /** Timestamps */
    startedAt: string;
    endedAt: string;

    /** Session quality metrics */
    quality?: {
      /** Average response latency (ms) */
      avgLatencyMs: number;
      /** Number of interruptions */
      interruptions: number;
      /** Audio quality score (0-100) */
      audioQuality: number;
    };
  };
}
```

### Example

```json
{
  "id": "evt_01HPXYZ789GHI",
  "type": "session.ended",
  "timestamp": "2025-01-15T10:45:30.000Z",
  "publisherId": "pub_abc123",
  "data": {
    "sessionId": "sess_01HPXYZ456DEF",
    "personaId": "wellness-coach-v1",
    "userId": "user_12345",
    "durationSeconds": 930,
    "turnCount": 24,
    "endReason": "user_disconnect",
    "startedAt": "2025-01-15T10:30:00.000Z",
    "endedAt": "2025-01-15T10:45:30.000Z",
    "quality": {
      "avgLatencyMs": 245,
      "interruptions": 3,
      "audioQuality": 92
    }
  }
}
```

### Use Cases

- Calculate session billing
- Update usage analytics
- Trigger follow-up workflows
- Store session metrics

---

## session.error

Triggered when an error occurs during a session.

### Payload

```typescript
interface SessionErrorEvent {
  id: string;
  type: 'session.error';
  timestamp: string;
  publisherId: string;
  data: {
    /** Session where error occurred */
    sessionId: string;

    /** Persona involved */
    personaId: string;

    /** User identifier */
    userId?: string;

    /** Error code */
    errorCode: string;

    /** Human-readable error message */
    error: string;

    /** Error severity */
    severity: 'warning' | 'error' | 'critical';

    /** Whether the session recovered */
    recovered: boolean;

    /** Additional context */
    context?: {
      /** What was happening when error occurred */
      activity?: string;
      /** Related tool if applicable */
      toolName?: string;
      /** Stack trace (if available) */
      stackTrace?: string;
    };
  };
}
```

### Example

```json
{
  "id": "evt_01HPXYZERROR1",
  "type": "session.error",
  "timestamp": "2025-01-15T10:35:15.000Z",
  "publisherId": "pub_abc123",
  "data": {
    "sessionId": "sess_01HPXYZ456DEF",
    "personaId": "wellness-coach-v1",
    "userId": "user_12345",
    "errorCode": "TOOL_TIMEOUT",
    "error": "Tool execution exceeded timeout",
    "severity": "warning",
    "recovered": true,
    "context": {
      "activity": "executing_tool",
      "toolName": "getWeather"
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `AUDIO_ERROR` | Audio stream or codec issue |
| `CONNECTION_LOST` | Network connectivity problem |
| `TOOL_TIMEOUT` | Tool execution exceeded timeout |
| `TOOL_ERROR` | Tool returned an error |
| `RATE_LIMIT` | Rate limit exceeded |
| `PERSONA_ERROR` | Persona processing error |
| `TRANSCRIPT_ERROR` | Speech-to-text failure |
| `INTERNAL_ERROR` | Unexpected server error |

### Use Cases

- Monitor error rates
- Set up alerting for critical errors
- Debug integration issues
- Track tool reliability

---

## persona.switched

Triggered when a session switches from one persona to another (handoff).

### Payload

```typescript
interface PersonaSwitchedEvent {
  id: string;
  type: 'persona.switched';
  timestamp: string;
  publisherId: string;
  data: {
    /** Session where handoff occurred */
    sessionId: string;

    /** User identifier */
    userId?: string;

    /** Source persona */
    fromPersonaId: string;

    /** Destination persona */
    toPersonaId: string;

    /** Reason for handoff */
    reason: 'user_request' | 'auto_handoff' | 'escalation' | 'scheduled';

    /** Optional handoff context */
    handoffContext?: {
      /** Summary for receiving persona */
      summary?: string;
      /** Key topics discussed */
      topics?: string[];
      /** User's emotional state */
      emotionalState?: string;
    };

    /** Time spent with previous persona (seconds) */
    previousSessionDuration: number;
  };
}
```

### Example

```json
{
  "id": "evt_01HPXYZSWITCH",
  "type": "persona.switched",
  "timestamp": "2025-01-15T10:40:00.000Z",
  "publisherId": "pub_abc123",
  "data": {
    "sessionId": "sess_01HPXYZ456DEF",
    "userId": "user_12345",
    "fromPersonaId": "wellness-coach-v1",
    "toPersonaId": "fitness-trainer-v1",
    "reason": "user_request",
    "handoffContext": {
      "summary": "User completed morning mindfulness and wants to start workout",
      "topics": ["meditation", "morning-routine", "energy-levels"],
      "emotionalState": "calm-focused"
    },
    "previousSessionDuration": 600
  }
}
```

### Use Cases

- Track persona usage patterns
- Analyze handoff success rates
- Build user journey analytics
- Optimize persona recommendations

---

## tool.executed

Triggered when a persona executes a tool/function during a session.

### Payload

```typescript
interface ToolExecutedEvent {
  id: string;
  type: 'tool.executed';
  timestamp: string;
  publisherId: string;
  data: {
    /** Session where tool was executed */
    sessionId: string;

    /** Persona that executed the tool */
    personaId: string;

    /** User identifier */
    userId?: string;

    /** Name of the tool */
    toolName: string;

    /** Whether execution succeeded */
    success: boolean;

    /** Execution time in milliseconds */
    executionTimeMs: number;

    /** Tool arguments (sanitized) */
    arguments?: Record<string, unknown>;

    /** Error if failed */
    error?: string;

    /** Result summary (not full data for privacy) */
    resultSummary?: string;
  };
}
```

### Example

```json
{
  "id": "evt_01HPXYZTOOL01",
  "type": "tool.executed",
  "timestamp": "2025-01-15T10:32:45.000Z",
  "publisherId": "pub_abc123",
  "data": {
    "sessionId": "sess_01HPXYZ456DEF",
    "personaId": "wellness-coach-v1",
    "userId": "user_12345",
    "toolName": "logMood",
    "success": true,
    "executionTimeMs": 156,
    "arguments": {
      "mood": "calm",
      "energy": 7,
      "notes": "[REDACTED]"
    },
    "resultSummary": "Mood logged successfully"
  }
}
```

### Use Cases

- Track feature usage
- Monitor tool performance
- Build usage analytics
- Debug tool issues

---

## transcript.ready

Triggered when the full transcript is available after a session ends.

### Payload

```typescript
interface TranscriptReadyEvent {
  id: string;
  type: 'transcript.ready';
  timestamp: string;
  publisherId: string;
  data: {
    /** Session ID */
    sessionId: string;

    /** Persona used */
    personaId: string;

    /** User identifier */
    userId?: string;

    /** Full transcript */
    transcript: {
      /** Array of conversation turns */
      turns: TranscriptTurn[];

      /** Session summary */
      summary?: string;

      /** Detected topics */
      topics?: string[];

      /** Overall sentiment */
      sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';

      /** Word count */
      wordCount: number;
    };

    /** URLs to download transcript in different formats */
    downloads?: {
      json?: string;
      text?: string;
      srt?: string;
    };
  };
}

interface TranscriptTurn {
  /** Turn index (0-based) */
  index: number;

  /** Who spoke */
  role: 'user' | 'assistant';

  /** Transcript text */
  text: string;

  /** Turn timestamp */
  timestamp: string;

  /** Duration in seconds */
  durationSeconds: number;

  /** Detected emotion (for user turns) */
  emotion?: string;

  /** Confidence score (0-1) */
  confidence: number;
}
```

### Example

```json
{
  "id": "evt_01HPXYZTRANS1",
  "type": "transcript.ready",
  "timestamp": "2025-01-15T10:46:00.000Z",
  "publisherId": "pub_abc123",
  "data": {
    "sessionId": "sess_01HPXYZ456DEF",
    "personaId": "wellness-coach-v1",
    "userId": "user_12345",
    "transcript": {
      "turns": [
        {
          "index": 0,
          "role": "assistant",
          "text": "Hey there! How are you feeling today?",
          "timestamp": "2025-01-15T10:30:05.000Z",
          "durationSeconds": 2.1,
          "confidence": 1.0
        },
        {
          "index": 1,
          "role": "user",
          "text": "I'm feeling a bit stressed about work",
          "timestamp": "2025-01-15T10:30:12.000Z",
          "durationSeconds": 3.2,
          "emotion": "anxious",
          "confidence": 0.94
        }
      ],
      "summary": "User discussed work stress and practiced a 5-minute breathing exercise",
      "topics": ["stress", "work", "breathing", "relaxation"],
      "sentiment": "mixed",
      "wordCount": 847
    },
    "downloads": {
      "json": "https://api.ferni.ai/transcripts/sess_01HPXYZ456DEF.json",
      "text": "https://api.ferni.ai/transcripts/sess_01HPXYZ456DEF.txt"
    }
  }
}
```

### Use Cases

- Store conversations for analytics
- Build search across transcripts
- Quality assurance review
- Training data collection (with consent)

---

## Handling Webhooks

### Recommended Handler Pattern

```typescript
import express from 'express';
import { parseWebhookEvent, createWebhookRouter } from '@ferni/sdk';

const app = express();

// Use raw body for signature verification
app.use('/webhooks/ferni', express.raw({ type: 'application/json' }));

const handleWebhook = createWebhookRouter({
  'session.started': async (event) => {
    await db.sessions.create({
      id: event.data.sessionId,
      personaId: event.data.personaId,
      userId: event.data.userId,
      startedAt: event.data.startedAt,
    });
  },

  'session.ended': async (event) => {
    await db.sessions.update(event.data.sessionId, {
      endedAt: event.data.endedAt,
      durationSeconds: event.data.durationSeconds,
      turnCount: event.data.turnCount,
    });

    // Calculate billing
    await billing.recordUsage(
      event.data.userId,
      event.data.durationSeconds
    );
  },

  'session.error': async (event) => {
    if (event.data.severity === 'critical') {
      await alerting.send({
        title: 'Critical Session Error',
        details: event.data,
      });
    }

    await db.errors.log(event.data);
  },

  'transcript.ready': async (event) => {
    await storage.saveTranscript(
      event.data.sessionId,
      event.data.transcript
    );

    // Optional: index for search
    await search.index({
      sessionId: event.data.sessionId,
      text: event.data.transcript.turns.map(t => t.text).join(' '),
      topics: event.data.transcript.topics,
    });
  },
});

app.post('/webhooks/ferni', async (req, res) => {
  try {
    const event = await parseWebhookEvent(
      req.body.toString(),
      req.headers['x-webhook-signature'] as string,
      process.env.WEBHOOK_SECRET!
    );

    await handleWebhook(event);

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(401).json({ error: 'Invalid webhook' });
  }
});
```

### Idempotency

Events may be delivered multiple times (retries). Use `event.id` for idempotency:

```typescript
async function handleEvent(event: WebhookPayload) {
  // Check if already processed
  const exists = await db.processedEvents.exists(event.id);
  if (exists) {
    console.log(`Event ${event.id} already processed, skipping`);
    return;
  }

  // Process event
  await processEvent(event);

  // Mark as processed
  await db.processedEvents.create({ id: event.id, processedAt: new Date() });
}
```

### Error Handling

Return appropriate status codes:

| Status | Meaning | Retry Behavior |
|--------|---------|----------------|
| `200` | Success | No retry |
| `4xx` | Client error (bad request) | No retry |
| `5xx` | Server error | Will retry (3 attempts) |
| Timeout | No response in 30s | Will retry |

---

## Testing Webhooks

### Send Test Events

```typescript
import { FerniClient } from '@ferni/sdk';

const ferni = new FerniClient({ apiKey: process.env.FERNI_API_KEY });

// Send a test event
const { data } = await ferni.testWebhook('wh_abc123');

if (data.success) {
  console.log('Test delivered successfully');
  console.log('Status code:', data.statusCode);
  console.log('Time:', data.executionTimeMs, 'ms');
} else {
  console.error('Test failed:', data.error);
}
```

### Local Development with ngrok

```bash
# Start your webhook server locally
node webhook-server.js

# Expose via ngrok
ngrok http 3000

# Register webhook with ngrok URL
# https://abc123.ngrok.io/webhooks/ferni
```

### Webhook Logs

Check delivery history in the dashboard or via API:

```typescript
const { data } = await ferni.getWebhookLogs('wh_abc123', { limit: 10 });

for (const log of data.items) {
  console.log(`${log.eventType}: ${log.success ? '✓' : '✗'} (${log.statusCode})`);
  if (!log.success) {
    console.log('  Error:', log.error);
  }
}
```

---

## Best Practices

### 1. Respond Quickly

Process webhooks asynchronously. Return `200` immediately, then process:

```typescript
app.post('/webhooks/ferni', async (req, res) => {
  const event = await parseWebhookEvent(body, sig, secret);

  // Queue for async processing
  await eventQueue.add(event);

  // Respond immediately
  res.status(200).json({ received: true });
});

// Process queue separately
eventQueue.process(async (job) => {
  await handleWebhook(job.data);
});
```

### 2. Implement Idempotency

Always check `event.id` before processing.

### 3. Use Signature Verification

Never skip signature verification in production.

### 4. Handle Retries Gracefully

Events with the same `id` may arrive multiple times.

### 5. Log All Events

Keep an audit trail for debugging:

```typescript
await db.webhookLogs.create({
  eventId: event.id,
  eventType: event.type,
  receivedAt: new Date(),
  processed: false,
});
```

### 6. Monitor Webhook Health

Set up alerts for:
- High error rates
- Increased latency
- Missing expected events

---

## Related Documentation

- [API Reference](/docs/api/DEVELOPER-API-REFERENCE.md) - Full API documentation
- [Integration Tutorial](/docs/api/INTEGRATION-TUTORIAL.md) - Step-by-step guide
- [Authentication Guide](/docs/api/AUTHENTICATION.md) - API key management
- [Error Codes](/docs/api/ERROR-CODES.md) - Error reference

---

*Last updated: January 2025*
