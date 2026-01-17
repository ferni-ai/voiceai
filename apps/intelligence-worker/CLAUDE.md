# Intelligence Worker

Cloud Run service for intelligence processing - pattern detection, predictive analytics, trust recording.

## Purpose

Processes intelligence events async to prevent voice agent crashes and keep the critical voice path fast. Heavy analytics run here independently.

## Architecture

```
Voice Agent → Pub/Sub → Intelligence Workers → Firestore → Insights
              (async)   (process)             (store)     (apply)
```

## Key Files

```
src/
├── index.ts              # Package exports
├── server.ts             # HTTP server (Cloud Run entry)
├── types.ts              # Event types
├── logger.ts             # Pino logger
└── handlers/
    ├── index.ts          # Handler exports
    ├── pattern-detection.ts      # Cross-session patterns
    ├── predictive-intelligence.ts # Superhuman predictions
    ├── key-moment.ts             # Vulnerability, breakthrough
    ├── trust-recording.ts        # Trust signals
    └── response-quality.ts       # Response metrics
```

## Build & Run

```bash
cd apps/intelligence-worker

# Development
pnpm dev         # Hot reload on port 8081

# Build
pnpm build       # Full TypeScript
pnpm build:fast  # esbuild (faster)
pnpm typecheck   # Type check only

# Test
pnpm test
```

## Deployment

```bash
# Via Ferni CLI (recommended)
ferni deploy intelligence

# Manual
gcloud builds submit --config=cloudbuild-intelligence.yaml
```

## Endpoints

| Endpoint | Method | Trigger | Description |
|----------|--------|---------|-------------|
| `/health` | GET | Any | Health check |
| `/process-event` | POST | Pub/Sub | Process single event |
| `/process-batch` | POST | Cloud Scheduler | Batch processing |
| `/test-event` | POST | Manual | Test event |
| `/metrics` | GET | Any | Worker metrics |

## Event Types

| Type | Description |
|------|-------------|
| `pattern_detection` | Cross-session pattern analysis |
| `predictive_intelligence` | Superhuman predictions |
| `key_moment` | Vulnerability/breakthrough detection |
| `trust_recording` | Trust signal tracking |
| `response_quality` | Response quality metrics |

## Publishing Events from Voice Agent

```typescript
import { publishIntelligenceEvent } from '../services/intelligence-publisher.js';

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

## Why Separate Workers?

1. **Reliability** - Fire-and-forget in voice agent can crash
2. **Performance** - Heavy analytics don't block voice response
3. **Scalability** - Intelligence scales independently
4. **Observability** - Better metrics and error tracking
