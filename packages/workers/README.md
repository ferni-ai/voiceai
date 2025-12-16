# @ferni/workers

Async worker platform for Ferni - outreach, scheduled jobs, background processing.

## Architecture

This package runs as a separate Cloud Run service, processing outreach triggers that were previously embedded in the voice agent (causing memory issues).

```
Voice Agent → Pub/Sub → Workers → Cloud Tasks → Delivery
               (async)   (process)  (schedule)   (sms/push/email)
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

# From this package
cd packages/workers
pnpm dev         # Start with hot reload
pnpm build       # Build TypeScript
pnpm typecheck   # Type check only
```

## Deployment

```bash
# Deploy to Cloud Run
gcloud builds submit --config=cloudbuild-workers.yaml

# Or via Ferni CLI (when implemented)
ferni deploy workers
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | `johnb-2025` | GCP project ID |
| `PORT` | `8080` | Server port |
| `DRY_RUN` | `false` | Skip actual delivery |
| `LOG_LEVEL` | `info` | Logging level |

## Testing

```bash
# Run tests
pnpm test

# Test a specific trigger locally
curl -X POST http://localhost:8080/test-trigger/TRIGGER_ID?dryRun=true
```
