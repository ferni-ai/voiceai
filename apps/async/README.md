# @ferni/async

Async worker platform for Ferni - outreach, scheduled jobs, background processing.

## Architecture

This app runs as a separate Cloud Run service, processing outreach triggers that were previously embedded in the voice agent (causing memory issues).

```
Voice Agent → Pub/Sub → Async Workers → Cloud Tasks → Delivery
               (async)   (process)       (schedule)   (sms/push/email)
```

## Endpoints

| Endpoint | Method | Trigger | Description |
|----------|--------|---------|-------------|
| `/health` | GET | Any | Health check |
| `/process-trigger` | POST | Pub/Sub | Process single trigger from queue |
| `/process-batch` | POST | Cloud Scheduler | Process batch of pending triggers |
| `/test-trigger/:id` | POST | Manual | Test processing a specific trigger |

## Development

```bash
# From repo root
pnpm install

# From this directory
cd apps/async
pnpm dev         # Start with hot reload (port 8080)
pnpm build       # Build TypeScript (full type checking)
pnpm build:fast  # Build with esbuild (faster, no type checking)
pnpm typecheck   # Type check only
pnpm test        # Run tests
```

## Deployment

```bash
# Deploy to Cloud Run via Ferni CLI
ferni deploy async

# Or manually via Cloud Build
gcloud builds submit --config=cloudbuild-async.yaml
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | `johnb-2025` | GCP project ID |
| `PORT` | `8080` | Server port |
| `DRY_RUN` | `false` | Skip actual delivery |
| `LOG_LEVEL` | `info` | Logging level |
| `OUTREACH_PUBSUB_ENABLED` | `false` | Enable Pub/Sub publishing |

## Testing

```bash
# Run tests
pnpm test

# Test a specific trigger locally
curl -X POST http://localhost:8080/test-trigger/TRIGGER_ID?dryRun=true

# Test health endpoint
curl http://localhost:8080/health
```

## Project Structure

```
apps/async/
├── src/
│   ├── index.ts              # Package exports
│   ├── server.ts             # HTTP server (Cloud Run entry)
│   ├── types.ts              # Shared types
│   ├── logger.ts             # Pino logger setup
│   ├── outreach/
│   │   ├── processor.ts      # Trigger processing logic
│   │   └── decision-engine.ts # Delivery decisions
│   └── pubsub/
│       └── publisher.ts      # Pub/Sub client
├── Dockerfile                # Container build
├── package.json
├── tsconfig.json
└── esbuild.config.js         # Fast build config
```

