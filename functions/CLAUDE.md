# Cloud Functions

**Google Cloud Functions** for scheduled background tasks.

## Purpose

Firebase/Cloud Functions that run on schedules (via Cloud Scheduler) for:
- Memory evolution and optimization
- Proactive outreach scheduling
- Data summarization

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Function exports entry point |
| `evolution-scheduler.ts` | Memory evolution scheduling |
| `optimization-scheduler.ts` | Memory optimization tasks |
| `optimizer-scheduler.ts` | Performance optimization |
| `outreach-scheduler.ts` | Proactive outreach timing |
| `summarization-scheduler.ts` | Conversation summarization |

## Deployment

```bash
# Deploy all functions
cd functions
npm run deploy

# Deploy specific function
firebase deploy --only functions:functionName
```

## Local Development

```bash
cd functions
npm install
npm run build

# Run locally with emulator
firebase emulators:start --only functions
```

## Configuration

- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `.gcloudignore` - Files to exclude from deployment

## Cloud Scheduler Integration

These functions are triggered by Cloud Scheduler jobs defined in:
- `infra/cloud-scheduler-jobs.yaml`
- `infra/cloud-scheduler-memory.yaml`

## Related

- `infra/` - Cloud Scheduler job definitions
- `src/services/` - Core service implementations called by these functions
