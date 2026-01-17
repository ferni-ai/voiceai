# Async Worker

Cloud Run service for background processing - outreach, scheduled jobs, and async operations.

## Purpose

Offloads async work from the voice agent to prevent memory issues and ensure reliability. Processes outreach triggers via Pub/Sub.

## Architecture

```
Voice Agent → Pub/Sub → Async Workers → Cloud Tasks → Delivery
              (async)   (process)       (schedule)   (sms/push/email)
```

## Key Files

```
src/
├── index.ts              # Package exports
├── server.ts             # HTTP server (Cloud Run entry)
├── types.ts              # Shared types
├── logger.ts             # Pino logger setup
├── outreach/
│   ├── processor.ts      # Trigger processing logic
│   └── decision-engine.ts # Delivery decisions
└── pubsub/
    └── publisher.ts      # Pub/Sub client
```

## Build & Run

```bash
cd apps/async

# Development
pnpm dev         # Hot reload on port 8080

# Build
pnpm build       # Full TypeScript build
pnpm build:fast  # esbuild (faster, no type checking)
pnpm typecheck   # Type check only

# Test
pnpm test
```

## Deployment

```bash
# Via Ferni CLI (recommended)
ferni deploy async

# Manual
gcloud builds submit --config=cloudbuild-async.yaml
```

## Endpoints

| Endpoint | Method | Trigger | Description |
|----------|--------|---------|-------------|
| `/health` | GET | Any | Health check |
| `/process-trigger` | POST | Pub/Sub | Process single trigger |
| `/process-batch` | POST | Cloud Scheduler | Batch processing |
| `/test-trigger/:id` | POST | Manual | Test specific trigger |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | `johnb-2025` | GCP project |
| `PORT` | `8080` | Server port |
| `DRY_RUN` | `false` | Skip delivery |
| `OUTREACH_PUBSUB_ENABLED` | `false` | Enable Pub/Sub |

## Integration

Voice agent publishes events to this service:

```typescript
import { publishOutreachEvent } from '../services/outreach-publisher.js';

await publishOutreachEvent({
  userId,
  triggerId: 'morning_checkin',
  channels: ['push', 'sms'],
});
```
