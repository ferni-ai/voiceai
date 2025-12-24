# @ferni/intelligence-worker

Intelligence worker platform for Ferni - pattern detection, predictive analytics, trust recording, and collective learning.

## Architecture

This app runs as a separate Cloud Run service, processing intelligence events that were previously fire-and-forget in the voice agent (causing reliability issues and potential crashes).

```
Voice Agent → Pub/Sub → Intelligence Workers → Firestore → Insights
               (async)   (process)             (store)     (apply)
```

## Why Separate Workers?

1. **Reliability** - Fire-and-forget operations in voice agent can crash the main process
2. **Performance** - Heavy analytics don't block the voice response critical path
3. **Scalability** - Intelligence processing scales independently
4. **Observability** - Better metrics and error tracking

## Endpoints

| Endpoint | Method | Trigger | Description |
|----------|--------|---------|-------------|
| `/health` | GET | Any | Health check |
| `/process-event` | POST | Pub/Sub | Process single event from queue |
| `/process-batch` | POST | Cloud Scheduler | Process batch of pending events |
| `/test-event` | POST | Manual | Test processing an event |
| `/metrics` | GET | Any | Worker metrics |

## Event Types

| Type | Description | Handler |
|------|-------------|---------|
| `pattern_detection` | Cross-session pattern analysis | `pattern-detection.ts` |
| `predictive_intelligence` | Superhuman predictions | `predictive-intelligence.ts` |
| `key_moment` | Vulnerability, breakthrough detection | `key-moment.ts` |
| `trust_recording` | Trust signal tracking | `trust-recording.ts` |
| `response_quality` | Response quality metrics | `response-quality.ts` |
| `outreach_extraction` | Outreach context extraction | (pending) |
| `voice_identity` | Voice identity processing | (pending) |
| `tool_usage` | Tool usage tracking | (pending) |

## Development

```bash
# From repo root
pnpm install

# From this directory
cd apps/intelligence-worker
pnpm dev         # Start with hot reload (port 8081)
pnpm build       # Build TypeScript
pnpm build:fast  # Build with esbuild (faster)
pnpm typecheck   # Type check only
pnpm test        # Run tests
```

## Deployment

```bash
# Deploy to Cloud Run via Ferni CLI
ferni deploy intelligence

# Or manually via Cloud Build
gcloud builds submit --config=cloudbuild-intelligence.yaml
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | `johnb-2025` | GCP project ID |
| `PORT` | `8081` | Server port |
| `DRY_RUN` | `false` | Skip actual writes |
| `LOG_LEVEL` | `info` | Logging level |

## Publishing Events from Voice Agent

```typescript
import { publishIntelligenceEvent } from '../services/intelligence-publisher.js';

// Publish pattern detection event
await publishIntelligenceEvent({
  type: 'pattern_detection',
  userId,
  sessionId,
  payload: {
    message: userText,
    topic: detectedTopic,
    emotion: detectedEmotion,
  },
});
```

## Testing

```bash
# Run tests
pnpm test

# Test a specific event locally
curl -X POST http://localhost:8081/test-event?dryRun=true \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "test-123",
    "type": "pattern_detection",
    "userId": "user-123",
    "sessionId": "session-456",
    "timestamp": "2024-12-24T00:00:00Z",
    "payload": {
      "message": "I feel anxious about work",
      "topic": "work",
      "emotion": "anxious"
    }
  }'

# Check health
curl http://localhost:8081/health

# Check metrics
curl http://localhost:8081/metrics
```

## Project Structure

```
apps/intelligence-worker/
├── src/
│   ├── index.ts              # Package exports
│   ├── server.ts             # HTTP server (Cloud Run entry)
│   ├── types.ts              # Shared types
│   ├── logger.ts             # Pino logger setup
│   └── handlers/
│       ├── index.ts          # Handler exports
│       ├── pattern-detection.ts
│       ├── predictive-intelligence.ts
│       ├── key-moment.ts
│       ├── trust-recording.ts
│       └── response-quality.ts
├── Dockerfile                # Container build
├── package.json
├── tsconfig.json
└── esbuild.config.js         # Fast build config
```

